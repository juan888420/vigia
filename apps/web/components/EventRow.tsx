import type { ContractEvent } from "@/lib/api";
import { formatMoney } from "@/lib/api";
import { EVENT_TYPE_LABELS, eventLabel } from "@/lib/event-form";
import { EventActions } from "./EventActions";

// Muestra lo guardado. No calcula valor vigente, fecha de terminación vigente
// ni saltos de secuencia: eso es del motor de reglas.

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd className={value ? "mt-0.5 text-sm text-text-secondary" : "mt-0.5 text-sm text-text-muted"}>
        {value ?? "Sin registrar"}
      </dd>
    </div>
  );
}

export function EventRow({
  event,
  contractId,
  events,
}: {
  event: ContractEvent;
  contractId: string;
  events: ContractEvent[];
}) {
  const label = eventLabel(event);
  const related = event.relatedEventId
    ? events.find((e) => e.id === event.relatedEventId)
    : undefined;
  const suspended = event.type === "SUSPENSION" && event.endDate === null;

  return (
    <article className="rounded-lg border border-border bg-surface p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm text-text-primary">{label}</span>
            <span className="rounded border border-border-strong px-1.5 py-0.5 text-[10px] text-text-muted">
              {EVENT_TYPE_LABELS[event.type]}
            </span>
            {suspended && (
              <span className="rounded-full bg-status-pendientes-dim px-2 py-0.5 text-xs font-medium text-status-pendientes">
                Sin reanudar
              </span>
            )}
          </div>
          {event.description && (
            <p className="mt-1.5 max-w-md text-sm text-text-secondary">{event.description}</p>
          )}
          {related && (
            <p className="mt-1.5 text-xs text-text-muted">
              Reanuda {eventLabel(related)}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-3">
          <span className="font-mono text-sm text-text-primary">{event.eventDate}</span>
          <EventActions
            id={event.id}
            label={label}
            editHref={`/contratos/${contractId}/eventos/${event.id}/editar`}
          />
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-border pt-4 sm:grid-cols-4">
        <Field label="Valor añadido" value={formatMoney(event.valueDelta)} />
        <Field label="Días añadidos" value={event.daysDelta === null ? null : `${event.daysDelta} días`} />
        <Field label="Suspendido desde" value={event.startDate} />
        <Field
          label="Reanudado el"
          value={event.type === "SUSPENSION" && event.endDate === null ? null : event.endDate}
        />
      </dl>
    </article>
  );
}
