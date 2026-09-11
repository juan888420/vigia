import type {
  ClassificationResult,
  DocumentConfirmationPayload,
  EventPayload,
  EventType,
  ExtractionResult,
} from "./api";
import { EVENT_TYPE_LABELS } from "./event-form";

// Módulo neutro (sin "use client"), igual que los demás *-form.ts: aquí vive
// todo lo que se puede razonar sin pantalla — qué es una revisión completa y
// en qué se convierte al confirmarla.
//
// Lo que este módulo NO hace, y es el motivo de que exista aparte: no decide
// nada. Traduce la propuesta de la IA a los campos de un formulario y el
// formulario ya revisado a los dos bodies que el API espera. Cualquier valor
// que salga de aquí pasó antes por las manos de una persona.

/**
 * Los tres tipos de evento entre los que se elige tras leer un otrosí.
 *
 * La lista es CORTA a propósito y no es la de `EVENT_TYPE_OPTIONS`: un otrosí
 * modifica, adiciona o prorroga. Una suspensión, un reinicio, una terminación
 * o una liquidación son actos distintos que no entran por este flujo.
 *
 * Y no hay valor por defecto. `/extraer` se abstiene de proponer el tipo
 * —un otrosí que toca valor Y plazo cae en los tres según cómo se mire, y eso
 * es criterio de la oficina— así que preseleccionar uno aquí sería inventar en
 * la UI justo lo que el API se cuidó de no inventar.
 */
export const AMENDMENT_EVENT_TYPES: EventType[] = ["AMENDMENT", "ADDITION", "EXTENSION"];

export const AMENDMENT_EVENT_TYPE_OPTIONS = AMENDMENT_EVENT_TYPES.map((value) => ({
  value,
  label: EVENT_TYPE_LABELS[value],
}));

/** Todo texto: es lo que hay en los inputs mientras se revisa. La conversión a
 *  número o a null ocurre una sola vez, al armar el payload. `eventType` vacío
 *  es "todavía no se ha elegido", no un tipo. */
export interface AmendmentReviewValues {
  documentTypeId: string;
  eventType: EventType | "";
  sequenceNumber: string;
  signatureDate: string;
  /** Plano, con signo, tal como lo emite MoneyInput ("-91478"). */
  valueDelta: string;
  daysDelta: string;
  storagePath: string;
}

/** Un entero con signo y nada más. `Number("")` es 0 y `Number("3 días")` es
 *  NaN: ninguno de los dos puede llegar al API como un plazo. */
const INTEGER_PATTERN = /^-?\d+$/;

/** La misma condición que `nonBlankText` en el API: al menos un carácter que
 *  no sea espacio. Se repite aquí para poder deshabilitar el botón antes de
 *  enviar, no para sustituir la del servidor — que sigue siendo la que manda. */
function isNonBlank(value: string): boolean {
  return /\S/.test(value);
}

/** La propuesta de la IA volcada en campos editables.
 *
 *  `daysDelta` puede llegar vacío y eso NO es un fallo: significa que el
 *  documento se contradecía y el modelo se abstuvo en vez de desempatar. La
 *  pantalla lo resalta y lo exige; aquí solo se refleja tal cual. */
export function reviewFromExtraction(
  classification: ClassificationResult,
  extraction: ExtractionResult,
): AmendmentReviewValues {
  return {
    documentTypeId: classification.proposal.documentTypeId,
    eventType: "",
    sequenceNumber:
      extraction.proposal.sequenceNumber === null ? "" : String(extraction.proposal.sequenceNumber),
    signatureDate: extraction.proposal.signatureDate ?? "",
    valueDelta: extraction.proposal.valueDelta ?? "",
    daysDelta: extraction.proposal.daysDelta === null ? "" : String(extraction.proposal.daysDelta),
    storagePath: "",
  };
}

/**
 * Las tres condiciones que habilitan el botón de confirmar.
 *
 * No incluye `signatureDate` ni `documentTypeId` aunque los dos sean
 * obligatorios: esos los bloquea el `required` nativo del input, que además
 * señala el campo concreto. Aquí están solo los que el navegador no puede
 * comprobar solo — un select sin preselección obligatoria, un entero que la IA
 * dejó vacío a propósito y una ruta que no puede ser solo espacios.
 */
export function isReviewComplete(values: AmendmentReviewValues): boolean {
  return (
    values.eventType !== "" &&
    INTEGER_PATTERN.test(values.daysDelta.trim()) &&
    isNonBlank(values.storagePath)
  );
}

/** Solo para el aviso bajo el campo: el botón ya está deshabilitado. Distingue
 *  "todavía no lo has llenado" de "lo llenaste con algo que no es un número". */
export function daysDeltaError(values: AmendmentReviewValues): string | null {
  const raw = values.daysDelta.trim();
  if (raw === "") return null;
  return INTEGER_PATTERN.test(raw) ? null : "Escribe un número entero de días, con signo si reduce.";
}

/** El evento que se crea primero. `eventDate` es la fecha de firma del acta:
 *  es la única fecha que el documento da y la que el API exige. */
export function toEventPayload(values: AmendmentReviewValues): EventPayload {
  if (values.eventType === "") {
    // Inalcanzable: `isReviewComplete` lo impide y el botón está
    // deshabilitado. Explícito para que un cambio futuro en la UI no cuele un
    // evento sin tipo en vez de romperse aquí.
    throw new Error("No se eligió el tipo de evento");
  }

  return {
    type: values.eventType,
    sequenceNumber:
      values.sequenceNumber.trim() === "" ? null : Number(values.sequenceNumber.trim()),
    eventDate: values.signatureDate,
    valueDelta: values.valueDelta.trim() === "" ? null : values.valueDelta.trim(),
    daysDelta: Number(values.daysDelta.trim()),
    startDate: null,
    relatedEventId: null,
    description: null,
  };
}

/**
 * El documento que se confirma, ya con el evento creado.
 *
 * `aiConfidence` es la de la CLASIFICACIÓN, no la de la extracción: la columna
 * registra con cuánta certeza la IA propuso *el tipo documental*, que es lo
 * que esta fila guarda. La certeza de los campos leídos vive en el
 * ContractEvent que ya se creó, y no en el archivo.
 *
 * Los metadatos del archivo salen de la respuesta del API, no del `File` del
 * navegador: `contentHash` lo calculó el servidor sobre los bytes que de
 * verdad recibió. Rehashearlo aquí abriría la puerta a que el hash guardado y
 * el documento leído no fueran del mismo archivo.
 */
export function toConfirmationPayload(
  values: AmendmentReviewValues,
  classification: ClassificationResult,
  extraction: ExtractionResult,
  eventId: string,
): DocumentConfirmationPayload {
  return {
    documentTypeId: values.documentTypeId,
    eventId,
    aiConfidence: classification.proposal.confidence,
    aiNotes: extraction.proposal.notes,
    originalFileName: classification.file.originalFileName,
    storagePath: values.storagePath.trim(),
    mimeType: classification.file.mimeType,
    fileSize: classification.file.fileSize,
    contentHash: classification.file.contentHash,
  };
}

/** "0.97" → "97 %". Entero: los decimales de una certeza sugieren una
 *  precisión que el modelo no tiene, y este número solo sirve para decidir
 *  cuánto mirar el campo. */
export function formatConfidence(value: number | null): string | null {
  return value === null ? null : `${Math.round(value * 100)} %`;
}

/** Adónde mandar a quien tiene que seguir a mano. Lleva el tipo propuesto para
 *  que el formulario manual no empiece en blanco: es lo ÚNICO que se
 *  prellena — de los demás campos la IA no ha propuesto nada. */
export function manualFormHref(contractId: string, documentTypeId?: string): string {
  const base = `/contratos/${contractId}/documentos/nuevo`;
  return documentTypeId ? `${base}?tipo=${encodeURIComponent(documentTypeId)}` : base;
}
