"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import type { ContractEvent, EventPayload, EventType } from "@/lib/api";
import {
  EMPTY_EVENT_FORM,
  EVENT_TYPE_OPTIONS,
  eventLabel,
  fieldsForType,
  nextSequenceForType,
  resumableSuspensions,
  toEventPayload,
  type EventFormValues,
} from "@/lib/event-form";

// Formulario compartido por crear y editar, igual que ContractForm/PaymentForm.
//
// Los eventos del contrato llegan por props desde el server component: el
// select de suspensiones no depende de un fetch en cliente, así que no puede
// quedarse vacío por un fallo de red. Cuando no hay ninguna suspensión
// reanudable, se explica en vez de mostrar un select vacío.

const inputClass =
  "w-full rounded-md border border-border bg-base px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-border-strong focus:outline-none";

const readOnlyClass =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-secondary";

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

interface EventFormProps {
  initialValues?: EventFormValues;
  /** Todos los eventos del contrato, para numeración y para el select de reinicio. */
  events: ContractEvent[];
  /** El evento en edición, si lo hay: se excluye de sus propias validaciones. */
  currentEvent?: ContractEvent;
  submitLabel: string;
  submittingLabel: string;
  backHref: string;
  onSubmit: (payload: EventPayload) => Promise<unknown>;
}

export function EventForm({
  initialValues = EMPTY_EVENT_FORM,
  events,
  currentEvent,
  submitLabel,
  submittingLabel,
  backHref,
  onSubmit,
}: EventFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<EventFormValues>(initialValues);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fields = fieldsForType(form.type);
  const suspensions = resumableSuspensions(events, currentEvent?.id);

  function update<K extends keyof EventFormValues>(key: K, value: EventFormValues[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  /** Al cambiar de tipo se sugiere el siguiente número libre DE ESE TIPO: la
   *  numeración corre por separado en cada uno. Al editar no se toca. */
  function changeType(type: EventType) {
    setForm((current) => ({
      ...current,
      type,
      sequenceNumber:
        currentEvent || !fieldsForType(type).sequenceNumber
          ? current.sequenceNumber
          : nextSequenceForType(events, type),
    }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(toEventPayload(form));
      router.push(backHref);
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Error al guardar el evento");
      setSubmitting(false);
    }
  }

  const missingSuspension = fields.relatedEvent && suspensions.length === 0;

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Tipo de evento">
          <select
            value={form.type}
            onChange={(e) => changeType(e.target.value as EventType)}
            className={inputClass}
          >
            {EVENT_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Fecha del acto">
          <input
            required
            type="date"
            value={form.eventDate}
            onChange={(e) => update("eventDate", e.target.value)}
            className={`${inputClass} font-mono`}
          />
        </Field>
      </div>

      {fields.sequenceNumber && (
        <Field label="Número" hint="la numeración corre por separado en cada tipo">
          <input
            inputMode="numeric"
            value={form.sequenceNumber}
            onChange={(e) => update("sequenceNumber", e.target.value)}
            placeholder="1"
            className={`${inputClass} font-mono`}
          />
        </Field>
      )}

      {(fields.valueDelta || fields.daysDelta) && (
        <div className="grid grid-cols-2 gap-4">
          {fields.valueDelta && (
            <Field label="Valor añadido" hint="opcional">
              <input
                inputMode="decimal"
                value={form.valueDelta}
                onChange={(e) => update("valueDelta", e.target.value)}
                placeholder="15000000"
                className={`${inputClass} font-mono`}
              />
            </Field>
          )}
          {fields.daysDelta && (
            <Field label="Días añadidos" hint="opcional">
              <input
                inputMode="numeric"
                value={form.daysDelta}
                onChange={(e) => update("daysDelta", e.target.value)}
                placeholder="30"
                className={`${inputClass} font-mono`}
              />
            </Field>
          )}
        </div>
      )}

      {fields.startDate && (
        <div className="grid grid-cols-2 gap-4">
          <Field label="Inicio de la suspensión">
            <input
              type="date"
              value={form.startDate}
              onChange={(e) => update("startDate", e.target.value)}
              className={`${inputClass} font-mono`}
            />
          </Field>

          {/* endDate no se edita nunca a mano: lo escribe el API al registrar
              el reinicio que reanuda esta suspensión. */}
          <Field label="Fin de la suspensión" hint="lo llena el reinicio">
            <p className={`${readOnlyClass} font-mono`}>
              {currentEvent?.endDate ?? (
                <span className="text-text-muted">Sin reanudar todavía</span>
              )}
            </p>
          </Field>
        </div>
      )}

      {fields.relatedEvent &&
        (missingSuspension ? (
          <div className="flex items-start gap-2 rounded-lg border border-status-pendientes-dim bg-status-pendientes-dim/40 px-3 py-2.5 text-sm text-status-pendientes">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p>
              No hay ninguna suspensión pendiente de reanudar en este contrato. Registra primero la
              suspensión, o revisa si ya tiene un reinicio.
            </p>
          </div>
        ) : (
          <Field label="Suspensión que reanuda">
            <select
              required
              value={form.relatedEventId}
              onChange={(e) => update("relatedEventId", e.target.value)}
              className={inputClass}
            >
              <option value="">Seleccionar...</option>
              {suspensions.map((suspension) => (
                <option key={suspension.id} value={suspension.id}>
                  {eventLabel(suspension)} — desde {suspension.startDate ?? suspension.eventDate}
                </option>
              ))}
            </select>
          </Field>
        ))}

      <Field label="Descripción" hint="opcional">
        <textarea
          rows={3}
          value={form.description}
          onChange={(e) => update("description", e.target.value)}
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
          disabled={submitting || missingSuspension}
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
