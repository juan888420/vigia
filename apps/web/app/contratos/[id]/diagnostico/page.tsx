import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ApiError, formatMoney, getContract, getDiagnostic } from "@/lib/api";
import type { CurrentEndDate } from "@/lib/api";
import { BUDGET_BACKING_PRESENTATION, STATUS_LABELS, STATUS_STYLES } from "@/lib/diagnostic";
import { ContractSubnav } from "@/components/ContractSubnav";
import { FindingRow } from "@/components/FindingRow";

// Diagnóstico del contrato. Nada de esta pantalla está guardado: el API
// recalcula estado, valores y hallazgos en cada carga leyendo los datos ya
// registrados, así que no puede quedar desfasada del expediente.

export const dynamic = "force-dynamic";

type MetricTone = "default" | "warning" | "muted";

const METRIC_TONES: Record<MetricTone, string> = {
  default: "text-text-primary",
  warning: "text-status-pendientes",
  muted: "text-text-muted",
};

function Metric({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: MetricTone;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-xs text-text-muted">{label}</p>
      <p className={`mt-1 font-mono text-sm ${METRIC_TONES[tone]}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-text-muted">{hint}</p>}
    </div>
  );
}

/** Las tres situaciones de la fecha vigente se muestran distintas a propósito:
 *  "sin fechas base" no es un error ni una fecha desconocida, es un expediente
 *  al que todavía le falta el acta de inicio. */
function endDateMetric(currentEndDate: CurrentEndDate) {
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

export default async function DiagnosticoPage({ params }: { params: { id: string } }) {
  let contract;
  let diagnostic;
  try {
    [contract, diagnostic] = await Promise.all([getContract(params.id), getDiagnostic(params.id)]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    return (
      <div className="mx-auto max-w-3xl px-8 py-10">
        <h1 className="text-lg font-medium text-text-primary">Diagnóstico</h1>
        <p className="mt-4 rounded-lg border border-status-atrasado-dim bg-status-atrasado-dim/40 px-3 py-2.5 text-sm text-status-atrasado">
          No se pudo conectar con el API. Verifica que esté corriendo en{" "}
          <span className="font-mono">localhost:3333</span>.
        </p>
      </div>
    );
  }

  const status = STATUS_STYLES[diagnostic.status];
  const endDate = endDateMetric(diagnostic.currentEndDate);
  const backing = BUDGET_BACKING_PRESENTATION[diagnostic.budgetBacking.matchStatus];
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

      <div className="min-w-0">
        <span className="font-mono text-sm text-text-muted">{contract.number}</span>
        <h1 className="mt-1 text-lg font-medium text-text-primary">Diagnóstico</h1>
        <p className="mt-1 max-w-md text-sm text-text-secondary">{contract.object}</p>
      </div>

      <ContractSubnav contractId={contract.id} active="diagnostico" />

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

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Metric label="Valor vigente" value={formatMoney(diagnostic.currentValue) ?? "—"} />
        <Metric
          label="Fecha de terminación vigente"
          value={endDate.value}
          hint={endDate.hint}
          tone={endDate.tone}
        />
        <Metric label="Saldo" value={formatMoney(diagnostic.balance) ?? "—"} />
        <Metric
          label="Respaldo presupuestal (RP)"
          value={formatMoney(diagnostic.budgetBacking.total) ?? "—"}
          hint={`${backing.note} · Disponibilidad previa (CDP): ${formatMoney(diagnostic.budgetBacking.cdpTotal) ?? "—"}`}
          tone={backing.tone}
        />
      </div>

      <h2 className="mb-3 mt-8 text-sm font-medium text-text-primary">Hallazgos</h2>

      {findingCount === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center">
          <p className="text-sm text-text-secondary">
            El motor de reglas no encontró incoherencias en este contrato.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {diagnostic.findings.map((finding, index) => (
            <FindingRow
              key={`${finding.ruleCode}:${index}`}
              finding={finding}
              contractId={contract.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
