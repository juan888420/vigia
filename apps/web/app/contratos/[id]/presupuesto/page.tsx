import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import {
  ApiError,
  formatMoney,
  getContract,
  getDiagnostic,
  listBudgetRecords,
  listEvents,
} from "@/lib/api";
import { BudgetRecordRow } from "@/components/BudgetRecordRow";
import { ContractSubnav } from "@/components/ContractSubnav";

export const dynamic = "force-dynamic";

export default async function PresupuestoPage({ params }: { params: { id: string } }) {
  let contract;
  let records;
  let events;
  let diagnostic;
  try {
    [contract, records, events, diagnostic] = await Promise.all([
      getContract(params.id),
      listBudgetRecords(params.id),
      // Para resolver a qué evento respalda cada CDP/RP y mostrarlo con nombre.
      listEvents(params.id),
      // Los totales los calcula el motor de reglas, no esta pantalla. Si el
      // diagnóstico falla, el resumen desaparece pero el listado —que es el
      // trabajo real de esta página, cargar y corregir respaldos— sigue
      // funcionando. Por eso el catch va aquí dentro y no tumba el Promise.all.
      getDiagnostic(params.id).catch(() => null),
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

  // Los conteos SÍ salen de aquí: son cuántas filas hay de cada tipo, no una
  // suma de dinero. Cada uno acompaña a su propia cifra — un único "en 4
  // registros" al lado del total de RP diría que esos 4 componen esa cifra.
  const rpCount = records.filter((record) => record.type === "RP").length;
  const cdpCount = records.filter((record) => record.type === "CDP").length;

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
          {diagnostic && (
            <dl className="mb-5 grid grid-cols-2 gap-x-6 gap-y-3 rounded-lg border border-border bg-surface px-5 py-4">
              <div>
                <dt className="text-xs text-text-muted">Respaldo presupuestal (RP)</dt>
                <dd className="mt-0.5 font-mono text-sm text-text-primary">
                  {formatMoney(diagnostic.budgetBacking.total) ?? "—"}
                  <span className="ml-1.5 font-sans text-xs text-text-muted">
                    en {rpCount} {rpCount === 1 ? "registro" : "registros"}
                  </span>
                </dd>
              </div>
              <div>
                {/* Aparte y nunca sumada al RP: es la disponibilidad
                    certificada ANTES de comprometer, no dinero adicional. */}
                <dt className="text-xs text-text-muted">Disponibilidad previa (CDP)</dt>
                <dd className="mt-0.5 font-mono text-sm text-text-primary">
                  {formatMoney(diagnostic.budgetBacking.cdpTotal) ?? "—"}
                  <span className="ml-1.5 font-sans text-xs text-text-muted">
                    en {cdpCount} {cdpCount === 1 ? "registro" : "registros"}
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
          )}

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
