import Link from "next/link";
import type { Contrato } from "@/lib/mock-data";
import { StatusBadge } from "./StatusBadge";
import { ArrowUpRight } from "lucide-react";

export function ContractCard({ contrato }: { contrato: Contrato }) {
  const porcentajePagado = Math.round((contrato.pagado / contrato.valor) * 100);

  return (
    <Link
      href={`/contratos/${contrato.id}`}
      className="group block rounded-lg border border-border bg-surface p-5 transition-colors hover:border-border-strong hover:bg-surface-hover"
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm text-text-primary">{contrato.numero}</span>
            <ArrowUpRight className="h-3.5 w-3.5 text-text-muted opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
          <p className="mt-1 max-w-md text-sm text-text-secondary">{contrato.objeto}</p>
        </div>
        <StatusBadge estado={contrato.estado} />
      </div>

      <div className="mt-4 flex items-center gap-6">
        <div className="flex-1">
          <div className="h-1 w-full overflow-hidden rounded-full bg-surface-hover">
            <div className="h-full rounded-full bg-accent" style={{ width: `${porcentajePagado}%` }} />
          </div>
        </div>
        <span className="font-mono text-xs text-text-muted">{porcentajePagado}% pagado</span>
        {contrato.alertas.length > 0 && (
          <span className="text-xs text-status-pendientes">
            {contrato.alertas.length} alerta{contrato.alertas.length > 1 ? "s" : ""}
          </span>
        )}
      </div>
    </Link>
  );
}
