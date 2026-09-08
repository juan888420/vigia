import {
  computeBalance,
  computeBudgetBackingTotal,
  computeCurrentEndDate,
  computeCurrentValue,
} from "./derived";
import { collectFindings } from "./findings";
import { computeContractStatus } from "./status";
import type { Diagnostic, DiagnosticInput } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Motor de reglas. Determinístico de principio a fin: mismos datos y misma
// fecha "hoy" ⇒ mismo diagnóstico, siempre. Ninguna IA participa en esto
// (README → "Lo que la IA NO decide nunca").
//
// El resultado no se guarda en ninguna parte: se recalcula en cada consulta a
// partir de los datos ya registrados. Almacenarlo permitiría que quedara
// desfasado del historial que resume.
// ─────────────────────────────────────────────────────────────────────────────

export function computeDiagnostic(input: DiagnosticInput): Diagnostic {
  const currentValue = computeCurrentValue(input.contract, input.events);
  const currentEndDate = computeCurrentEndDate(input.contract, input.events);
  const balance = computeBalance(currentValue, input.payments);
  const backingTotal = computeBudgetBackingTotal(input.budgetRecords);

  const findings = collectFindings(input, currentValue, currentEndDate, backingTotal, balance);

  return {
    currentValue,
    currentEndDate,
    balance,
    budgetBacking: {
      total: backingTotal,
      matchesCurrentValue: backingTotal.equals(currentValue),
    },
    status: computeContractStatus(findings, currentEndDate),
    findings,
  };
}

export * from "./types";
