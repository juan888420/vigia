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
}

export const EMPTY_DOCUMENT_FORM: DocumentFormValues = {
  documentTypeId: "",
  link: CONTRACT_LEVEL_LINK,
  originalFileName: "",
  storagePath: "",
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
  };
}

export function documentToFormValues(document: ContractDocument): DocumentFormValues {
  return {
    documentTypeId: document.documentTypeId ?? "",
    link: documentLink(document),
    originalFileName: document.originalFileName,
    storagePath: document.storagePath,
  };
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
