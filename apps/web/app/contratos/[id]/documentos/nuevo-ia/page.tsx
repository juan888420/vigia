import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ApiError, getContract } from "@/lib/api";
import { AiDocumentFlow } from "./AiDocumentFlow";

// Registrar un documento con la IA leyéndolo primero.
//
// No carga pagos, eventos ni garantías como hace el formulario manual: aquí el
// documento no cuelga de un elemento ya existente sino del evento que se crea
// en el mismo acto de confirmar. Por eso no hay select de "de qué es soporte".

export const dynamic = "force-dynamic";

export default async function NuevoDocumentoIaPage({ params }: { params: { id: string } }) {
  let contract;
  try {
    contract = await getContract(params.id);
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

      <h1 className="text-lg font-medium text-text-primary">Registrar documento con IA</h1>
      <p className="mt-1 text-sm text-text-secondary">
        La IA lee el PDF y propone el tipo documental y, si es un otrosí, sus campos. Nada se
        guarda hasta que revises la propuesta y confirmes.
      </p>

      <AiDocumentFlow contractId={contract.id} contractTypeId={contract.contractType.id} />
    </div>
  );
}
