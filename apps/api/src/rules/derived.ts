import { Prisma } from "@prisma/client";
import type {
  BudgetRecord,
  BudgetRecordType,
  Contract,
  ContractEvent,
  Payment,
} from "@prisma/client";
import { addDays, daysBetween } from "./dates";
import type { BudgetBackingStatus, CurrentEndDate } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Parte 1 — cálculos derivados. Aritmética pura sobre los datos registrados:
// aquí no hay criterio de negocio que discutir, solo sumas y días.
//
// El dinero se opera con Prisma.Decimal, nunca con number: los valores son
// Decimal(15,2) y un IEEE double redondearía en silencio un contrato de miles
// de millones de pesos.
// ─────────────────────────────────────────────────────────────────────────────

/** Tipos de evento que pueden mover el valor del contrato. */
const VALUE_EVENT_TYPES = new Set(["ADDITION", "AMENDMENT"]);

/** Tipos de evento que pueden mover el plazo mediante daysDelta. */
const TERM_EVENT_TYPES = new Set(["EXTENSION", "AMENDMENT"]);

/** Orden cronológico por eventDate; `createdAt` desempata para que dos actos
 *  del mismo día produzcan siempre el mismo resultado. */
function chronologically(a: ContractEvent, b: ContractEvent): number {
  const byDate = a.eventDate.getTime() - b.eventDate.getTime();
  if (byDate !== 0) return byDate;
  return a.createdAt.getTime() - b.createdAt.getTime();
}

/** 1.1 — valor inicial + adiciones y otrosíes que tocan valor. */
export function computeCurrentValue(contract: Contract, events: ContractEvent[]): Prisma.Decimal {
  return events.reduce(
    (total, event) =>
      VALUE_EVENT_TYPES.has(event.type) && event.valueDelta !== null
        ? total.plus(event.valueDelta)
        : total,
    new Prisma.Decimal(contract.initialValue),
  );
}

/**
 * 1.2 — fecha de terminación vigente.
 *
 * Parte de `initialEndDate` y recorre los eventos en orden cronológico:
 * las prórrogas suman sus días y cada suspensión ya reanudada suma el tiempo
 * que estuvo detenida (ese tiempo no consume plazo).
 *
 * Al llegar a una suspensión sin reinicio se detiene: a partir de ahí la fecha
 * real depende de cuándo se reanude, que todavía no se sabe. Lo acumulado
 * hasta ese punto es exactamente la fecha provisional — las suspensiones ya
 * cerradas y las prórrogas anteriores a la suspensión abierta.
 *
 * CONVENCIÓN DE CONTEO: `daysDelta` se aplica con suma plana (`addDays`), a
 * propósito. Representa el DESPLAZAMIENTO de una fecha de vencimiento, no una
 * duración: "tres meses más" sobre un contrato que vencía el 2025-08-27 es la
 * diferencia calendario hasta el 2025-11-27, o sea 92 días. Sumarle 1 aquí,
 * como si fuera un plazo, correría el vencimiento un día de más.
 *
 * Es una convención DISTINTA a la de `Contract.initialTermDays`, que sí es una
 * duración inclusiva: ahí el día de inicio cuenta como primer día del plazo
 * (ver `daysBetween` en apps/web/lib/contract-form.ts). Las dos son correctas
 * para lo que cada una representa y aquí no se mezclan: este cálculo parte de
 * `initialEndDate` y nunca lee `initialTermDays`.
 *
 * ⚠ Una regla futura que quiera verificar que `initialTermDays` cuadre con
 * (`initialEndDate` − `startDate`) NO puede usar el `addDays`/`daysBetween` de
 * este módulo: tiene que reproducir el conteo inclusivo del formulario
 * (diferencia + 1), o marcará como descuadrado todo contrato bien cargado.
 */
export function computeCurrentEndDate(
  contract: Contract,
  events: ContractEvent[],
): CurrentEndDate {
  if (contract.startDate === null || contract.initialEndDate === null) {
    return { state: "SIN_FECHAS_BASE" };
  }

  const timeline = events
    .filter(
      (event) =>
        event.type === "SUSPENSION" ||
        (TERM_EVENT_TYPES.has(event.type) && event.daysDelta !== null),
    )
    .sort(chronologically);

  let current = contract.initialEndDate;

  for (const event of timeline) {
    if (event.type === "SUSPENSION") {
      // `startDate` es el campo propio de la suspensión, pero el formulario
      // permite guardarla sin él: en ese caso la fecha del acto es la mejor
      // aproximación disponible al inicio del período suspendido.
      const suspendedFrom = event.startDate ?? event.eventDate;

      if (event.endDate === null) {
        return {
          state: "SUSPENDIDO",
          suspensionEventId: event.id,
          suspendedSince: suspendedFrom,
          provisionalDate: current,
        };
      }

      current = addDays(current, daysBetween(suspendedFrom, event.endDate));
      continue;
    }

    current = addDays(current, event.daysDelta as number);
  }

  return { state: "CALCULADA", date: current };
}

/** Pagos que cuentan contra el valor del contrato: un pago anulado no se giró. */
export function computePaidTotal(payments: Payment[]): Prisma.Decimal {
  return payments.reduce(
    (total, payment) => (payment.status === "CANCELLED" ? total : total.plus(payment.value)),
    new Prisma.Decimal(0),
  );
}

/** 1.3 — valor vigente menos lo pagado. */
export function computeBalance(
  currentValue: Prisma.Decimal,
  payments: Payment[],
): Prisma.Decimal {
  return currentValue.minus(computePaidTotal(payments));
}

/**
 * 1.4 — respaldo presupuestal: SOLO los RP.
 *
 * CDP y RP no son partidas acumulables. El CDP certifica que hay
 * disponibilidad antes de comprometer; el RP lo consume al perfeccionarse el
 * compromiso. Sumar ambos contaría dos veces el mismo dinero y todo expediente
 * completo aparecería con el doble de respaldo del que tiene.
 *
 * Que el total no cuadre con el valor vigente es un hallazgo (2.6), no un
 * error: el expediente puede estar a medio cargar.
 */
export function computeBudgetBackingTotal(records: BudgetRecord[]): Prisma.Decimal {
  return sumOfType(records, "RP");
}

/**
 * Disponibilidad certificada antes de comprometer. Se reporta aparte y NO se
 * compara contra el valor vigente: responde a otra pregunta ("¿hubo
 * disponibilidad suficiente?"), no a si el contrato quedó respaldado.
 */
export function computeCdpTotal(records: BudgetRecord[]): Prisma.Decimal {
  return sumOfType(records, "CDP");
}

/**
 * ¿Se registró ya el compromiso presupuestal?
 *
 * Condición única y compartida: la usa el estado del respaldo (más abajo) y la
 * regla 2.6 en findings.ts. Estaba escrita dos veces y las dos partes tenían
 * que coincidir para no contradecirse — reportar "no coincide" en la pantalla
 * mientras el motor calla el hallazgo, o al revés.
 */
export function hasRegisteredRp(records: BudgetRecord[]): boolean {
  return records.some((record) => record.type === "RP");
}

/**
 * Cómo se lee el respaldo frente al valor vigente. No es un booleano porque
 * son tres situaciones distintas: un contrato al que todavía no le han
 * registrado el RP no está descuadrado, está a medio cargar, y mostrarlo como
 * "no coincide" acusaría al expediente de algo que no ha pasado.
 */
export function computeBudgetBackingStatus(
  currentValue: Prisma.Decimal,
  backingTotal: Prisma.Decimal,
  records: BudgetRecord[],
): BudgetBackingStatus {
  if (!hasRegisteredRp(records)) return "SIN_RP";
  return backingTotal.equals(currentValue) ? "COINCIDE" : "NO_COINCIDE";
}

function sumOfType(records: BudgetRecord[], type: BudgetRecordType): Prisma.Decimal {
  return records.reduce(
    (total, record) => (record.type === type ? total.plus(record.value) : total),
    new Prisma.Decimal(0),
  );
}
