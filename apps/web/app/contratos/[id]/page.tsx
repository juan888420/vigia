import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { ApiError, formatMoney, getContract, getDiagnostic } from "@/lib/api";
import type { CurrentEndDate } from "@/lib/api";
import { STATUS_LABELS, STATUS_STYLES } from "@/lib/diagnostic";
import { ContractSubnav } from "@/components/ContractSubnav";
import { ContractFinancials } from "@/components/ContractFinancials";
import { FindingList } from "@/components/FindingList";
import { StageRail } from "@/components/StageRail";

// Detalle del contrato: identificación, estado y diagnóstico completo en una
// sola pantalla.
//
// Nada de lo que se muestra aquí está guardado. El API recalcula estado,
// valores vigentes, etapas y hallazgos en cada carga leyendo los datos ya
// registrados (README → "los valores vigentes se derivan"), así que esta
// pantalla no puede quedar desfasada del expediente.

export const dynamic = "force-dynamic";

/** Las tres situaciones de la fecha vigente se muestran distintas a propósito:
 *  "sin fechas base" no es un error ni una fecha desconocida, es un expediente
 *  al que todavía le falta el acta de inicio. */
function endDateView(currentEndDate: CurrentEndDate) {
  switch (currentEndDate.state) {
    case "CALCULADA":
      return { value: currentEndDate.date, hint: undefined, tone: "default" as const };
    case "SUSPENDIDO":
      return {
        value: `Suspendido desde ${currentEndDate.suspendedSince}`,
        hint:
          currentEndDate.provisionalDate === null
            ? "La fecha real se conocerá al registrar el reinicio."
            : `Provisional: ${currentEndDate.provisionalDate}. Se moverá al registrar el reinicio.`,
        tone: "warning" as const,
      };
    case "SIN_FECHAS_BASE":
      return {
        value: "Sin calcular",
        hint: "Falta el acta de inicio o la fecha de terminación inicial.",
        tone: "warning" as const,
      };
  }
}

const TONE_CLASS = {
  default: "text-text-primary",
  warning: "text-status-pendientes",
} as const;

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs text-text-muted">{label}</p>
      <p className="mt-0.5 text-sm text-text-secondary">{value ?? "Sin registrar"}</p>
    </div>
  );
}

export default async function ContratoDetallePage({ params }: { params: { id: string } }) {
  let contract;
  let diagnostic;
  try {
    [contract, diagnostic] = await Promise.all([getContract(params.id), getDiagnostic(params.id)]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    return (
      <div className="mx-auto max-w-3xl px-8 py-10">
        <h1 className="text-lg font-medium text-text-primary">Contrato</h1>
        <p className="mt-4 rounded-lg border border-status-atrasado-dim bg-status-atrasado-dim/40 px-3 py-2.5 text-sm text-status-atrasado">
          No se pudo conectar con el API. Verifica que esté corriendo en{" "}
          <span className="font-mono">localhost:3333</span>.
        </p>
      </div>
    );
  }

  const status = STATUS_STYLES[diagnostic.status];
  const endDate = endDateView(diagnostic.currentEndDate);
  const findingCount = diagnostic.findings.length;

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
          <h1 className="mt-1 text-lg font-medium text-text-primary">{contract.object}</h1>
        </div>
        <Link
          href={`/contratos/${contract.id}/editar`}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border-strong px-2.5 py-1.5 text-sm text-text-secondary transition-colors hover:border-accent hover:text-text-primary"
        >
          <Pencil className="h-3.5 w-3.5" />
          Editar
        </Link>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4">
        <Field label="Contratista" value={contract.contractor} />
        <Field label="NIT / cédula" value={contract.contractorId} />
        <Field label="Supervisor" value={contract.supervisor} />
        <Field label="Modalidad" value={contract.contractType.name} />
      </div>

      <ContractSubnav contractId={contract.id} active="resumen" />

      <section className="rounded-lg border border-border bg-surface p-5">
        <div className="flex items-center justify-between gap-4">
          <span
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${status.badge}`}
          >
            <span className={`h-2 w-2 rounded-full ${status.dot}`} />
            {STATUS_LABELS[diagnostic.status]}
          </span>
          <span className="text-xs text-text-muted">Calculado el {diagnostic.computedAt}</span>
        </div>
        <p className="mt-3 text-sm text-text-secondary">
          {findingCount === 0
            ? "Sin hallazgos: los documentos obligatorios, las garantías y las cifras registradas son coherentes entre sí."
            : `${findingCount} ${findingCount === 1 ? "hallazgo" : "hallazgos"} sobre los datos registrados hoy.`}
        </p>
      </section>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <ContractFinancials diagnostic={diagnostic} />

        <div className="rounded-lg border border-border bg-surface p-5">
          <p className="text-xs text-text-muted">Fecha de terminación vigente</p>
          <p className={`mt-1 font-mono text-lg ${TONE_CLASS[endDate.tone]}`}>{endDate.value}</p>
          {endDate.hint && <p className="mt-1 text-xs text-text-muted">{endDate.hint}</p>}

          <div className="mt-4 space-y-3 border-t border-border pt-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-muted">Valor inicial</span>
              <span className="font-mono text-sm text-text-secondary">
                {formatMoney(contract.initialValue) ?? "—"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-muted">Acta de inicio</span>
              <span className="font-mono text-sm text-text-secondary">
                {contract.startDate ?? "—"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-muted">Terminación inicial</span>
              <span className="font-mono text-sm text-text-secondary">
                {contract.initialEndDate ?? "—"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-muted">Plazo inicial</span>
              <span className="font-mono text-sm text-text-secondary">
                {contract.initialTermDays === null ? "—" : `${contract.initialTermDays} días`}
              </span>
            </div>
          </div>
        </div>
      </div>

      <h2 className="mb-4 mt-8 text-sm font-medium text-text-primary">Expediente</h2>
      <StageRail stages={diagnostic.stages} />

      <h2 className="mb-4 mt-8 text-sm font-medium text-text-primary">Hallazgos</h2>
      <FindingList findings={diagnostic.findings} contractId={contract.id} />
    </div>
  );
}
