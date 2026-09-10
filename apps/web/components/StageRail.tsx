import { Check, Minus, X } from "lucide-react";
import type { DiagnosticStage, DiagnosticStageItem } from "@/lib/api";
import { STAGE_LABELS } from "@/lib/diagnostic";

// El expediente como riel: en qué etapa va el contrato y qué le falta en cada
// una. Los datos vienen de GET /contratos/:id/diagnostico → stages, del MISMO
// cruce catálogo-contra-documentos que produce los hallazgos DOCUMENTO_FALTANTE
// (apps/api/src/rules/checklist.ts), así que el riel no puede marcar presente
// algo que el diagnóstico reporta como faltante.
//
// Aquí SOLO hay requisitos de contrato. Los soportes que se exigen por cada
// pago los sirve el API aparte (paymentSupport) y se miran en la pantalla de
// Pagos, junto al pago al que pertenecen.

type ItemState = "present" | "missing" | "optional";

/** Un requisito que este contrato no exige (override) no es una falta: se
 *  muestra apagado para que el expediente siga siendo legible completo, pero
 *  no cuenta ni suma al total. */
function itemState(item: DiagnosticStageItem): ItemState {
  if (item.present) return "present";
  return item.required ? "missing" : "optional";
}

/** El avance se cuenta solo sobre lo exigido: incluir los opcionales haría
 *  que una etapa nunca llegara a completarse. */
function progress(stage: DiagnosticStage) {
  const required = stage.items.filter((item) => item.required);
  return { present: required.filter((item) => item.present).length, total: required.length };
}

function stageColor(stage: DiagnosticStage) {
  const { present, total } = progress(stage);
  if (total > 0 && present === total) return "complete" as const;
  if (present === 0) return "empty" as const;
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

function ItemIcon({ state }: { state: ItemState }) {
  if (state === "present") return <Check className="h-3.5 w-3.5 shrink-0 text-status-al-dia" />;
  if (state === "missing") return <X className="h-3.5 w-3.5 shrink-0 text-status-atrasado" />;
  return <Minus className="h-3.5 w-3.5 shrink-0 text-text-muted" />;
}

export function StageRail({ stages }: { stages: DiagnosticStage[] }) {
  return (
    <div>
      {stages.map((stage, index) => {
        const color = stageColor(stage);
        const { present, total } = progress(stage);
        const isLast = index === stages.length - 1;

        return (
          <div key={stage.stage} className="flex gap-4">
            {/* Riel: punto + línea conectora */}
            <div className="flex flex-col items-center">
              <span className={`h-3 w-3 shrink-0 rounded-full border-2 ${dotClass[color]}`} />
              {!isLast && <span className={`w-px flex-1 ${lineClass[color]}`} />}
            </div>

            <div className={`flex-1 ${isLast ? "pb-0" : "pb-6"}`}>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-text-primary">
                  {STAGE_LABELS[stage.stage]}
                </h3>
                <span className="font-mono text-xs text-text-muted">
                  {present}/{total}
                </span>
              </div>

              <ul className="mt-2 space-y-1.5">
                {stage.items.map((item) => {
                  const state = itemState(item);
                  return (
                    <li key={item.documentTypeId} className="text-sm text-text-secondary">
                      <div className="flex items-center gap-2">
                        <ItemIcon state={state} />
                        <span className={state === "present" ? "" : "text-text-muted"}>
                          {item.name}
                        </span>
                        {!item.required && (
                          <span className="text-xs text-text-muted">· no exigido</span>
                        )}
                      </div>
                      {/* Sangrada bajo el nombre, alineada con el texto y no con
                          el icono: el ítem sigue marcado como falta. */}
                      {item.note && (
                        <p className="ml-[22px] mt-0.5 text-xs text-text-muted">{item.note}</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        );
      })}
    </div>
  );
}
