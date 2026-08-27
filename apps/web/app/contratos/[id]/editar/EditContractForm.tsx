"use client";

import { updateContract, type ContractPayload } from "@/lib/api";
import { ContractForm } from "@/components/ContractForm";
import type { ContractFormValues } from "@/lib/contract-form";

// Envuelve el formulario compartido para atar el id al PATCH. Existe solo
// porque la página es un server component y no puede pasar un closure.

export function EditContractForm({
  id,
  initialValues,
}: {
  id: string;
  initialValues: ContractFormValues;
}) {
  return (
    <ContractForm
      initialValues={initialValues}
      submitLabel="Guardar cambios"
      submittingLabel="Guardando..."
      onSubmit={(payload: ContractPayload) => updateContract(id, payload)}
    />
  );
}
