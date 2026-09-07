import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import {
  ApiError,
  getContract,
  listDocuments,
  listEvents,
  listGuarantees,
  listPayments,
} from "@/lib/api";
import { buildLinkOptions, STAGE_LABELS, STAGE_ORDER } from "@/lib/document-form";
import { DocumentRow } from "@/components/DocumentRow";
import { ContractSubnav } from "@/components/ContractSubnav";

export const dynamic = "force-dynamic";

export default async function DocumentosPage({ params }: { params: { id: string } }) {
  let contract;
  let documents;
  let payments;
  let events;
  let guarantees;
  try {
    [contract, documents, payments, events, guarantees] = await Promise.all([
      getContract(params.id),
      listDocuments(params.id),
      // Para resolver a qué elemento cuelga cada documento y mostrarlo con
      // nombre en vez de con un cuid.
      listPayments(params.id),
      listEvents(params.id),
      listGuarantees(params.id),
    ]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    return (
      <div className="mx-auto max-w-3xl px-8 py-10">
        <h1 className="text-lg font-medium text-text-primary">Documentos</h1>
        <p className="mt-4 rounded-lg border border-status-atrasado-dim bg-status-atrasado-dim/40 px-3 py-2.5 text-sm text-status-atrasado">
          No se pudo conectar con el API. Verifica que esté corriendo en{" "}
          <span className="font-mono">localhost:3333</span>.
        </p>
      </div>
    );
  }

  const linkOptions = buildLinkOptions(payments, events, guarantees);

  // Agrupados por etapa, en el orden del expediente. Esto es presentación, no
  // evaluación: no dice qué falta ni si el expediente está completo.
  const byStage = STAGE_ORDER.map((stage) => ({
    stage,
    documents: documents.filter((document) => document.documentType?.stage === stage),
  })).filter((group) => group.documents.length > 0);

  const unclassified = documents.filter((document) => document.documentType === null);

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Contratos CD
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <span className="font-mono text-sm text-text-muted">{contract.number}</span>
          <h1 className="mt-1 text-lg font-medium text-text-primary">Documentos</h1>
          <p className="mt-1 max-w-md text-sm text-text-secondary">{contract.object}</p>
        </div>
        <Link
          href={`/contratos/${contract.id}/documentos/nuevo`}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-base transition-colors hover:bg-accent/80"
        >
          <Plus className="h-3.5 w-3.5" />
          Registrar documento
        </Link>
      </div>

      <ContractSubnav contractId={contract.id} active="documentos" />

      {documents.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center">
          <p className="text-sm text-text-secondary">Aún no hay documentos registrados.</p>
          <Link
            href={`/contratos/${contract.id}/documentos/nuevo`}
            className="mt-2 inline-block text-sm text-accent hover:underline"
          >
            Registrar el primero
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
          {byStage.map((group) => (
            <section key={group.stage}>
              <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-text-muted">
                {STAGE_LABELS[group.stage]}
                <span className="ml-2 font-normal normal-case tracking-normal">
                  {group.documents.length}
                </span>
              </h2>
              <div className="space-y-3">
                {group.documents.map((document) => (
                  <DocumentRow
                    key={document.id}
                    document={document}
                    contractId={contract.id}
                    linkOptions={linkOptions}
                  />
                ))}
              </div>
            </section>
          ))}

          {unclassified.length > 0 && (
            <section>
              <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-text-muted">
                Sin clasificar
                <span className="ml-2 font-normal normal-case tracking-normal">
                  {unclassified.length}
                </span>
              </h2>
              <div className="space-y-3">
                {unclassified.map((document) => (
                  <DocumentRow
                    key={document.id}
                    document={document}
                    contractId={contract.id}
                    linkOptions={linkOptions}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
