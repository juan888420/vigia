"use client";

import { createBudgetRecord, type BudgetRecordPayload, type ContractEvent } from "@/lib/api";
import { BudgetRecordForm } from "@/components/BudgetRecordForm";

export function NewBudgetRecordForm({
  contractId,
  events,
}: {
  contractId: string;
  events: ContractEvent[];
}) {
  return (
    <BudgetRecordForm
      events={events}
      submitLabel="Guardar respaldo"
      submittingLabel="Guardando..."
      backHref={`/contratos/${contractId}/presupuesto`}
      onSubmit={(payload: BudgetRecordPayload) => createBudgetRecord(contractId, payload)}
    />
  );
}
