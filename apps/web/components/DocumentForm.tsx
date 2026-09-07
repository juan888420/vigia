"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { listDocumentTypes, type ContractDocumentPayload, type DocumentTypeOption } from "@/lib/api";
import {
  EMPTY_DOCUMENT_FORM,
  STAGE_LABELS,
  STAGE_ORDER,
  toDocumentPayload,
  type DocumentFormValues,
  type DocumentLinkOption,
} from "@/lib/document-form";

// Formulario compartido por registrar y editar un documento.
//
// El catálogo de tipos documentales se pide al API, nunca se codifica aquí:
// son 29 tipos reales sembrados desde dos expedientes del cliente, y una lista
// fija en el código se desincronizaría del catálogo en cuanto se añada uno.
// Mismo patrón loading/ready/error que ContractForm usa para Modalidad.
//
// Las opciones de contexto (pagos, eventos, garantías) sí llegan por props
// desde el server component: son datos del contrato que la página ya cargó,
// no un catálogo.
//
// NO hay campo de etapa: la etapa se deriva del DocumentType elegido, que ya
// la trae del catálogo. Pedirla aparte permitiría contradecirla.
//
// NO hay campos de source, aiConfidence, validatedById ni validatedAt: son del
// flujo de clasificación con IA, que no existe todavía.

type CatalogState = "loading" | "ready" | "error";

const inputClass =
  "w-full rounded-md border border-border bg-base px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-border-strong focus:outline-none";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs text-text-secondary">{label}</span>
      {hint && <span className="ml-1.5 text-xs text-text-muted">{hint}</span>}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

interface DocumentFormProps {
  initialValues?: DocumentFormValues;
  /** Modalidad del contrato: decide qué tipos documentales aplican. */
  contractTypeId: string;
  linkOptions: DocumentLinkOption[];
  submitLabel: string;
  submittingLabel: string;
  backHref: string;
  onSubmit: (payload: ContractDocumentPayload) => Promise<unknown>;
}

export function DocumentForm({
  initialValues = EMPTY_DOCUMENT_FORM,
  contractTypeId,
  linkOptions,
  submitLabel,
  submittingLabel,
  backHref,
  onSubmit,
}: DocumentFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<DocumentFormValues>(initialValues);
  const [documentTypes, setDocumentTypes] = useState<DocumentTypeOption[]>([]);
  const [catalogState, setCatalogState] = useState<CatalogState>("loading");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Si esto falla, el select queda sin opciones. El aviso va arriba, junto al
  // campo afectado, no al pie: allí abajo se lee como "no hay tipos".
  const loadCatalog = useCallback(() => {
    setCatalogState("loading");
    listDocumentTypes(contractTypeId)
      .then((types) => {
        setDocumentTypes(types);
        setCatalogState("ready");
      })
      .catch(() => setCatalogState("error"));
  }, [contractTypeId]);

  useEffect(loadCatalog, [loadCatalog]);

  function update<K extends keyof DocumentFormValues>(key: K, value: DocumentFormValues[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  const selectedType = documentTypes.find((type) => type.id === form.documentTypeId);

  // Los grupos del <optgroup> siguen el orden del expediente, no el alfabético.
  const typesByStage = STAGE_ORDER.map((stage) => ({
    stage,
    types: documentTypes.filter((type) => type.stage === stage),
  })).filter((group) => group.types.length > 0);

  const linkGroups = ["Pagos", "Eventos", "Garantías"]
    .map((group) => ({ group, options: linkOptions.filter((option) => option.group === group) }))
    .filter((entry) => entry.options.length > 0);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(toDocumentPayload(form));
      router.push(backHref);
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Error al guardar el documento");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-5">
      {catalogState === "error" && (
        <div className="flex items-start gap-2 rounded-lg border border-status-atrasado-dim bg-status-atrasado-dim/40 px-3 py-2.5 text-sm text-status-atrasado">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div>
            <p>
              No se pudo cargar el catálogo de tipos documentales. Verifica que el API esté
              corriendo en <span className="font-mono">localhost:3333</span>.
            </p>
            <button
              type="button"
              onClick={loadCatalog}
              className="mt-1.5 rounded-md border border-status-atrasado px-2.5 py-1 text-xs transition-colors hover:bg-status-atrasado hover:text-base"
            >
              Reintentar
            </button>
          </div>
        </div>
      )}

      <Field label="Tipo documental">
        <select
          required
          disabled={catalogState !== "ready"}
          value={form.documentTypeId}
          onChange={(e) => update("documentTypeId", e.target.value)}
          className={`${inputClass} disabled:cursor-not-allowed disabled:text-text-muted`}
        >
          <option value="">{catalogState === "loading" ? "Cargando..." : "Seleccionar..."}</option>
          {typesByStage.map((group) => (
            <optgroup key={group.stage} label={STAGE_LABELS[group.stage]}>
              {group.types.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                  {type.required ? "" : " (opcional)"}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {selectedType && (
          <span className="mt-1.5 block text-xs text-text-muted">
            Etapa {STAGE_LABELS[selectedType.stage].toLocaleLowerCase()} · se archiva como{" "}
            <span className="font-mono">{selectedType.fileLabel}</span>
            {selectedType.appliesToEachPayment && " · se repite en cada pago"}
          </span>
        )}
      </Field>

      <Field label="De qué es soporte" hint="opcional">
        <select
          value={form.link}
          onChange={(e) => update("link", e.target.value)}
          className={inputClass}
        >
          <option value="">A nivel del contrato</option>
          {linkGroups.map((entry) => (
            <optgroup key={entry.group} label={entry.group}>
              {entry.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <span className="mt-1.5 block text-xs text-text-muted">
          {linkOptions.length === 0
            ? "Este contrato todavía no tiene pagos, eventos ni pólizas, así que el documento va a nivel del contrato."
            : "Un documento cuelga del contrato o de un solo elemento: un pago, un evento o una póliza."}
        </span>
      </Field>

      <Field label="Nombre original del archivo">
        <input
          required
          value={form.originalFileName}
          onChange={(e) => update("originalFileName", e.target.value)}
          placeholder="COMPROBANTE DE EGRESO.pdf"
          className={`${inputClass} font-mono`}
        />
        <span className="mt-1.5 block text-xs text-text-muted">
          Tal como viene en el expediente, con sus mayúsculas y sus erratas. Se conserva siempre:
          es lo que permite reconocer el archivo y auditar una clasificación equivocada.
        </span>
      </Field>

      <Field label="Ruta en el storage">
        <input
          required
          value={form.storagePath}
          onChange={(e) => update("storagePath", e.target.value)}
          placeholder="expedientes/CD-001-2025/pago-1/comprobante.pdf"
          className={`${inputClass} font-mono`}
        />
        <span className="mt-1.5 block text-xs text-text-muted">
          Provisional: todavía no hay subida de archivos. Escribe la ruta o la URL donde está hoy
          el documento.
        </span>
      </Field>

      {error && (
        <p className="rounded-lg border border-status-atrasado-dim bg-status-atrasado-dim/40 px-3 py-2.5 text-sm text-status-atrasado">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3 border-t border-border pt-5">
        <button
          type="submit"
          disabled={submitting || catalogState !== "ready"}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-base transition-colors hover:bg-accent/80 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? submittingLabel : submitLabel}
        </button>
        <Link href={backHref} className="text-sm text-text-secondary hover:text-text-primary">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
