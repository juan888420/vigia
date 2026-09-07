"use client";

import { createDocument, type ContractDocumentPayload } from "@/lib/api";
import { DocumentForm } from "@/components/DocumentForm";
import type { DocumentLinkOption } from "@/lib/document-form";

export function NewDocumentForm({
  contractId,
  contractTypeId,
  linkOptions,
}: {
  contractId: string;
  contractTypeId: string;
  linkOptions: DocumentLinkOption[];
}) {
  return (
    <DocumentForm
      contractTypeId={contractTypeId}
      linkOptions={linkOptions}
      submitLabel="Registrar documento"
      submittingLabel="Guardando..."
      backHref={`/contratos/${contractId}/documentos`}
      onSubmit={(payload: ContractDocumentPayload) => createDocument(contractId, payload)}
    />
  );
}
