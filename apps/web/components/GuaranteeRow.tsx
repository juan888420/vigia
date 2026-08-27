import type { ContractEvent, Guarantee } from "@/lib/api";
import { formatMoney } from "@/lib/api";
import { eventLabel } from "@/lib/event-form";
import { GUARANTEE_TYPE_LABELS } from "@/lib/guarantee-form";
import { GuaranteeActions } from "./GuaranteeActions";

// La ausencia de approvedAt se muestra, pero NO se marca como hallazgo: quien
// decide que eso amerita una alerta es el motor de reglas.

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

export function GuaranteeRow({
  guarantee,
  contractId,
  events,
}: {
  guarantee: Guarantee;
  contractId: string;
  events: ContractEvent[];
}) {
  const covers = guarantee.coversEventId
    ? events.find((e) => e.id === guarantee.coversEventId)
    : undefined;

  return (
    <article className="rounded-lg border border-border bg-surface p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm text-text-primary">{guarantee.policyNumber}</span>
            <span className="rounded border border-border-strong px-1.5 py-0.5 text-[10px] text-text-muted">
              {GUARANTEE_TYPE_LABELS[guarantee.type]}
            </span>
          </div>
          <p className="mt-1.5 text-sm text-text-secondary">
            {covers ? `Ampara ${eventLabel(covers)}` : "Garantía inicial del contrato"}
          </p>
          {guarantee.insurer && (
            <p className="mt-1 text-xs text-text-muted">{guarantee.insurer}</p>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-3">
          <span className="font-mono text-sm text-text-primary">
            {formatMoney(guarantee.insuredValue) ?? "—"}
          </span>
          <GuaranteeActions
            id={guarantee.id}
            policyNumber={guarantee.policyNumber}
            editHref={`/contratos/${contractId}/garantias/${guarantee.id}/editar`}
          />
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-x-6 gap-y-3 border-t border-border pt-4">
        <Field label="Vigente desde" value={guarantee.validFrom} />
        <Field label="Vigente hasta" value={guarantee.validUntil} />
        <Field label="Aprobada el" value={guarantee.approvedAt} />
      </dl>
    </article>
  );
}
