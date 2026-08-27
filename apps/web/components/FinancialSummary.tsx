import type { Contrato } from "@/lib/mock-data";

function formatCOP(value: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}

function diasRestantes(fechaVencimiento: string) {
  const hoy = new Date("2025-08-20"); // fecha de referencia fija para el wireframe
  const venc = new Date(fechaVencimiento);
  return Math.round((venc.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
}

export function FinancialSummary({ contrato }: { contrato: Contrato }) {
  const saldo = contrato.valor - contrato.pagado;
  const porcentajePagado = Math.round((contrato.pagado / contrato.valor) * 100);
  const dias = diasRestantes(contrato.fechaVencimiento);
  const vencido = dias < 0;

  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-text-muted">Valor del contrato</p>
          <p className="mt-1 font-mono text-lg text-text-primary">{formatCOP(contrato.valor)}</p>
        </div>
        <div>
          <p className="text-xs text-text-muted">Saldo disponible</p>
          <p className="mt-1 font-mono text-lg text-text-primary">{formatCOP(saldo)}</p>
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between text-xs text-text-muted">
          <span>Pagado</span>
          <span>{porcentajePagado}%</span>
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-hover">
          <div
            className="h-full rounded-full bg-accent"
            style={{ width: `${porcentajePagado}%` }}
          />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
        <span className="text-xs text-text-muted">Vencimiento</span>
        <span
          className={`font-mono text-sm ${vencido ? "text-status-atrasado" : "text-text-secondary"}`}
        >
          {vencido ? `Vencido hace ${Math.abs(dias)} días` : `${dias} días restantes`}
        </span>
      </div>
    </div>
  );
}
