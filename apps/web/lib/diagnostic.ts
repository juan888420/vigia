import type { ContractStatus, FindingReference, FindingSeverity } from "./api";

// Módulo neutro (sin "use client"), igual que los demás lib/*.ts.
// Solo presentación: ni una regla ni un cálculo viven aquí. El estado y los
// hallazgos los produce el motor de reglas del API.

export const STATUS_LABELS: Record<ContractStatus, string> = {
  AL_DIA: "Al día",
  CON_PENDIENTES: "Con pendientes",
  ATRASADO: "Atrasado",
  SUSPENDIDO: "Suspendido",
};

/** SUSPENDIDO no es un grado de cumplimiento sino una situación del contrato:
 *  por eso es el único que no usa la escala verde/ámbar/rojo. */
export const STATUS_STYLES: Record<ContractStatus, { badge: string; dot: string }> = {
  AL_DIA: { badge: "bg-status-al-dia-dim text-status-al-dia", dot: "bg-status-al-dia" },
  CON_PENDIENTES: {
    badge: "bg-status-pendientes-dim text-status-pendientes",
    dot: "bg-status-pendientes",
  },
  ATRASADO: { badge: "bg-status-atrasado-dim text-status-atrasado", dot: "bg-status-atrasado" },
  SUSPENDIDO: { badge: "bg-surface-hover text-text-secondary", dot: "bg-text-muted" },
};

export const SEVERITY_LABELS: Record<FindingSeverity, string> = {
  CRITICAL: "Crítico",
  WARNING: "Atención",
  INFO: "Aviso",
};

export const SEVERITY_STYLES: Record<FindingSeverity, { badge: string; dot: string }> = {
  CRITICAL: { badge: "bg-status-atrasado-dim text-status-atrasado", dot: "bg-status-atrasado" },
  WARNING: {
    badge: "bg-status-pendientes-dim text-status-pendientes",
    dot: "bg-status-pendientes",
  },
  INFO: { badge: "bg-surface-hover text-text-secondary", dot: "bg-text-muted" },
};

/**
 * Pantalla donde vive el registro que sustenta un hallazgo.
 *
 * Apunta a la lista del recurso, no a una vista de detalle: no existe una
 * pantalla por evento o por pago, y llevar a "editar" desde un diagnóstico
 * invitaría a corregir el dato para que el hallazgo desaparezca.
 *
 * Un `documentType` no tiene registro que enlazar — es el documento que
 * debería existir y no existe — así que lleva a la lista de documentos del
 * contrato, que es donde se carga.
 */
export function referenceHref(reference: FindingReference, contractId: string): string {
  const section: Record<FindingReference["kind"], string> = {
    event: "eventos",
    payment: "pagos",
    guarantee: "garantias",
    document: "documentos",
    documentType: "documentos",
  };
  return `/contratos/${contractId}/${section[reference.kind]}`;
}
