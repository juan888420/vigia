"use client";

import { updateBudgetRecord, type BudgetRecordPayload, type ContractEvent } from "@/lib/api";
import { BudgetRecordForm } from "@/components/BudgetRecordForm";
import type { BudgetRecordFormValues } from "@/lib/budget-form";

export function EditBudgetRecordForm({
  recordId,
  contractId,
  events,
  initialValues,
}: {
  recordId: string;
  contractId: string;
  events: ContractEvent[];
  initialValues: BudgetRecordFormValues;
}) {
  return (
    <BudgetRecordForm
      initialValues={initialValues}
      events={events}
      submitLabel="Guardar cambios"
      submittingLabel="Guardando..."
      backHref={`/contratos/${contractId}/presupuesto`}
      onSubmit={(payload: BudgetRecordPayload) => updateBudgetRecord(recordId, payload)}
    />
  );
}
