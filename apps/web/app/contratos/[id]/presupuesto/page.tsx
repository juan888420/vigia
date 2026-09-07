import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import { ApiError, formatMoney, getContract, listBudgetRecords, listEvents } from "@/lib/api";
import { sumBudgetRecords } from "@/lib/budget-form";
import { BudgetRecordRow } from "@/components/BudgetRecordRow";
import { ContractSubnav } from "@/components/ContractSubnav";

export const dynamic = "force-dynamic";

export default async function PresupuestoPage({ params }: { params: { id: string } }) {
  let contract;
  let records;
  let events;
  try {
    [contract, records, events] = await Promise.all([
      getContract(params.id),
      listBudgetRecords(params.id),
      // Para resolver a qué evento respalda cada CDP/RP y mostrarlo con nombre.
      listEvents(params.id),
    ]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    return (
      <div className="mx-auto max-w-3xl px-8 py-10">
        <h1 className="text-lg font-medium text-text-primary">Presupuesto</h1>
        <p className="mt-4 rounded-lg border border-status-atrasado-dim bg-status-atrasado-dim/40 px-3 py-2.5 text-sm text-status-atrasado">
          No se pudo conectar con el API. Verifica que esté corriendo en{" "}
          <span className="font-mono">localhost:3333</span>.
        </p>
      </div>
    );
  }

  // Suma de lo cargado, no el "valor vigente" del contrato: ese lo calculará el
  // motor de reglas a partir del valor inicial y de las adiciones.
  const total = sumBudgetRecords(records);

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
          <h1 className="mt-1 text-lg font-medium text-text-primary">Presupuesto</h1>
          <p className="mt-1 max-w-md text-sm text-text-secondary">{contract.object}</p>
        </div>
        <Link
          href={`/contratos/${contract.id}/presupuesto/nuevo`}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-base transition-colors hover:bg-accent/80"
        >
          <Plus className="h-3.5 w-3.5" />
          Nuevo CDP/RP
        </Link>
      </div>

      <ContractSubnav contractId={contract.id} active="presupuesto" />

      {records.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center">
          <p className="text-sm text-text-secondary">Aún no hay respaldos presupuestales.</p>
          <Link
            href={`/contratos/${contract.id}/presupuesto/nuevo`}
            className="mt-2 inline-block text-sm text-accent hover:underline"
          >
            Registrar el primero
          </Link>
        </div>
      ) : (
        <>
          <dl className="mb-5 grid grid-cols-2 gap-x-6 rounded-lg border border-border bg-surface px-5 py-4">
            <div>
              <dt className="text-xs text-text-muted">Respaldo registrado</dt>
              <dd className="mt-0.5 font-mono text-sm text-text-primary">
                {formatMoney(total)}
                <span className="ml-1.5 font-sans text-xs text-text-muted">
                  en {records.length} {records.length === 1 ? "registro" : "registros"}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">Valor inicial del contrato</dt>
              <dd className="mt-0.5 font-mono text-sm text-text-primary">
                {formatMoney(contract.initialValue)}
              </dd>
            </div>
          </dl>

          <div className="space-y-3">
            {records.map((record) => (
              <BudgetRecordRow
                key={record.id}
                record={record}
                contractId={contract.id}
                events={events}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
