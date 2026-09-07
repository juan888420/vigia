"use client";

import { updateDocument, type ContractDocumentPayload } from "@/lib/api";
import { DocumentForm } from "@/components/DocumentForm";
import type { DocumentFormValues, DocumentLinkOption } from "@/lib/document-form";

export function EditDocumentForm({
  documentId,
  contractId,
  contractTypeId,
  linkOptions,
  initialValues,
}: {
  documentId: string;
  contractId: string;
  contractTypeId: string;
  linkOptions: DocumentLinkOption[];
  initialValues: DocumentFormValues;
}) {
  return (
    <DocumentForm
      initialValues={initialValues}
      contractTypeId={contractTypeId}
      linkOptions={linkOptions}
      submitLabel="Guardar cambios"
      submittingLabel="Guardando..."
      backHref={`/contratos/${contractId}/documentos`}
      onSubmit={(payload: ContractDocumentPayload) => updateDocument(documentId, payload)}
    />
  );
}
