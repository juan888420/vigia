import type { Payment, PaymentPayload, PaymentStatus } from "./api";

// Módulo neutro (sin "use client"), igual que lib/contract-form.ts: las
// pantallas de pagos son server components y construyen los valores iniciales
// antes de entregárselos al formulario, que sí es cliente.

/** El estado es una lista fija del enum, no un catálogo de base de datos: no
 *  necesita un GET propio ni el patrón loading/ready/error. */
export const PAYMENT_STATUS_OPTIONS: { value: PaymentStatus; label: string }[] = [
  { value: "REGISTERED", label: "Registrado" },
  { value: "PAID", label: "Pagado" },
  { value: "CANCELLED", label: "Cancelado" },
];

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  REGISTERED: "Registrado",
  PAID: "Pagado",
  CANCELLED: "Cancelado",
};

export interface PaymentFormValues {
  sequenceNumber: string;
  value: string;
  actDate: string;
  paidAt: string;
  status: PaymentStatus;
  isAdvance: boolean;
  notes: string;
}

export const EMPTY_PAYMENT_FORM: PaymentFormValues = {
  sequenceNumber: "",
  value: "",
  actDate: "",
  paidAt: "",
  status: "REGISTERED",
  isAdvance: false,
  notes: "",
};

function nullIfEmpty(value: string) {
  return value.trim() === "" ? null : value.trim();
}

/** Los campos vacíos viajan como null: una cadena vacía en la base sería
 *  indistinguible de un dato realmente cargado. El monto viaja como string
 *  crudo, sin separadores de miles — el formato es solo para mostrar. */
export function toPaymentPayload(form: PaymentFormValues): PaymentPayload {
  return {
    sequenceNumber: Number(form.sequenceNumber),
    value: form.value.trim(),
    actDate: nullIfEmpty(form.actDate),
    paidAt: nullIfEmpty(form.paidAt),
    status: form.status,
    isAdvance: form.isAdvance,
    notes: nullIfEmpty(form.notes),
  };
}

/** Precarga del formulario de edición. `value` se copia tal como lo devuelve
 *  el API ("99998274.5"), sin formatear. */
export function paymentToFormValues(payment: Payment): PaymentFormValues {
  return {
    sequenceNumber: String(payment.sequenceNumber),
    value: payment.value,
    actDate: payment.actDate ?? "",
    paidAt: payment.paidAt ?? "",
    status: payment.status,
    isAdvance: payment.isAdvance,
    notes: payment.notes ?? "",
  };
}

/** Siguiente número libre sugerido al crear. Es una comodidad del formulario:
 *  no detecta huecos en la secuencia — eso es del motor de reglas. */
export function nextSequenceNumber(payments: Payment[]): string {
  const highest = payments.reduce((max, p) => Math.max(max, p.sequenceNumber), 0);
  return String(highest + 1);
}
