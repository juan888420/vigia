"use client";

import { createDocument, type ContractDocumentPayload } from "@/lib/api";
import { DocumentForm } from "@/components/DocumentForm";
import type { DocumentFormValues, DocumentLinkOption } from "@/lib/document-form";

export function NewDocumentForm({
  contractId,
  contractTypeId,
  linkOptions,
  initialValues,
}: {
  contractId: string;
  contractTypeId: string;
  linkOptions: DocumentLinkOption[];
  /** Precarga opcional. Hoy solo la usa el flujo de IA para traer el tipo
   *  documental que clasificó. */
  initialValues?: DocumentFormValues;
}) {
  return (
    <DocumentForm
      initialValues={initialValues}
      contractTypeId={contractTypeId}
      linkOptions={linkOptions}
      submitLabel="Registrar documento"
      submittingLabel="Guardando..."
      backHref={`/contratos/${contractId}/documentos`}
      onSubmit={(payload: ContractDocumentPayload) => createDocument(contractId, payload)}
    />
  );
}
