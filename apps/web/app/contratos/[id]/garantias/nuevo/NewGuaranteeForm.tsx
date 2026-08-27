"use client";

import { createGuarantee, type ContractEvent, type GuaranteePayload } from "@/lib/api";
import { GuaranteeForm } from "@/components/GuaranteeForm";

export function NewGuaranteeForm({
  contractId,
  events,
}: {
  contractId: string;
  events: ContractEvent[];
}) {
  return (
    <GuaranteeForm
      events={events}
      submitLabel="Guardar póliza"
      submittingLabel="Guardando..."
      backHref={`/contratos/${contractId}/garantias`}
      onSubmit={(payload: GuaranteePayload) => createGuarantee(contractId, payload)}
    />
  );
}
