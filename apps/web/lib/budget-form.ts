import type { BudgetRecord, BudgetRecordPayload, BudgetRecordType } from "./api";

// Módulo neutro (sin "use client"), igual que contract-form, payment-form,
// event-form y guarantee-form.

export const BUDGET_RECORD_TYPE_OPTIONS: { value: BudgetRecordType; label: string }[] = [
  { value: "CDP", label: "CDP — Certificado de disponibilidad" },
  { value: "RP", label: "RP — Registro presupuestal" },
];

export const BUDGET_RECORD_TYPE_LABELS: Record<BudgetRecordType, string> = {
  CDP: "CDP",
  RP: "RP",
};

export interface BudgetRecordFormValues {
  type: BudgetRecordType;
  number: string;
  value: string;
  issuedAt: string;
  eventId: string;
}

export const EMPTY_BUDGET_RECORD_FORM: BudgetRecordFormValues = {
  type: "CDP",
  number: "",
  value: "",
  issuedAt: "",
  eventId: "",
};

function nullIfEmpty(value: string) {
  return value.trim() === "" ? null : value.trim();
}

/** `eventId` vacío = respaldo del presupuesto inicial, no un dato faltante.
 *  El monto viaja como string crudo, sin formatear. */
export function toBudgetRecordPayload(form: BudgetRecordFormValues): BudgetRecordPayload {
  return {
    type: form.type,
    number: form.number.trim(),
    value: form.value.trim(),
    issuedAt: nullIfEmpty(form.issuedAt),
    eventId: nullIfEmpty(form.eventId),
  };
}

export function budgetRecordToFormValues(record: BudgetRecord): BudgetRecordFormValues {
  return {
    type: record.type,
    number: record.number,
    value: record.value,
    issuedAt: record.issuedAt ?? "",
    eventId: record.eventId ?? "",
  };
}

// Aquí NO se suman respaldos. Existió un `sumBudgetRecords` que sumaba todas
// las filas sin mirar el tipo, y en CD-001-2025 daba $1.116.416.468: contaba
// el CDP 121 y el RP 00178 como dinero distinto cuando el segundo es el
// compromiso contra la reserva del primero. CDP y RP no son partidas
// acumulables — la regla vive en apps/api/src/rules/derived.ts y llega a la
// pantalla ya calculada, en `budgetBacking` del diagnóstico.
