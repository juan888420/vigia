import type { Finding, FindingSeverity } from "@/lib/api";
import { SEVERITY_LABELS } from "@/lib/diagnostic";
import { FindingRow } from "@/components/FindingRow";

// Los hallazgos agrupados por severidad. El motor los devuelve en orden de
// regla, no de gravedad: un expediente con 50 hallazgos se lee muy distinto
// si lo crítico aparece primero y separado de lo que solo está incompleto.

/** De más grave a menos. Es orden de lectura, no una escala numérica: la
 *  severidad de cada regla la fija el motor (findings.ts → SEVERITY). */
const SEVERITY_ORDER: FindingSeverity[] = ["CRITICAL", "WARNING", "INFO"];

export function FindingList({
  findings,
  contractId,
}: {
  findings: Finding[];
  contractId: string;
}) {
  if (findings.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center">
        <p className="text-sm text-text-secondary">
          El motor de reglas no encontró incoherencias en este contrato.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {SEVERITY_ORDER.map((severity) => {
        const group = findings.filter((finding) => finding.severity === severity);
        // Una severidad sin hallazgos no se anuncia: un encabezado "Crítico"
        // vacío se lee como un problema, no como su ausencia.
        if (group.length === 0) return null;

        return (
          <section key={severity}>
            <div className="mb-3 flex items-baseline gap-2">
              <h3 className="text-sm font-medium text-text-primary">
                {SEVERITY_LABELS[severity]}
              </h3>
              <span className="font-mono text-xs text-text-muted">{group.length}</span>
            </div>
            <div className="space-y-3">
              {group.map((finding, index) => (
                <FindingRow
                  key={`${finding.ruleCode}:${index}`}
                  finding={finding}
                  contractId={contractId}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
