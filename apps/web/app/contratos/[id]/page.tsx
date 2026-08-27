import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { getContrato } from "@/lib/mock-data";
import { StatusBadge } from "@/components/StatusBadge";
import { StageRail } from "@/components/StageRail";
import { FinancialSummary } from "@/components/FinancialSummary";

export default function ContratoDetallePage({ params }: { params: { id: string } }) {
  const contrato = getContrato(params.id);
  if (!contrato) notFound();

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Contratos CD
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <span className="font-mono text-sm text-text-muted">{contrato.numero}</span>
          <h1 className="mt-1 text-lg font-medium text-text-primary">{contrato.objeto}</h1>
        </div>
        <StatusBadge estado={contrato.estado} />
      </div>

      {contrato.alertas.length > 0 && (
        <div className="mt-6 space-y-2">
          {contrato.alertas.map((alerta) => (
            <div
              key={alerta}
              className="flex items-start gap-2 rounded-lg border border-status-pendientes-dim bg-status-pendientes-dim/40 px-3 py-2.5 text-sm text-status-pendientes"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {alerta}
            </div>
          ))}
        </div>
      )}

      <div className="mt-8">
        <FinancialSummary contrato={contrato} />
      </div>

      <div className="mt-8">
        <h2 className="mb-4 text-sm font-medium text-text-primary">Expediente</h2>
        <StageRail etapas={contrato.etapas} />
      </div>
    </div>
  );
}
