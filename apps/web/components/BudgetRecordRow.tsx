import type { BudgetRecord, ContractEvent } from "@/lib/api";
import { formatMoney } from "@/lib/api";
import { eventLabel } from "@/lib/event-form";
import { BUDGET_RECORD_TYPE_LABELS } from "@/lib/budget-form";
import { BudgetRecordActions } from "./BudgetRecordActions";

// Si la suma de los respaldos no cuadra con el valor del contrato, esta fila
// no lo señala: quien decide que eso es un hallazgo es el motor de reglas.

export function BudgetRecordRow({
  record,
  contractId,
  events,
}: {
  record: BudgetRecord;
  contractId: string;
  events: ContractEvent[];
}) {
  const backs = record.eventId ? events.find((e) => e.id === record.eventId) : undefined;
  const label = `${BUDGET_RECORD_TYPE_LABELS[record.type]} ${record.number}`;

  return (
    <article className="rounded-lg border border-border bg-surface p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded border border-border-strong px-1.5 py-0.5 text-[10px] text-text-muted">
              {BUDGET_RECORD_TYPE_LABELS[record.type]}
            </span>
            <span className="font-mono text-sm text-text-primary">{record.number}</span>
          </div>
          <p className="mt-1.5 text-sm text-text-secondary">
            {backs ? `Respalda ${eventLabel(backs)}` : "Presupuesto inicial del contrato"}
          </p>
          <p className="mt-1 text-xs text-text-muted">
            {record.issuedAt ? `Expedido el ${record.issuedAt}` : "Sin fecha de expedición"}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-3">
          <span className="font-mono text-sm text-text-primary">{formatMoney(record.value)}</span>
          <BudgetRecordActions
            id={record.id}
            label={label}
            editHref={`/contratos/${contractId}/presupuesto/${record.id}/editar`}
          />
        </div>
      </div>
    </article>
  );
}
