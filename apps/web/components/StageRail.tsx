import type { Etapa } from "@/lib/mock-data";
import { Check, X } from "lucide-react";

function etapaColor(etapa: Etapa) {
  const total = etapa.documentos.length;
  const presentes = etapa.documentos.filter((d) => d.presente).length;
  if (presentes === total) return "complete" as const;
  if (presentes === 0) return "empty" as const;
  return "partial" as const;
}

const dotClass: Record<string, string> = {
  complete: "bg-status-al-dia border-status-al-dia",
  partial: "bg-status-pendientes border-status-pendientes",
  empty: "border-border-strong bg-surface",
};

const lineClass: Record<string, string> = {
  complete: "bg-status-al-dia",
  partial: "bg-status-pendientes",
  empty: "bg-border",
};

export function StageRail({ etapas }: { etapas: Etapa[] }) {
  return (
    <div>
      {etapas.map((etapa, i) => {
        const color = etapaColor(etapa);
        const presentes = etapa.documentos.filter((d) => d.presente).length;
        const isLast = i === etapas.length - 1;

        return (
          <div key={etapa.nombre} className="flex gap-4">
            {/* Riel: punto + línea conectora */}
            <div className="flex flex-col items-center">
              <span className={`h-3 w-3 shrink-0 rounded-full border-2 ${dotClass[color]}`} />
              {!isLast && <span className={`w-px flex-1 ${lineClass[color]}`} />}
            </div>

            {/* Contenido de la etapa */}
            <div className={`flex-1 ${isLast ? "pb-0" : "pb-6"}`}>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-text-primary">{etapa.nombre}</h3>
                <span className="font-mono text-xs text-text-muted">
                  {presentes}/{etapa.documentos.length}
                </span>
              </div>
              <ul className="mt-2 space-y-1.5">
                {etapa.documentos.map((doc) => (
                  <li
                    key={doc.nombre}
                    className="flex items-center gap-2 text-sm text-text-secondary"
                  >
                    {doc.presente ? (
                      <Check className="h-3.5 w-3.5 shrink-0 text-status-al-dia" />
                    ) : (
                      <X className="h-3.5 w-3.5 shrink-0 text-status-atrasado" />
                    )}
                    <span className={doc.presente ? "" : "text-text-muted"}>{doc.nombre}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        );
      })}
    </div>
  );
}
