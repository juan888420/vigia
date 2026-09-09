import type { Diagnostic } from "@/lib/api";
import { formatMoney } from "@/lib/api";
import { BUDGET_BACKING_PRESENTATION } from "@/lib/diagnostic";

// Tarjeta financiera del contrato. Todas las cifras llegan calculadas por el
// motor de reglas: aquí no se suma ni se resta nada, solo se formatea. Lo
// pagado se deriva de dos cifras que ya vienen dadas (valor vigente − saldo)
// porque el diagnóstico no lo expone por separado.

const TONE_CLASS = {
  default: "text-text-primary",
  warning: "text-status-pendientes",
  muted: "text-text-muted",
} as const;

export function ContractFinancials({ diagnostic }: { diagnostic: Diagnostic }) {
  const currentValue = Number(diagnostic.currentValue);
  const balance = Number(diagnostic.balance);
  const paid = currentValue - balance;

  // Un contrato de valor cero no puede tener porcentaje de ejecución: dividir
  // daría NaN y la barra quedaría rota.
  const paidPercent =
    currentValue > 0 ? Math.round((paid / currentValue) * 100) : 0;

  const backing = BUDGET_BACKING_PRESENTATION[diagnostic.budgetBacking.matchStatus];

  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-text-muted">Valor vigente</p>
          <p className="mt-1 font-mono text-lg text-text-primary">
            {formatMoney(diagnostic.currentValue) ?? "—"}
          </p>
        </div>
        <div>
          <p className="text-xs text-text-muted">Saldo</p>
          <p
            className={`mt-1 font-mono text-lg ${
              balance < 0 ? "text-status-atrasado" : "text-text-primary"
            }`}
          >
            {formatMoney(diagnostic.balance) ?? "—"}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between text-xs text-text-muted">
          <span>Pagado</span>
          <span>{paidPercent}%</span>
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-hover">
          <div
            className="h-full rounded-full bg-accent"
            // Un saldo negativo pasaría del 100% y desbordaría la barra.
            style={{ width: `${Math.min(Math.max(paidPercent, 0), 100)}%` }}
          />
        </div>
      </div>

      <div className="mt-4 border-t border-border pt-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-text-muted">Respaldo presupuestal (RP)</span>
          <span className={`font-mono text-sm ${TONE_CLASS[backing.tone]}`}>
            {formatMoney(diagnostic.budgetBacking.total) ?? "—"}
          </span>
        </div>
        <p className="mt-1 text-xs text-text-muted">
          {backing.note} · Disponibilidad previa (CDP):{" "}
          {formatMoney(diagnostic.budgetBacking.cdpTotal) ?? "—"}
        </p>
      </div>
    </div>
  );
}
