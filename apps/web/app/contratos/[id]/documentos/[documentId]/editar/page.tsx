import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import {
  ApiError,
  getContract,
  getDocument,
  listEvents,
  listGuarantees,
  listPayments,
} from "@/lib/api";
import { buildLinkOptions, documentToFormValues } from "@/lib/document-form";
import { EditDocumentForm } from "./EditDocumentForm";

export const dynamic = "force-dynamic";

export default async function EditarDocumentoPage({
  params,
}: {
  params: { id: string; documentId: string };
}) {
  let contract;
  let document;
  let payments;
  let events;
  let guarantees;
  try {
    [contract, document, payments, events, guarantees] = await Promise.all([
      getContract(params.id),
      getDocument(params.documentId),
      listPayments(params.id),
      listEvents(params.id),
      listGuarantees(params.id),
    ]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  if (document.contractId !== contract.id) notFound();

  return (
    <div className="mx-auto max-w-2xl px-8 py-10">
      <Link
        href={`/contratos/${contract.id}/documentos`}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Documentos de {contract.number}
      </Link>

      <h1 className="text-lg font-medium text-text-primary">Editar documento</h1>
      <p className="mt-1 break-all font-mono text-sm text-text-secondary">
        {contract.number} · {document.originalFileName}
      </p>

      <EditDocumentForm
        documentId={document.id}
        contractId={contract.id}
        contractTypeId={contract.contractType.id}
        linkOptions={buildLinkOptions(payments, events, guarantees)}
        initialValues={documentToFormValues(document)}
      />
    </div>
  );
}
