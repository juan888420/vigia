import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import { ApiError, getContract, listEvents, listGuarantees } from "@/lib/api";
import { GuaranteeRow } from "@/components/GuaranteeRow";
import { ContractSubnav } from "@/components/ContractSubnav";

export const dynamic = "force-dynamic";

export default async function GarantiasPage({ params }: { params: { id: string } }) {
  let contract;
  let guarantees;
  let events;
  try {
    [contract, guarantees, events] = await Promise.all([
      getContract(params.id),
      listGuarantees(params.id),
      // Para resolver a qué evento apunta cada póliza y mostrarlo con nombre.
      listEvents(params.id),
    ]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    return (
      <div className="mx-auto max-w-3xl px-8 py-10">
        <h1 className="text-lg font-medium text-text-primary">Garantías</h1>
        <p className="mt-4 rounded-lg border border-status-atrasado-dim bg-status-atrasado-dim/40 px-3 py-2.5 text-sm text-status-atrasado">
          No se pudo conectar con el API. Verifica que esté corriendo en{" "}
          <span className="font-mono">localhost:3333</span>.
        </p>
      </div>
    );
  }

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
          <h1 className="mt-1 text-lg font-medium text-text-primary">Garantías</h1>
          <p className="mt-1 max-w-md text-sm text-text-secondary">{contract.object}</p>
        </div>
        <Link
          href={`/contratos/${contract.id}/garantias/nuevo`}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-base transition-colors hover:bg-accent/80"
        >
          <Plus className="h-3.5 w-3.5" />
          Nueva póliza
        </Link>
      </div>

      <ContractSubnav contractId={contract.id} active="garantias" />

      {guarantees.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center">
          <p className="text-sm text-text-secondary">Aún no hay pólizas registradas.</p>
          <Link
            href={`/contratos/${contract.id}/garantias/nuevo`}
            className="mt-2 inline-block text-sm text-accent hover:underline"
          >
            Registrar la primera
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {guarantees.map((guarantee) => (
            <GuaranteeRow
              key={guarantee.id}
              guarantee={guarantee}
              contractId={contract.id}
              events={events}
            />
          ))}
        </div>
      )}
    </div>
  );
}
