"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, FileText, Loader2, ScanLine, Sparkles } from "lucide-react";
import {
  ApiError,
  classifyDocument,
  confirmDocument,
  createEvent,
  extractDocument,
  listDocumentTypes,
  type ClassificationResult,
  type DocumentTypeOption,
  type EventType,
  type ExtractionResult,
} from "@/lib/api";
import { withAuth } from "@/lib/auth-client";
import {
  AMENDMENT_EVENT_TYPE_OPTIONS,
  daysDeltaError,
  formatConfidence,
  isReviewComplete,
  manualFormHref,
  reviewFromExtraction,
  toConfirmationPayload,
  toEventPayload,
  type AmendmentReviewValues,
} from "@/lib/ai-document";
import { STAGE_LABELS, STAGE_ORDER } from "@/lib/document-form";
import { MoneyInput } from "@/components/MoneyInput";

// Registrar un documento a partir del PDF, con la IA leyéndolo primero.
//
// Es la cara de usuario del flujo del README: `IA propone → humano valida →
// sistema guarda`. Ninguna de las dos llamadas de IA escribe nada; lo único
// que crea datos es el último botón, y crea exactamente lo que se ve en
// pantalla en ese momento — no lo que la IA propuso.
//
// Dónde se corta el camino automático, a propósito:
//   · PDF escaneado → YA NO se corta. El API se lo manda al modelo como
//     imágenes de página y devuelve una propuesta normal. Lo único que cambia
//     en esta pantalla es que se avisa de que el dato salió de una imagen, que
//     no se lee con la misma fiabilidad que un texto exacto.
//   · Tipo distinto de OTROSI → se muestra el tipo y se sigue a mano. Hoy solo
//     hay extracción de otrosíes; fingir que se leyeron los campos de un acta
//     de inicio sería peor que no leerlos.
//   · daysDelta vacío → la IA se abstuvo porque el documento se contradice.
//     Aquí eso NO se rellena con un valor por defecto: se resalta y se exige.
//
// El orden de escritura al confirmar es evento primero, documento después, y
// no es indiferente: el documento necesita el `eventId` del evento, así que si
// el primer paso falla el segundo ni se intenta. El caso contrario —evento
// creado y documento fallido— deja un evento sin su soporte, que es
// precisamente lo que el motor de reglas sabe detectar y reportar.

type Stage =
  | "select"
  | "classifying"
  | "unreadable"
  | "otherType"
  | "extracting"
  | "review"
  | "saving";

type CatalogState = "loading" | "ready" | "error";

const inputClass =
  "w-full rounded-md border border-border bg-base px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-border-strong focus:outline-none";

/** El campo que la IA dejó vacío por contradicción del documento. Mismo par de
 *  colores que usan el resto de advertencias de la app (EventForm, la fecha
 *  vigente del contrato): ámbar es "míralo", rojo es "está mal". */
const attentionInputClass =
  "w-full rounded-md border border-status-pendientes bg-status-pendientes-dim/40 px-3 py-2 text-sm text-text-primary placeholder:text-status-pendientes/60 focus:border-status-pendientes focus:outline-none";

function Field({
  label,
  hint,
  confidence,
  children,
}: {
  label: string;
  hint?: string;
  /** Certeza de la IA en ESTE campo. Es informativa y nunca bloquea la
   *  edición: sirve para decidir cuánto mirarlo, no para impedir cambiarlo. */
  confidence?: string | null;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs text-text-secondary">{label}</span>
      {hint && <span className="ml-1.5 text-xs text-text-muted">{hint}</span>}
      <div className="mt-1.5">{children}</div>
      {confidence && (
        <span className="mt-1 block text-xs text-text-muted">Certeza de la IA: {confidence}</span>
      )}
    </label>
  );
}

function Working({ label }: { label: string }) {
  return (
    <div className="mt-8 flex items-center gap-2.5 rounded-lg border border-border bg-surface px-4 py-4 text-sm text-text-secondary">
      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-accent" />
      {label}
    </div>
  );
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-status-atrasado-dim bg-status-atrasado-dim/40 px-3 py-2.5 text-sm text-status-atrasado">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function AiDocumentFlow({
  contractId,
  contractTypeId,
}: {
  contractId: string;
  contractTypeId: string;
}) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("select");
  const [file, setFile] = useState<File | null>(null);
  const [classification, setClassification] = useState<ClassificationResult | null>(null);
  const [extraction, setExtraction] = useState<ExtractionResult | null>(null);
  const [review, setReview] = useState<AmendmentReviewValues | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [documentTypes, setDocumentTypes] = useState<DocumentTypeOption[]>([]);
  const [catalogState, setCatalogState] = useState<CatalogState>("loading");

  // Mismo patrón que DocumentForm: el catálogo se pide al API y nunca se
  // codifica aquí. Se carga desde el principio para que al llegar a la
  // revisión el desplegable ya esté listo.
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

  function updateReview<K extends keyof AmendmentReviewValues>(
    key: K,
    value: AmendmentReviewValues[K],
  ) {
    setReview((current) => (current === null ? current : { ...current, [key]: value }));
  }

  function restart() {
    setStage("select");
    setFile(null);
    setClassification(null);
    setExtraction(null);
    setReview(null);
    setError(null);
  }

  async function handleAnalyze(selected: File) {
    setFile(selected);
    setError(null);
    setStage("classifying");

    let classified: ClassificationResult;
    try {
      // `withAuth` en las tres llamadas, no solo en la de confirmar: desde que
      // /clasificar y /extraer exigen token, un token caducado a mitad de
      // flujo tiene que mandar a /login igual que en el último paso, en vez de
      // enseñar un "No autenticado" suelto que el usuario no sabe resolver.
      // Los errores que no son 401 —incluido el 422 del escaneo— salen de aquí
      // intactos.
      classified = await withAuth(() => classifyDocument(contractId, selected));
    } catch (classifyError) {
      // 422 YA NO significa "escaneado": esos ahora se procesan por la vía de
      // imagen. Hoy solo lo devuelve el API cuando el modelo declina leer el
      // documento. Conserva pantalla propia en vez de un error rojo porque la
      // salida sigue siendo la misma: registrarlo a mano.
      if (classifyError instanceof ApiError && classifyError.status === 422) {
        setError(classifyError.message);
        setStage("unreadable");
        return;
      }
      setError(
        classifyError instanceof Error ? classifyError.message : "No se pudo clasificar el PDF",
      );
      setStage("select");
      return;
    }

    setClassification(classified);

    // El único tipo con extracción implementada. Los demás siguen a mano: no
    // hay un extractor genérico y no se va a fingir uno.
    if (classified.proposal.documentType.code !== "OTROSI") {
      setStage("otherType");
      return;
    }

    setStage("extracting");
    try {
      const extracted = await withAuth(() => extractDocument(contractId, selected));
      setExtraction(extracted);
      setReview(reviewFromExtraction(classified, extracted));
      setStage("review");
    } catch (extractError) {
      // Se cae al paso 3: el tipo ya está clasificado y sigue siendo útil
      // aunque los campos no se hayan podido leer.
      setError(
        extractError instanceof Error
          ? extractError.message
          : "No se pudieron leer los campos del otrosí",
      );
      setStage("otherType");
    }
  }

  async function handleConfirm(event: React.FormEvent) {
    event.preventDefault();
    if (review === null || classification === null || extraction === null) return;

    setStage("saving");
    setError(null);

    // (a) El evento. Si falla, no se toca el documento.
    let createdEventId: string;
    try {
      const created = await createEvent(contractId, toEventPayload(review));
      createdEventId = created.id;
    } catch (eventError) {
      setError(
        eventError instanceof Error
          ? `No se pudo crear el evento: ${eventError.message}`
          : "No se pudo crear el evento",
      );
      setStage("review");
      return;
    }

    // (b) El documento, ya con el evento al que pertenece. Única llamada
    // autenticada: `withAuth` limpia la sesión y manda a /login si el token
    // caducó, en vez de dejar un 401 sin explicar.
    try {
      await withAuth(() =>
        confirmDocument(
          contractId,
          toConfirmationPayload(review, classification, extraction, createdEventId),
        ),
      );
    } catch (confirmError) {
      // El evento SÍ se creó. Decirlo es obligatorio: sin esto el usuario
      // reintentaría desde cero y acabaría con el evento duplicado.
      setError(
        `El evento se creó correctamente, pero el documento no se pudo registrar: ${
          confirmError instanceof Error ? confirmError.message : "error desconocido"
        }. Regístralo desde el formulario manual para no duplicar el evento.`,
      );
      setStage("review");
      return;
    }

    router.push(`/contratos/${contractId}?documento=agregado`);
    router.refresh();
  }

  // ── 1. Selección de archivo ───────────────────────────────────────────────
  if (stage === "select" || stage === "classifying") {
    return (
      <div className="mt-8 space-y-5">
        {error && <ErrorBox>{error}</ErrorBox>}

        <label className="block">
          <span className="text-xs text-text-secondary">Archivo PDF</span>
          <div className="mt-1.5">
            <input
              type="file"
              accept="application/pdf,.pdf"
              disabled={stage === "classifying"}
              onChange={(e) => {
                const selected = e.target.files?.[0];
                // Se vacía el input en cuanto se tiene el File. Sin esto,
                // volver atrás y elegir el MISMO archivo no dispara onChange
                // —el value no cambia— y la pantalla se queda muerta.
                e.target.value = "";
                if (selected) void handleAnalyze(selected);
              }}
              className="w-full cursor-pointer rounded-md border border-border bg-base px-3 py-2 text-sm text-text-secondary file:mr-3 file:cursor-pointer file:rounded file:border-0 file:bg-surface-hover file:px-3 file:py-1.5 file:text-sm file:text-text-primary hover:border-border-strong disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          <span className="mt-1.5 block text-xs text-text-muted">
            Un solo documento, con capa de texto. El archivo no se guarda: se lee para proponer
            una clasificación y se descarta.
          </span>
        </label>

        {stage === "classifying" ? (
          <Working label="Leyendo el documento y clasificándolo..." />
        ) : (
          <p className="text-sm text-text-secondary">
            ¿Prefieres teclearlo?{" "}
            <Link href={manualFormHref(contractId)} className="text-accent hover:underline">
              Registrar el documento a mano
            </Link>
            .
          </p>
        )}
      </div>
    );
  }

  // ── 2b. PDF escaneado (422) ───────────────────────────────────────────────
  if (stage === "unreadable") {
    return (
      <div className="mt-8 space-y-5">
        <div className="flex items-start gap-3 rounded-lg border border-status-pendientes-dim bg-status-pendientes-dim/40 px-4 py-4">
          <ScanLine className="mt-0.5 h-4 w-4 shrink-0 text-status-pendientes" />
          <div>
            <p className="text-sm font-medium text-status-pendientes">
              La IA no pudo procesar este documento
            </p>
            <p className="mt-1 text-sm text-text-secondary">
              {error ?? "El modelo declinó leerlo."} Regístralo a mano: el expediente no depende de
              que la IA sepa leerlo.
            </p>
            <p className="mt-1 font-mono text-xs text-text-muted">{file?.name}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href={manualFormHref(contractId)}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-base transition-colors hover:bg-accent/80"
          >
            Registrar a mano
          </Link>
          <button
            type="button"
            onClick={restart}
            className="text-sm text-text-secondary hover:text-text-primary"
          >
            Probar con otro archivo
          </button>
        </div>
      </div>
    );
  }

  // ── 3. Tipo clasificado sin extracción ────────────────────────────────────
  if (stage === "otherType" || stage === "extracting") {
    const proposal = classification?.proposal;

    return (
      <div className="mt-8 space-y-5">
        {proposal && (
          <div className="rounded-lg border border-border bg-surface p-5">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-text-muted">
              <Sparkles className="h-3.5 w-3.5 text-accent" />
              Tipo propuesto por la IA
            </div>
            <p className="mt-2 text-sm font-medium text-text-primary">
              {proposal.documentType.name}
            </p>
            <p className="mt-1 text-xs text-text-muted">
              Etapa {STAGE_LABELS[proposal.documentType.stage].toLocaleLowerCase()} · certeza{" "}
              {formatConfidence(proposal.confidence)}
            </p>
            <p className="mt-3 border-t border-border pt-3 text-sm text-text-secondary">
              {proposal.reasoning}
            </p>
          </div>
        )}

        {stage === "extracting" ? (
          <Working label="Leyendo los campos del otrosí..." />
        ) : (
          <>
            {error && <ErrorBox>{error}</ErrorBox>}
            {/* Esta pantalla cubre dos casos: un tipo sin extractor, y un
                otrosí cuya extracción falló. La salida es la misma —seguir a
                mano con el tipo ya puesto— pero el motivo no, y decir el que
                no es deja al usuario buscando un problema inexistente. */}
            <p className="text-sm text-text-secondary">
              {error
                ? "El tipo documental sí se clasificó, así que no hace falta empezar de cero: continúa a mano con el tipo ya preseleccionado."
                : "La lectura automática de campos solo está implementada para otrosíes. Para este tipo, el resto del registro se completa a mano — el tipo documental ya va preseleccionado."}
            </p>
            <div className="flex items-center gap-3 border-t border-border pt-5">
              {/* Con los metadatos del archivo: el API ya los calculó al
                  clasificar, así que volver a teclear el nombre —y no poder
                  teclear el hash en absoluto— sería perder datos que el
                  sistema ya tiene. */}
              <Link
                href={manualFormHref(contractId, proposal?.documentTypeId, classification?.file)}
                className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-base transition-colors hover:bg-accent/80"
              >
                Continuar en formulario manual
              </Link>
              <button
                type="button"
                onClick={restart}
                className="text-sm text-text-secondary hover:text-text-primary"
              >
                Probar con otro archivo
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  // ── 4 y 5. Revisión ───────────────────────────────────────────────────────
  if (review === null || classification === null || extraction === null) return null;

  const fieldConfidence = extraction.proposal.fieldConfidence;
  const missingDaysDelta = review.daysDelta.trim() === "";
  const daysError = daysDeltaError(review);
  const complete = isReviewComplete(review);
  const saving = stage === "saving";

  const typesByStage = STAGE_ORDER.map((documentStage) => ({
    stage: documentStage,
    types: documentTypes.filter((type) => type.stage === documentStage),
  })).filter((group) => group.types.length > 0);

  return (
    <form onSubmit={handleConfirm} className="mt-8 space-y-5">
      <div className="rounded-lg border border-border bg-surface px-4 py-3">
        <div className="flex items-start gap-2.5">
          <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-muted" />
          <div className="min-w-0">
            <p className="truncate font-mono text-xs text-text-secondary">
              {classification.file.originalFileName}
            </p>
            <p className="mt-0.5 text-xs text-text-muted">
              {extraction.extraction.pages} páginas · certeza global de la extracción{" "}
              {formatConfidence(extraction.proposal.confidence)}
            </p>
            {/* Que el documento venga de un escaneo no cambia el flujo, pero sí
                cambia cuánto conviene mirar cada cifra: la IA interpretó
                píxeles, no leyó un texto exacto. Callarlo sería esconderle a
                quien valida el dato más relevante para decidir cuánto
                desconfiar. */}
            {extraction.extraction.source === "PAGE_IMAGES" && (
              <p className="mt-1.5 inline-flex items-center gap-1.5 rounded border border-status-pendientes-dim bg-status-pendientes-dim/40 px-2 py-1 text-xs text-status-pendientes">
                <ScanLine className="h-3 w-3 shrink-0" />
                Documento escaneado: la IA leyó las páginas como imagen, no un texto exacto.
                Contrasta las cifras con el original.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* El clasificador dijo OTROSI y el extractor dice que no lo es. No
          bloquea: es justamente la clase de desacuerdo que decide una persona. */}
      {!extraction.looksLikeAmendment && (
        <div className="flex items-start gap-2 rounded-lg border border-status-pendientes-dim bg-status-pendientes-dim/40 px-3 py-2.5 text-sm text-status-pendientes">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>
            Al leerlo en detalle, la IA no reconoció este documento como un otrosí, aunque lo había
            clasificado como tal. Revisa el tipo antes de confirmar.
          </p>
        </div>
      )}

      {catalogState === "error" && (
        <ErrorBox>
          <p>No se pudo cargar el catálogo de tipos documentales.</p>
          <button
            type="button"
            onClick={loadCatalog}
            className="mt-1.5 rounded-md border border-status-atrasado px-2.5 py-1 text-xs transition-colors hover:bg-status-atrasado hover:text-base"
          >
            Reintentar
          </button>
        </ErrorBox>
      )}

      <Field
        label="Tipo documental"
        hint="propuesto por la IA, editable"
        confidence={formatConfidence(classification.proposal.confidence)}
      >
        <select
          required
          disabled={catalogState !== "ready" || saving}
          value={review.documentTypeId}
          onChange={(e) => updateReview("documentTypeId", e.target.value)}
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
      </Field>

      {/* El único campo que la IA NO propone nunca, y la UI lo repite: un
          otrosí que toca valor y plazo cabe en los tres, y cuál es depende del
          criterio de la oficina, no del documento. */}
      <Field label="Tipo de evento" hint="obligatorio, la IA no lo propone">
        <select
          required
          disabled={saving}
          value={review.eventType}
          onChange={(e) => updateReview("eventType", e.target.value as EventType | "")}
          className={inputClass}
        >
          <option value="">Seleccionar...</option>
          {AMENDMENT_EVENT_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs text-text-muted">
          Un otrosí puede registrarse como modificación, adición o prórroga según lo que cambie.
          Esto lo decide la oficina, no la IA.
        </span>
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field
          label="Número del otrosí"
          hint="opcional"
          confidence={formatConfidence(fieldConfidence.sequenceNumber)}
        >
          <input
            inputMode="numeric"
            disabled={saving}
            value={review.sequenceNumber}
            onChange={(e) => updateReview("sequenceNumber", e.target.value)}
            placeholder="1"
            className={`${inputClass} font-mono`}
          />
        </Field>

        <Field
          label="Fecha de firma"
          confidence={formatConfidence(fieldConfidence.signatureDate)}
        >
          <input
            required
            type="date"
            disabled={saving}
            value={review.signatureDate}
            onChange={(e) => updateReview("signatureDate", e.target.value)}
            className={`${inputClass} font-mono`}
          />
        </Field>
      </div>

      <Field
        label="Efecto en el valor"
        hint="opcional, negativo si reduce"
        confidence={formatConfidence(fieldConfidence.valueDelta)}
      >
        <MoneyInput
          allowNegative
          value={review.valueDelta}
          onChange={(plain) => updateReview("valueDelta", plain)}
          placeholder="15.000.000"
          className={`${inputClass} font-mono`}
        />
      </Field>

      {/* El campo que la IA dejó en null porque el documento se contradecía.
          Va resaltado y es obligatorio: un plazo puesto por defecto aquí
          acabaría en la fecha de terminación vigente del contrato. */}
      <Field
        label="Días añadidos"
        hint={missingDaysDelta ? "la IA no pudo leerlo" : undefined}
        confidence={missingDaysDelta ? null : formatConfidence(fieldConfidence.daysDelta)}
      >
        <input
          inputMode="numeric"
          disabled={saving}
          value={review.daysDelta}
          onChange={(e) => updateReview("daysDelta", e.target.value)}
          placeholder="30"
          aria-invalid={missingDaysDelta || daysError !== null}
          className={`font-mono ${missingDaysDelta || daysError ? attentionInputClass : inputClass}`}
        />
        {daysError ? (
          <span className="mt-1 block text-xs text-status-pendientes">{daysError}</span>
        ) : (
          missingDaysDelta && (
            <span className="mt-1 block text-xs text-status-pendientes">
              La IA se abstuvo de proponer un valor. Léelo en el documento y escríbelo: sin este
              dato no se puede confirmar.
            </span>
          )
        )}
      </Field>

      {/* Siempre visible y sin colapsar: son las contradicciones que la IA
          encontró y NO resolvió, y quien confirma tiene que haberlas leído. */}
      {extraction.proposal.notes && (
        <section className="rounded-lg border border-status-pendientes-dim bg-status-pendientes-dim/40 p-4">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-status-pendientes">
            <AlertTriangle className="h-3.5 w-3.5" />
            Inconsistencias detectadas por la IA
          </div>
          <p className="mt-2 whitespace-pre-line text-sm text-text-secondary">
            {extraction.proposal.notes}
          </p>
          <p className="mt-2 border-t border-status-pendientes-dim pt-2 text-xs text-text-muted">
            La IA las señala pero no las resuelve. Verifica los campos contra el documento antes de
            confirmar.
          </p>
        </section>
      )}

      <Field label="Ruta en el storage">
        <input
          required
          disabled={saving}
          value={review.storagePath}
          onChange={(e) => updateReview("storagePath", e.target.value)}
          placeholder="expedientes/CD-007-2025/otrosi-1.pdf"
          className={`${inputClass} font-mono`}
        />
        <span className="mt-1.5 block text-xs text-text-muted">
          Provisional: todavía no hay subida de archivos. Escribe la ruta o la URL donde está hoy
          el documento.
        </span>
      </Field>

      {error && <ErrorBox>{error}</ErrorBox>}

      <div className="flex items-center gap-3 border-t border-border pt-5">
        <button
          type="submit"
          disabled={!complete || saving}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-base transition-colors hover:bg-accent/80 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Guardando..." : "Confirmar"}
        </button>
        <button
          type="button"
          onClick={restart}
          disabled={saving}
          className="text-sm text-text-secondary hover:text-text-primary disabled:opacity-50"
        >
          Descartar y empezar de nuevo
        </button>
      </div>
      <p className="text-xs text-text-muted">
        Al confirmar se crean dos registros: el evento del contrato y el documento que lo soporta.
        Hasta entonces no se ha guardado nada.
      </p>
    </form>
  );
}
