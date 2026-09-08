import Link from "next/link";
import type { Finding } from "@/lib/api";
import { SEVERITY_LABELS, SEVERITY_STYLES, referenceHref } from "@/lib/diagnostic";

// Un hallazgo del motor de reglas. El `ruleCode` se muestra tal cual, en
// monoespaciada: es lo que hace auditable el diagnóstico — permite señalar la
// regla exacta cuando alguien pregunta por qué el contrato figura atrasado.

export function FindingRow({ finding, contractId }: { finding: Finding; contractId: string }) {
  const severity = SEVERITY_STYLES[finding.severity];

  return (
    <article className="rounded-lg border border-border bg-surface p-5">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-text-primary">{finding.message}</p>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${severity.badge}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${severity.dot}`} />
          {SEVERITY_LABELS[finding.severity]}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="font-mono text-xs text-text-muted">{finding.ruleCode}</span>
        {finding.references.map((reference) => (
          <Link
            key={`${reference.kind}:${reference.id}`}
            href={referenceHref(reference, contractId)}
            className="rounded border border-border-strong px-1.5 py-0.5 text-xs text-text-secondary transition-colors hover:border-accent hover:text-text-primary"
          >
            {reference.label}
          </Link>
        ))}
      </div>
    </article>
  );
}
