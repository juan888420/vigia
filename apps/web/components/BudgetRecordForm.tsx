"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { BudgetRecordPayload, BudgetRecordType, ContractEvent } from "@/lib/api";
import { eventLabel, fundableEvents } from "@/lib/event-form";
import {
  BUDGET_RECORD_TYPE_OPTIONS,
  EMPTY_BUDGET_RECORD_FORM,
  toBudgetRecordPayload,
  type BudgetRecordFormValues,
} from "@/lib/budget-form";
import { MoneyInput } from "@/components/MoneyInput";

// Los eventos que pueden respaldarse llegan por props desde el server
// component, así que el select no depende de un fetch en cliente. La opción
// por defecto no es "vacío": es "presupuesto inicial del contrato", que es un
// dato con significado propio (eventId = null).

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

interface BudgetRecordFormProps {
  initialValues?: BudgetRecordFormValues;
  events: ContractEvent[];
  submitLabel: string;
  submittingLabel: string;
  backHref: string;
  onSubmit: (payload: BudgetRecordPayload) => Promise<unknown>;
}

export function BudgetRecordForm({
  initialValues = EMPTY_BUDGET_RECORD_FORM,
  events,
  submitLabel,
  submittingLabel,
  backHref,
  onSubmit,
}: BudgetRecordFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<BudgetRecordFormValues>(initialValues);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Solo adiciones y otrosíes: una prórroga o una suspensión no mueven el
  // presupuesto, así que no hay nada que respaldar.
  const fundable = fundableEvents(events);

  function update<K extends keyof BudgetRecordFormValues>(key: K, value: BudgetRecordFormValues[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(toBudgetRecordPayload(form));
      router.push(backHref);
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Error al guardar el respaldo");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Tipo">
          <select
            value={form.type}
            onChange={(e) => update("type", e.target.value as BudgetRecordType)}
            className={inputClass}
          >
            {BUDGET_RECORD_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Número">
          <input
            required
            value={form.number}
            onChange={(e) => update("number", e.target.value)}
            placeholder="121"
            className={`${inputClass} font-mono`}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Valor">
          <MoneyInput
            required
            value={form.value}
            onChange={(plain) => update("value", plain)}
            placeholder="547.262.975"
            className={`${inputClass} font-mono`}
          />
        </Field>

        <Field label="Fecha de expedición" hint="opcional">
          <input
            type="date"
            value={form.issuedAt}
            onChange={(e) => update("issuedAt", e.target.value)}
            className={`${inputClass} font-mono`}
          />
        </Field>
      </div>

      <Field label="Qué respalda">
        <select
          value={form.eventId}
          onChange={(e) => update("eventId", e.target.value)}
          className={inputClass}
        >
          <option value="">Presupuesto inicial del contrato</option>
          {fundable.map((event) => (
            <option key={event.id} value={event.id}>
              {eventLabel(event)} — {event.eventDate}
            </option>
          ))}
        </select>
        {fundable.length === 0 && (
          <span className="mt-1.5 block text-xs text-text-muted">
            Este contrato no tiene adiciones ni otrosíes todavía, así que todos los respaldos son
            del presupuesto inicial. Un contrato puede tener varios cuando se compone de partidas
            que no pueden mezclarse.
          </span>
        )}
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
