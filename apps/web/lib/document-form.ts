import type {
  ContractDocument,
  ContractDocumentPayload,
  ContractEvent,
  ContractStage,
  Guarantee,
  Payment,
} from "./api";
import { eventLabel } from "./event-form";
import { GUARANTEE_TYPE_LABELS } from "./guarantee-form";

// Módulo neutro (sin "use client"), igual que los demás *-form.ts.

export const STAGE_LABELS: Record<ContractStage, string> = {
  PRECONTRACTUAL: "Precontractual",
  CONTRACTUAL: "Contractual",
  POSTCONTRACTUAL: "Postcontractual",
};

/** Orden de las etapas en pantalla. El alfabético las desordenaría
 *  ("Contractual" antes que "Precontractual"). */
export const STAGE_ORDER: ContractStage[] = [
  "PRECONTRACTUAL",
  "CONTRACTUAL",
  "POSTCONTRACTUAL",
];

/**
 * A qué cuelga el documento, codificado como un solo valor de select.
 *
 * El modelo tiene tres FK excluyentes (paymentId / eventId / guaranteeId) pero
 * la pregunta para el usuario es una sola: "¿de qué es soporte este documento?".
 * Un único select hace imposible por construcción elegir dos a la vez — el API
 * lo vuelve a comprobar de todos modos, porque la UI no es una garantía.
 *
 * "" = documento a nivel del contrato (estudio previo, CDP, clausulado).
 */
export type DocumentLink = string;

export const CONTRACT_LEVEL_LINK: DocumentLink = "";

export interface DocumentLinkOption {
  value: DocumentLink;
  label: string;
  group: string;
}

/** Opciones de contexto disponibles en este contrato, agrupadas para el
 *  <optgroup>. Un contrato sin pagos ni eventos ni pólizas devuelve lista
 *  vacía y el select queda solo con "A nivel del contrato". */
export function buildLinkOptions(
  payments: Payment[],
  events: ContractEvent[],
  guarantees: Guarantee[],
): DocumentLinkOption[] {
  return [
    ...payments.map((payment) => ({
      value: `payment:${payment.id}`,
      label: `Pago ${payment.sequenceNumber}`,
      group: "Pagos",
    })),
    ...events.map((event) => ({
      value: `event:${event.id}`,
      label: `${eventLabel(event)} — ${event.eventDate}`,
      group: "Eventos",
    })),
    ...guarantees.map((guarantee) => ({
      value: `guarantee:${guarantee.id}`,
      label: `${GUARANTEE_TYPE_LABELS[guarantee.type]} ${guarantee.policyNumber}`,
      group: "Garantías",
    })),
  ];
}

export interface DocumentFormValues {
  documentTypeId: string;
  link: DocumentLink;
  originalFileName: string;
  storagePath: string;
  /** Los tres metadatos que NO se teclean: o los calculó el API al leer el
   *  PDF, o vienen de un documento ya guardado. El formulario los transporta y
   *  los muestra, nunca los deja editar — un mimeType o un hash escritos a
   *  mano describirían un archivo que nadie comprobó. */
  mimeType: string | null;
  fileSize: number | null;
  contentHash: string | null;
}

export const EMPTY_DOCUMENT_FORM: DocumentFormValues = {
  documentTypeId: "",
  link: CONTRACT_LEVEL_LINK,
  originalFileName: "",
  storagePath: "",
  mimeType: null,
  fileSize: null,
  contentHash: null,
};

/** Decodifica el select en las tres FK del modelo. Exactamente una queda con
 *  valor, o ninguna si el documento es del contrato. */
export function toDocumentPayload(form: DocumentFormValues): ContractDocumentPayload {
  const [kind, id] = form.link.split(":");

  return {
    documentTypeId: form.documentTypeId,
    paymentId: kind === "payment" ? id : null,
    eventId: kind === "event" ? id : null,
    guaranteeId: kind === "guarantee" ? id : null,
    originalFileName: form.originalFileName.trim(),
    storagePath: form.storagePath.trim(),
    mimeType: form.mimeType,
    fileSize: form.fileSize,
    contentHash: form.contentHash,
  };
}

export function documentToFormValues(document: ContractDocument): DocumentFormValues {
  return {
    documentTypeId: document.documentTypeId ?? "",
    link: documentLink(document),
    originalFileName: document.originalFileName,
    storagePath: document.storagePath,
    mimeType: document.mimeType,
    fileSize: document.fileSize,
    contentHash: document.contentHash,
  };
}

/** Bytes a algo legible: "1,2 MB", no "1289432". El tamaño solo sirve para
 *  reconocer el archivo de un vistazo, así que se redondea; el valor exacto es
 *  el que viaja al API, no el que se muestra. Base 1024, que es la que reporta
 *  el sistema operativo donde el funcionario ve el mismo archivo. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;

  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }

  // Un decimal por debajo de 10 ("1,2 MB"); por encima no aporta ("14 MB").
  const formatted = value.toLocaleString("es-CO", {
    maximumFractionDigits: value < 10 ? 1 : 0,
  });
  return `${formatted} ${units[unit]}`;
}

/** La codificación inversa de toDocumentPayload. */
export function documentLink(document: ContractDocument): DocumentLink {
  if (document.paymentId) return `payment:${document.paymentId}`;
  if (document.eventId) return `event:${document.eventId}`;
  if (document.guaranteeId) return `guarantee:${document.guaranteeId}`;
  return CONTRACT_LEVEL_LINK;
}

/** Cómo se lee el contexto de un documento ya guardado. Resuelve el id contra
 *  las listas del contrato para mostrar "Pago 2" en vez de un cuid. */
export function describeLink(
  document: ContractDocument,
  options: DocumentLinkOption[],
): string {
  const link = documentLink(document);
  if (link === CONTRACT_LEVEL_LINK) return "A nivel del contrato";
  return options.find((option) => option.value === link)?.label ?? "Elemento no encontrado";
}
