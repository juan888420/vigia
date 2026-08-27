"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { PaymentPayload } from "@/lib/api";
import {
  EMPTY_PAYMENT_FORM,
  PAYMENT_STATUS_OPTIONS,
  toPaymentPayload,
  type PaymentFormValues,
} from "@/lib/payment-form";

// Formulario compartido por crear y editar un pago, igual que ContractForm. La
// única diferencia entre ambos flujos es qué hace `onSubmit`: POST o PATCH.
//
// A diferencia de ContractForm, aquí no hay ningún select que dependa de un
// fetch: el estado del pago es un enum fijo, así que no aplica el patrón
// loading/ready/error.

const inputClass =
  "w-full rounded-md border border-border bg-base px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-border-strong focus:outline-none";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs text-text-secondary">{label}</span>
      {hint && <span className="ml-1.5 text-xs text-text-muted">{hint}</span>}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

interface PaymentFormProps {
  initialValues?: PaymentFormValues;
  submitLabel: string;
  submittingLabel: string;
  /** A dónde volver tras guardar o cancelar: la lista de pagos del contrato. */
  backHref: string;
  onSubmit: (payload: PaymentPayload) => Promise<unknown>;
}

export function PaymentForm({
  initialValues = EMPTY_PAYMENT_FORM,
  submitLabel,
  submittingLabel,
  backHref,
  onSubmit,
}: PaymentFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<PaymentFormValues>(initialValues);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof PaymentFormValues>(key: K, value: PaymentFormValues[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await onSubmit(toPaymentPayload(form));
      router.push(backHref);
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Error al guardar el pago");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Número de pago" hint="1, 2, 3...">
          <input
            required
            inputMode="numeric"
            value={form.sequenceNumber}
            onChange={(e) => update("sequenceNumber", e.target.value)}
            placeholder="1"
            className={`${inputClass} font-mono`}
          />
        </Field>

        <Field label="Valor">
          <input
            required
            inputMode="decimal"
            value={form.value}
            onChange={(e) => update("value", e.target.value)}
            placeholder="50000000"
            className={`${inputClass} font-mono`}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Fecha del acta" hint="acta de recibo parcial, opcional">
          <input
            type="date"
            value={form.actDate}
            onChange={(e) => update("actDate", e.target.value)}
            className={`${inputClass} font-mono`}
          />
        </Field>

        <Field label="Fecha del giro" hint="opcional">
          <input
            type="date"
            value={form.paidAt}
            onChange={(e) => update("paidAt", e.target.value)}
            className={`${inputClass} font-mono`}
          />
        </Field>
      </div>

      <Field label="Estado" hint="administrativo, no documental">
        <select
          value={form.status}
          onChange={(e) => update("status", e.target.value as PaymentFormValues["status"])}
          className={inputClass}
        >
          {PAYMENT_STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>

      <label className="flex items-center gap-2.5">
        <input
          type="checkbox"
          checked={form.isAdvance}
          onChange={(e) => update("isAdvance", e.target.checked)}
          className="h-4 w-4 shrink-0 accent-accent"
        />
        <span className="text-sm text-text-secondary">Este pago es el anticipo</span>
      </label>

      <Field label="Notas" hint="opcional">
        <textarea
          rows={3}
          value={form.notes}
          onChange={(e) => update("notes", e.target.value)}
          className={`${inputClass} resize-y`}
        />
      </Field>

      {error && (
        <p className="rounded-lg border border-status-atrasado-dim bg-status-atrasado-dim/40 px-3 py-2.5 text-sm text-status-atrasado">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3 border-t border-border pt-5">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-base transition-colors hover:bg-accent/80 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? submittingLabel : submitLabel}
        </button>
        <Link href={backHref} className="text-sm text-text-secondary hover:text-text-primary">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
