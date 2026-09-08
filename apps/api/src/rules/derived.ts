import { Prisma } from "@prisma/client";
import type { BudgetRecord, Contract, ContractEvent, Payment } from "@prisma/client";
import { addDays, daysBetween } from "./dates";
import type { CurrentEndDate } from "./types";

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

/** 1.4 — suma de CDP y RP. Que no cuadre con el valor vigente es un hallazgo
 *  (2.6), no un error: el expediente puede estar a medio cargar. */
export function computeBudgetBackingTotal(records: BudgetRecord[]): Prisma.Decimal {
  return records.reduce(
    (total, record) => total.plus(record.value),
    new Prisma.Decimal(0),
  );
}
