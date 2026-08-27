import Link from "next/link";
import { Plus } from "lucide-react";
import { listContracts } from "@/lib/api";
import { ContractRow } from "@/components/ContractRow";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  let contracts;
  try {
    contracts = await listContracts();
  } catch {
    return (
      <div className="mx-auto max-w-3xl px-8 py-10">
        <h1 className="text-lg font-medium text-text-primary">Contratos CD</h1>
        <p className="mt-4 rounded-lg border border-status-atrasado-dim bg-status-atrasado-dim/40 px-3 py-2.5 text-sm text-status-atrasado">
          No se pudo conectar con el API. Verifica que esté corriendo en{" "}
          <span className="font-mono">localhost:3333</span>.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <div className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="text-lg font-medium text-text-primary">Contratos CD</h1>
          <p className="mt-1 text-sm text-text-secondary">
            {contracts.length} {contracts.length === 1 ? "contrato registrado" : "contratos registrados"}
          </p>
        </div>
        <Link
          href="/contratos/nuevo"
          className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-base transition-colors hover:bg-accent/80"
        >
          <Plus className="h-3.5 w-3.5" />
          Nuevo contrato
        </Link>
      </div>

      {contracts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center">
          <p className="text-sm text-text-secondary">Todavía no hay contratos registrados.</p>
          <Link href="/contratos/nuevo" className="mt-2 inline-block text-sm text-accent hover:underline">
            Crear el primero
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {contracts.map((contract) => (
            <ContractRow key={contract.id} contract={contract} />
          ))}
        </div>
      )}
    </div>
  );
}
