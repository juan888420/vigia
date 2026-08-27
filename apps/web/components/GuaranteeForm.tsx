"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ContractEvent, GuaranteePayload, GuaranteeType } from "@/lib/api";
import { eventLabel, insurableEvents } from "@/lib/event-form";
import {
  EMPTY_GUARANTEE_FORM,
  GUARANTEE_TYPE_OPTIONS,
  toGuaranteePayload,
  type GuaranteeFormValues,
} from "@/lib/guarantee-form";

// Los eventos amparables llegan por props desde el server component, así que
// el select no depende de un fetch en cliente ni puede quedarse vacío por un
// fallo de red. La opción por defecto no es "vacío": es "garantía inicial del
// contrato", que es un dato con significado propio (coversEventId = null).

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

interface GuaranteeFormProps {
  initialValues?: GuaranteeFormValues;
  events: ContractEvent[];
  submitLabel: string;
  submittingLabel: string;
  backHref: string;
  onSubmit: (payload: GuaranteePayload) => Promise<unknown>;
}

export function GuaranteeForm({
  initialValues = EMPTY_GUARANTEE_FORM,
  events,
  submitLabel,
  submittingLabel,
  backHref,
  onSubmit,
}: GuaranteeFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<GuaranteeFormValues>(initialValues);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Solo otrosíes, adiciones y prórrogas: una terminación o una liquidación no
  // modifican valor ni plazo, así que no hay nada que amparar.
  const coverable = insurableEvents(events);

  function update<K extends keyof GuaranteeFormValues>(key: K, value: GuaranteeFormValues[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(toGuaranteePayload(form));
      router.push(backHref);
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Error al guardar la póliza");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Amparo">
          <select
            value={form.type}
            onChange={(e) => update("type", e.target.value as GuaranteeType)}
            className={inputClass}
          >
            {GUARANTEE_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Número de póliza">
          <input
            required
            value={form.policyNumber}
            onChange={(e) => update("policyNumber", e.target.value)}
            placeholder="85-44-101000123"
            className={`${inputClass} font-mono`}
          />
        </Field>
      </div>

      <Field label="Qué ampara">
        <select
          value={form.coversEventId}
          onChange={(e) => update("coversEventId", e.target.value)}
          className={inputClass}
        >
          <option value="">Garantía inicial del contrato</option>
          {coverable.map((event) => (
            <option key={event.id} value={event.id}>
              {eventLabel(event)} — {event.eventDate}
            </option>
          ))}
        </select>
        {coverable.length === 0 && (
          <span className="mt-1.5 block text-xs text-text-muted">
            Este contrato no tiene otrosíes, adiciones ni prórrogas todavía, así que solo puede
            haber garantía inicial.
          </span>
        )}
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Aseguradora" hint="opcional">
          <input
            value={form.insurer}
            onChange={(e) => update("insurer", e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="Valor asegurado" hint="opcional">
          <input
            inputMode="decimal"
            value={form.insuredValue}
            onChange={(e) => update("insuredValue", e.target.value)}
            placeholder="19999654.90"
            className={`${inputClass} font-mono`}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Vigente desde" hint="opcional">
          <input
            type="date"
            value={form.validFrom}
            onChange={(e) => update("validFrom", e.target.value)}
            className={`${inputClass} font-mono`}
          />
        </Field>

        <Field label="Vigente hasta" hint="opcional">
          <input
            type="date"
            value={form.validUntil}
            onChange={(e) => update("validUntil", e.target.value)}
            className={`${inputClass} font-mono`}
          />
        </Field>
      </div>

      <Field label="Fecha de aprobación" hint="por la entidad, opcional">
        <input
          type="date"
          value={form.approvedAt}
          onChange={(e) => update("approvedAt", e.target.value)}
          className={`${inputClass} font-mono`}
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
