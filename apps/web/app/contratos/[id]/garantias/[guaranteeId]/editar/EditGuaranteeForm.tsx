"use client";

import { updateGuarantee, type ContractEvent, type GuaranteePayload } from "@/lib/api";
import { GuaranteeForm } from "@/components/GuaranteeForm";
import type { GuaranteeFormValues } from "@/lib/guarantee-form";

export function EditGuaranteeForm({
  guaranteeId,
  contractId,
  events,
  initialValues,
}: {
  guaranteeId: string;
  contractId: string;
  events: ContractEvent[];
  initialValues: GuaranteeFormValues;
}) {
  return (
    <GuaranteeForm
      initialValues={initialValues}
      events={events}
      submitLabel="Guardar cambios"
      submittingLabel="Guardando..."
      backHref={`/contratos/${contractId}/garantias`}
      onSubmit={(payload: GuaranteePayload) => updateGuarantee(guaranteeId, payload)}
    />
  );
}
