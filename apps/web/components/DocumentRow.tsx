import type { ContractDocument } from "@/lib/api";
import { describeLink, STAGE_LABELS, type DocumentLinkOption } from "@/lib/document-form";
import { DocumentActions } from "./DocumentActions";

// Muestra solo lo guardado. Aquí no se dice si el documento "cumple" un
// requisito ni si falta alguno: comparar el expediente contra los
// DocumentRequirement es del motor de reglas.

export function DocumentRow({
  document,
  contractId,
  linkOptions,
}: {
  document: ContractDocument;
  contractId: string;
  linkOptions: DocumentLinkOption[];
}) {
  return (
    <article className="rounded-lg border border-border bg-surface p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-text-primary">
              {document.documentType?.name ?? "Sin clasificar"}
            </span>
            {document.documentType && (
              <span className="rounded border border-border-strong px-1.5 py-0.5 text-[10px] text-text-muted">
                {STAGE_LABELS[document.documentType.stage]}
              </span>
            )}
          </div>
          <p className="mt-1.5 break-all font-mono text-xs text-text-secondary">
            {document.originalFileName}
          </p>
          <p className="mt-1 text-xs text-text-muted">
            {describeLink(document, linkOptions)}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-3">
          <DocumentActions
            id={document.id}
            originalFileName={document.originalFileName}
            editHref={`/contratos/${contractId}/documentos/${document.id}/editar`}
          />
        </div>
      </div>

      <div className="mt-4 border-t border-border pt-4">
        <dt className="text-xs text-text-muted">Ruta en el storage</dt>
        <dd className="mt-0.5 break-all font-mono text-xs text-text-secondary">
          {document.storagePath}
        </dd>
      </div>
    </article>
  );
}
