import {
  computeBalance,
  computeBudgetBackingStatus,
  computeBudgetBackingTotal,
  computeCdpTotal,
  computeCurrentEndDate,
  computeCurrentValue,
} from "./derived";
import {
  buildDocumentChecklist,
  buildPaymentSupport,
  buildStages,
  resolveRequirements,
} from "./checklist";
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
  const cdpTotal = computeCdpTotal(input.budgetRecords);

  // El cruce catálogo-contra-documentos se hace UNA vez y alimenta las dos
  // salidas: los hallazgos (solo lo ausente) y las etapas (todo con su
  // estado). Separarlos permitiría que se contradijeran.
  const requirements = resolveRequirements(input.requirements, input.overrides);
  const checklist = buildDocumentChecklist(
    requirements,
    input.payments,
    input.documents,
    input.budgetRecords,
  );

  const findings = collectFindings(
    input,
    checklist,
    currentValue,
    currentEndDate,
    backingTotal,
    balance,
  );

  return {
    currentValue,
    currentEndDate,
    balance,
    budgetBacking: {
      total: backingTotal,
      cdpTotal,
      matchStatus: computeBudgetBackingStatus(currentValue, backingTotal, input.budgetRecords),
    },
    status: computeContractStatus(findings, currentEndDate),
    findings,
    stages: buildStages(checklist),
    paymentSupport: buildPaymentSupport(checklist, input.payments),
  };
}

export * from "./types";
