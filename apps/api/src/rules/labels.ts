import type { ContractEvent, EventType, GuaranteeType, Payment } from "@prisma/client";

// Textos legibles para los mensajes de los hallazgos. Duplican a propósito los
// de apps/web (lib/event-form.ts, lib/guarantee-form.ts): el mensaje se compone
// en el API, que no puede importar del front, y son la misma nomenclatura del
// expediente.

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  AMENDMENT: "Otrosí",
  ADDITION: "Adición",
  EXTENSION: "Prórroga",
  SUSPENSION: "Suspensión",
  RESUMPTION: "Reinicio",
  TERMINATION: "Terminación",
  LIQUIDATION: "Liquidación",
};

export const GUARANTEE_TYPE_LABELS: Record<GuaranteeType, string> = {
  CUMPLIMIENTO: "Cumplimiento",
  RESPONSABILIDAD_CIVIL: "Responsabilidad civil",
  SALARIOS_PRESTACIONES: "Salarios y prestaciones",
  ESTABILIDAD_OBRA: "Estabilidad de la obra",
  ANTICIPO: "Buen manejo del anticipo",
  CALIDAD: "Calidad",
  OTRA: "Otra",
};

/** "Otrosí 1", "Terminación". */
export function eventLabel(event: ContractEvent): string {
  const base = EVENT_TYPE_LABELS[event.type];
  return event.sequenceNumber === null ? base : `${base} ${event.sequenceNumber}`;
}

export function paymentLabel(payment: Payment): string {
  return `Pago ${payment.sequenceNumber}`;
}

const currency = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

/** Solo para el texto del mensaje. El valor exacto viaja aparte, como string
 *  sin formatear, para que nadie tenga que parsear un mensaje. */
export function formatMoney(value: { toString(): string }): string {
  return currency.format(Number(value.toString()));
}
