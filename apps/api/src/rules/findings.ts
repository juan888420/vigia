import { Prisma } from "@prisma/client";
import type {
  AlertSeverity,
  BudgetRecord,
  ContractDocument,
  ContractEvent,
  Guarantee,
  Payment,
} from "@prisma/client";
import { isPresent } from "./checklist";
import { daysBetween, formatDate } from "./dates";
import { hasRegisteredRp } from "./derived";
import { EVENT_TYPE_LABELS, GUARANTEE_TYPE_LABELS, eventLabel, formatMoney, paymentLabel } from "./labels";
import type {
  ChecklistItem,
  CurrentEndDate,
  DiagnosticInput,
  Finding,
  FindingReference,
  RequirementWithType,
  RuleCode,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Parte 2 — reglas de coherencia. Cada función devuelve los hallazgos de una
// sola regla; el orquestador (engine.ts) las concatena.
//
// Todo hallazgo lleva las referencias a los registros que lo sustentan. Es lo
// que permite responder "¿de dónde salió esto?" señalando la fila exacta, en
// vez de un mensaje que hay que creer.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Severidad por regla. Es un eje distinto del estado general (Parte 3): la
 * severidad describe el hallazgo suelto, el estado combina todos. Se dejan
 * separados a propósito, para poder subir la severidad de una regla sin que
 * eso cambie por accidente cuándo un contrato pasa a "atrasado".
 */
const SEVERITY: Record<RuleCode, AlertSeverity> = {
  VENCIDO_SIN_TERMINACION: "CRITICAL",
  MODIFICACION_SIN_GARANTIA: "CRITICAL",
  SIN_GARANTIAS_INICIALES: "CRITICAL",
  POLIZA_VENCIDA: "CRITICAL",
  SALDO_NEGATIVO: "CRITICAL",
  AVISO_5_DIAS: "CRITICAL",
  // El respaldo documental de una modificación pesa menos que su garantía: que
  // falte el otrosí escaneado no invalida jurídicamente el acto, solo deja el
  // expediente incompleto.
  MODIFICACION_SIN_DOCUMENTO: "WARNING",
  DOCUMENTO_FALTANTE: "WARNING",
  DOCUMENTO_FALTANTE_PAGO: "WARNING",
  SALTO_SECUENCIA_EVENTO: "WARNING",
  SALTO_SECUENCIA_PAGO: "WARNING",
  PRESUPUESTO_DESCUADRADO: "WARNING",
  PAGO_ANTICIPO_Y_FINAL: "WARNING",
  POLIZA_POR_VENCER: "WARNING",
  AVISO_15_DIAS: "INFO",
};

function finding(ruleCode: RuleCode, message: string, references: FindingReference[]): Finding {
  return { ruleCode, severity: SEVERITY[ruleCode], message, references };
}

const eventRef = (event: ContractEvent): FindingReference => ({
  kind: "event",
  id: event.id,
  label: eventLabel(event),
});

const paymentRef = (payment: Payment): FindingReference => ({
  kind: "payment",
  id: payment.id,
  label: paymentLabel(payment),
});

const guaranteeRef = (guarantee: Guarantee): FindingReference => ({
  kind: "guarantee",
  id: guarantee.id,
  label: `Póliza ${guarantee.policyNumber}`,
});

const documentTypeRef = (requirement: RequirementWithType): FindingReference => ({
  kind: "documentType",
  id: requirement.documentTypeId,
  label: requirement.documentType.name,
});

// ── 2.1 Documento obligatorio faltante, a nivel de contrato ──────────────────
//
// La comparación ya está hecha en el checklist (rules/checklist.ts): aquí solo
// se traduce a hallazgos lo que quedó ausente y sigue siendo obligatorio.

export function missingContractDocuments(checklist: ChecklistItem[]): Finding[] {
  return checklist
    .filter((item) => item.required && !item.requirement.appliesToEachPayment && !item.present)
    .map((item) =>
      finding(
        "DOCUMENTO_FALTANTE",
        `Falta el documento obligatorio "${item.requirement.documentType.name}".`,
        [documentTypeRef(item.requirement)],
      ),
    );
}

// ── 2.2 Soporte de pago faltante ─────────────────────────────────────────────

export function missingPaymentDocuments(
  checklist: ChecklistItem[],
  payments: Payment[],
): Finding[] {
  const perPayment = checklist.filter(
    (item) => item.required && item.requirement.appliesToEachPayment,
  );
  if (perPayment.length === 0) return [];

  // Se recorre por pago y dentro por requisito, no al revés: el expediente se
  // lee pago a pago, y así los hallazgos de un mismo pago salen juntos.
  const findings: Finding[] = [];
  for (const payment of [...payments].sort((a, b) => a.sequenceNumber - b.sequenceNumber)) {
    for (const item of perPayment) {
      if (!item.missingForPayments.some((missing) => missing.id === payment.id)) continue;
      findings.push(
        finding(
          "DOCUMENTO_FALTANTE_PAGO",
          `Al pago ${payment.sequenceNumber} le falta el soporte obligatorio "${item.requirement.documentType.name}".`,
          [paymentRef(payment), documentTypeRef(item.requirement)],
        ),
      );
    }
  }
  return findings;
}

// ── 2.3 Modificación sin garantía que la ampare ──────────────────────────────

/** Eventos que cambian valor o plazo y por tanto deben quedar amparados. */
const INSURABLE_EVENT_TYPES = new Set(["AMENDMENT", "ADDITION", "EXTENSION"]);

export function modificationsWithoutGuarantee(
  events: ContractEvent[],
  guarantees: Guarantee[],
): Finding[] {
  const covered = new Set(
    guarantees
      .map((guarantee) => guarantee.coversEventId)
      .filter((id): id is string => id !== null),
  );

  return events
    .filter((event) => INSURABLE_EVENT_TYPES.has(event.type))
    .filter((event) => !covered.has(event.id))
    .map((event) =>
      finding(
        "MODIFICACION_SIN_GARANTIA",
        `${eventLabel(event)} (${formatDate(event.eventDate)}) no tiene ninguna garantía que la ampare.`,
        [eventRef(event)],
      ),
    );
}

/**
 * Respaldo documental de cada modificación. Es la otra mitad de la regla
 * anterior: 2.3 verifica que el acto quede amparado por una póliza, esta que
 * el acto exista como documento en el expediente.
 *
 * Se busca por `ContractDocument.eventId`, no por tipo documental: la
 * plantilla no puede exigir "un OTROSI por cada modificación" — solo sabe
 * decir "obligatorio siempre" u "opcional" —, y por eso el requisito OTROSI
 * está sembrado como opcional. La comprobación cruzada es de aquí.
 */
export function modificationsWithoutDocument(
  events: ContractEvent[],
  documents: ContractDocument[],
): Finding[] {
  const documented = new Set(
    documents
      .filter(isPresent)
      .map((document) => document.eventId)
      .filter((id): id is string => id !== null),
  );

  return events
    .filter((event) => INSURABLE_EVENT_TYPES.has(event.type))
    .filter((event) => !documented.has(event.id))
    .map((event) =>
      finding(
        "MODIFICACION_SIN_DOCUMENTO",
        `${eventLabel(event)} (${formatDate(event.eventDate)}) no tiene ningún documento que la respalde en el expediente.`,
        [eventRef(event)],
      ),
    );
}

// ── 2.4 Acta de inicio sin ninguna garantía ──────────────────────────────────

export function startedWithoutGuarantees(
  startDate: Date | null,
  guarantees: Guarantee[],
): Finding[] {
  if (startDate === null || guarantees.length > 0) return [];
  return [
    finding(
      "SIN_GARANTIAS_INICIALES",
      `El contrato tiene acta de inicio (${formatDate(startDate)}) y no hay ninguna garantía registrada.`,
      [],
    ),
  ];
}

// ── 2.5 Huecos de secuencia ──────────────────────────────────────────────────

/**
 * Números ausentes entre el menor y el mayor de los registrados. Un hueco solo
 * es detectable entre dos números existentes: si el expediente empieza en el 2,
 * no hay forma determinística de saber si falta el 1 o si la numeración de esa
 * oficina no empieza en 1.
 */
function gapsIn(numbers: number[]): number[] {
  if (numbers.length < 2) return [];
  const present = new Set(numbers);
  const missing: number[] = [];
  for (let n = Math.min(...numbers) + 1; n < Math.max(...numbers); n += 1) {
    if (!present.has(n)) missing.push(n);
  }
  return missing;
}

const plural = (items: unknown[]) => (items.length > 1 ? "n" : "");

/** Tipos de evento que se numeran. Terminación y liquidación no: son actos
 *  únicos por contrato (índices parciales de la migración). */
const NUMBERED_EVENT_TYPES = [
  "AMENDMENT",
  "ADDITION",
  "EXTENSION",
  "SUSPENSION",
  "RESUMPTION",
] as const;

export function eventSequenceGaps(events: ContractEvent[]): Finding[] {
  const findings: Finding[] = [];

  for (const type of NUMBERED_EVENT_TYPES) {
    const ofType = events.filter((event) => event.type === type && event.sequenceNumber !== null);
    const numbers = ofType.map((event) => event.sequenceNumber as number);
    const missing = gapsIn(numbers);
    if (missing.length === 0) continue;

    findings.push(
      finding(
        "SALTO_SECUENCIA_EVENTO",
        `Salto en la numeración de ${EVENT_TYPE_LABELS[type]}: falta${plural(missing)} ${missing.join(", ")} (registrados ${[...numbers].sort((a, b) => a - b).join(", ")}).`,
        ofType.map(eventRef),
      ),
    );
  }

  return findings;
}

export function paymentSequenceGaps(payments: Payment[]): Finding[] {
  const numbers = payments.map((payment) => payment.sequenceNumber);
  const missing = gapsIn(numbers);
  if (missing.length === 0) return [];

  return [
    finding(
      "SALTO_SECUENCIA_PAGO",
      `Salto en la numeración de los pagos: falta${plural(missing)} ${missing.join(", ")} (registrados ${[...numbers].sort((a, b) => a - b).join(", ")}).`,
      payments.map(paymentRef),
    ),
  ];
}

// ── 2.6 Descuadre presupuestal ───────────────────────────────────────────────

/**
 * Solo se compara cuando hay al menos un RP cargado. Un contrato sin RP no
 * está descuadrado: está a medio cargar — puede tener su CDP y todavía no
 * haberse perfeccionado el compromiso —, y ese vacío ya lo reporta
 * DOCUMENTO_FALTANTE sobre el RP. Sin esta condición, todo expediente sin RP
 * saldría con un descuadre igual a su valor total.
 *
 * La condición mira el tipo, no el conteo: desde que el respaldo son solo los
 * RP (ver computeBudgetBackingTotal), un contrato con CDP y sin RP compararía
 * contra cero. Se comparte con computeBudgetBackingStatus para que el hallazgo
 * y lo que muestra la pantalla no puedan contradecirse.
 */
export function budgetMismatch(
  currentValue: Prisma.Decimal,
  backingTotal: Prisma.Decimal,
  budgetRecords: BudgetRecord[],
): Finding[] {
  if (!hasRegisteredRp(budgetRecords)) return [];
  if (backingTotal.equals(currentValue)) return [];
  return [
    finding(
      "PRESUPUESTO_DESCUADRADO",
      `El respaldo presupuestal registrado en RP (${formatMoney(backingTotal)}) no coincide con el valor vigente del contrato (${formatMoney(currentValue)}).`,
      [],
    ),
  ];
}

/**
 * Se ha pagado más de lo que el contrato vale hoy. Aritmética pura: no hay
 * interpretación posible: o los pagos están mal cargados, o falta registrar
 * una adición que ya ocurrió. En cualquiera de los dos casos el expediente no
 * puede darse por bueno.
 */
export function negativeBalance(balance: Prisma.Decimal): Finding[] {
  if (balance.greaterThanOrEqualTo(0)) return [];
  return [
    finding(
      "SALDO_NEGATIVO",
      `Lo pagado supera el valor vigente del contrato: el saldo es ${formatMoney(balance)}.`,
      [],
    ),
  ];
}

// ── 2.7 Pago marcado como anticipo y final a la vez ──────────────────────────

export function advanceAndFinalPayments(payments: Payment[]): Finding[] {
  return payments
    .filter((payment) => payment.isAdvance && payment.isFinal)
    .map((payment) =>
      finding(
        "PAGO_ANTICIPO_Y_FINAL",
        `El pago ${payment.sequenceNumber} está marcado como anticipo y como pago final a la vez.`,
        [paymentRef(payment)],
      ),
    );
}

// ── 2.8 / 2.9 Vencimientos ───────────────────────────────────────────────────

const NOTICE_DAYS = 15;
const IMMINENT_DAYS = 5;

/**
 * Vencimiento del contrato. Solo se evalúa cuando la fecha vigente es
 * calculable: con una suspensión abierta la fecha real depende de cuándo se
 * reanude, y avisar "vence en 3 días" sobre una fecha que no rige sería peor
 * que no avisar.
 */
export function contractDeadlineFindings(
  currentEndDate: CurrentEndDate,
  events: ContractEvent[],
  today: Date,
): Finding[] {
  if (currentEndDate.state !== "CALCULADA") return [];
  if (events.some((event) => event.type === "TERMINATION")) return [];

  const endDate = currentEndDate.date;
  const remaining = daysBetween(today, endDate);

  if (remaining < 0) {
    return [
      finding(
        "VENCIDO_SIN_TERMINACION",
        `La fecha de terminación vigente (${formatDate(endDate)}) pasó hace ${-remaining} días y no hay acta de terminación registrada.`,
        [],
      ),
    ];
  }

  const findings: Finding[] = [];
  if (remaining <= NOTICE_DAYS) {
    findings.push(
      finding(
        "AVISO_15_DIAS",
        `El contrato termina el ${formatDate(endDate)} (faltan ${remaining} días): gestionar modificaciones o adiciones a tiempo.`,
        [],
      ),
    );
  }
  if (remaining <= IMMINENT_DAYS) {
    findings.push(
      finding(
        "AVISO_5_DIAS",
        `Finalización inminente: el contrato termina el ${formatDate(endDate)} (faltan ${remaining} días).`,
        [],
      ),
    );
  }
  return findings;
}

/**
 * Pólizas próximas a vencer, con los mismos umbrales del contrato.
 *
 * INFERENCIA, NO REGLA CONFIRMADA. El cliente fijó 15 y 5 días para el
 * vencimiento del CONTRATO; nunca dijo qué anticipación quiere para las
 * pólizas. Reutilizar sus umbrales es lo razonable mientras tanto, pero hay
 * que validarlo con él: renovar una póliza depende de la aseguradora y no de
 * la entidad, así que puede necesitar más margen.
 *
 * "Activa" = tiene fecha de vencimiento y todavía no ha pasado. Una póliza ya
 * vencida no produce este hallazgo: sería otra regla, que el cliente tampoco
 * ha confirmado.
 */
export function guaranteeExpiryFindings(guarantees: Guarantee[], today: Date): Finding[] {
  const findings: Finding[] = [];

  for (const guarantee of guarantees) {
    if (guarantee.validUntil === null) continue;
    const remaining = daysBetween(today, guarantee.validUntil);
    if (remaining < 0 || remaining > NOTICE_DAYS) continue;

    findings.push(
      finding(
        "POLIZA_POR_VENCER",
        `La póliza ${guarantee.policyNumber} (${GUARANTEE_TYPE_LABELS[guarantee.type]}) vence el ${formatDate(guarantee.validUntil)} (faltan ${remaining} días).`,
        [guaranteeRef(guarantee)],
      ),
    );
  }

  return findings;
}

/**
 * Pólizas cuya vigencia ya terminó. Distinta de POLIZA_POR_VENCER, que avisa
 * de un vencimiento futuro: aquí el contrato ya está descubierto, y por eso es
 * CRITICAL en vez de un aviso.
 *
 * La liquidación es la única excusa válida: liquidado el contrato, cerradas
 * las obligaciones, que las pólizas hayan expirado es lo normal. Mientras no
 * exista ese acto, una póliza vencida es un contrato sin amparo.
 */
export function expiredGuaranteeFindings(
  guarantees: Guarantee[],
  events: ContractEvent[],
  today: Date,
): Finding[] {
  if (events.some((event) => event.type === "LIQUIDATION")) return [];

  return guarantees
    .filter((guarantee) => guarantee.validUntil !== null && guarantee.validUntil < today)
    .map((guarantee) =>
      finding(
        "POLIZA_VENCIDA",
        `La póliza ${guarantee.policyNumber} (${GUARANTEE_TYPE_LABELS[guarantee.type]}) venció el ${formatDate(guarantee.validUntil as Date)} y el contrato no está liquidado.`,
        [guaranteeRef(guarantee)],
      ),
    );
}

/** Todos los hallazgos de la Parte 2, en un orden estable: primero lo que
 *  bloquea, después lo que falta por completar. */
export function collectFindings(
  input: DiagnosticInput,
  checklist: ChecklistItem[],
  currentValue: Prisma.Decimal,
  currentEndDate: CurrentEndDate,
  backingTotal: Prisma.Decimal,
  balance: Prisma.Decimal,
): Finding[] {
  return [
    ...contractDeadlineFindings(currentEndDate, input.events, input.today),
    ...negativeBalance(balance),
    ...modificationsWithoutGuarantee(input.events, input.guarantees),
    ...expiredGuaranteeFindings(input.guarantees, input.events, input.today),
    ...startedWithoutGuarantees(input.contract.startDate, input.guarantees),
    ...guaranteeExpiryFindings(input.guarantees, input.today),
    ...budgetMismatch(currentValue, backingTotal, input.budgetRecords),
    ...modificationsWithoutDocument(input.events, input.documents),
    ...advanceAndFinalPayments(input.payments),
    ...eventSequenceGaps(input.events),
    ...paymentSequenceGaps(input.payments),
    ...missingContractDocuments(checklist),
    ...missingPaymentDocuments(checklist, input.payments),
  ];
}
