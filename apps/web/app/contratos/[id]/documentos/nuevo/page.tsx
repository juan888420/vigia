import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ApiError, getContract, listEvents, listGuarantees, listPayments } from "@/lib/api";
import { buildLinkOptions, EMPTY_DOCUMENT_FORM } from "@/lib/document-form";
import { NewDocumentForm } from "./NewDocumentForm";

export const dynamic = "force-dynamic";

export default async function NuevoDocumentoPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { tipo?: string };
}) {
  let contract;
  let payments;
  let events;
  let guarantees;
  try {
    [contract, payments, events, guarantees] = await Promise.all([
      getContract(params.id),
      listPayments(params.id),
      listEvents(params.id),
      listGuarantees(params.id),
    ]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  return (
    <div className="mx-auto max-w-2xl px-8 py-10">
      <Link
        href={`/contratos/${contract.id}/documentos`}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Documentos de {contract.number}
      </Link>

      <h1 className="text-lg font-medium text-text-primary">Registrar documento</h1>
      <p className="mt-1 text-sm text-text-secondary">
        Se registra el documento en el expediente. Todavía no hay subida de archivos: la ruta se
        escribe a mano.
      </p>

      {/* `?tipo=` es por donde entra el flujo de IA cuando clasifica un tipo
          para el que todavía no hay extracción: se prellena el tipo documental
          y NADA más, porque nada más ha propuesto la IA. Un id inexistente
          deja el select en "Seleccionar...", que es el comportamiento
          correcto: el catálogo es la única fuente de tipos válidos. */}
      <NewDocumentForm
        contractId={contract.id}
        contractTypeId={contract.contractType.id}
        linkOptions={buildLinkOptions(payments, events, guarantees)}
        initialValues={
          searchParams.tipo
            ? { ...EMPTY_DOCUMENT_FORM, documentTypeId: searchParams.tipo }
            : undefined
        }
      />
    </div>
  );
}
