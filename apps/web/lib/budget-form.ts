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

/**
 * Suma de los respaldos, en centavos enteros, para no acumular error de coma
 * flotante sobre los Decimal(15,2) que devuelve el API. Se usa solo para
 * mostrar el total de lo cargado en pantalla: NO es el "valor vigente" del
 * contrato, que lo calculará el motor de reglas.
 */
export function sumBudgetRecords(records: BudgetRecord[]): string {
  const cents = records.reduce((total, record) => total + toCents(record.value), 0);
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

function toCents(value: string): number {
  const [whole, fraction = ""] = value.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0").slice(0, 2));
}
