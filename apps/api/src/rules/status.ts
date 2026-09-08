import type { ContractStatus, CurrentEndDate, Finding, RuleCode } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Parte 3 — estado general.
//
// ESTE ES EL ÚNICO CRITERIO DEL MOTOR QUE EL CLIENTE NO FIJÓ. Confirmó que
// todos los documentos pesan igual, pero nunca dijo qué combinación de
// hallazgos convierte un contrato en "atrasado" en vez de "con pendientes".
// Por eso vive aislado en su propia función y en una sola lista: ajustarlo
// después es mover un código de regla de aquí, sin tocar ninguna regla ni
// ningún cálculo.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Hallazgos que por sí solos dejan el contrato atrasado. Todos comparten la
 * misma naturaleza: o el contrato quedó descubierto (una modificación sin
 * póliza, un contrato iniciado sin garantías, una póliza vencida sin
 * liquidación), o el plazo se acabó / está por acabarse sin que nadie haya
 * actuado, o las cifras no pueden ser ciertas (se pagó más de lo que el
 * contrato vale).
 *
 * Falta documental NO entra aquí: MODIFICACION_SIN_DOCUMENTO deja el contrato
 * "con pendientes", a diferencia de MODIFICACION_SIN_GARANTIA. Que falte el
 * otrosí escaneado es un expediente incompleto; que falte la póliza que lo
 * ampara es un contrato desprotegido.
 *
 * Deliberadamente NO deriva de AlertSeverity: la severidad describe un
 * hallazgo suelto y el estado combina todos. Atarlos haría que subir la
 * severidad de una regla cambiara sin querer el estado de contratos enteros.
 */
const OVERDUE_RULE_CODES: ReadonlySet<RuleCode> = new Set<RuleCode>([
  "VENCIDO_SIN_TERMINACION",
  "MODIFICACION_SIN_GARANTIA",
  "SIN_GARANTIAS_INICIALES",
  "POLIZA_VENCIDA",
  "SALDO_NEGATIVO",
  "AVISO_5_DIAS",
]);

/**
 * SUSPENDIDO no se compara con los otros tres: es una situación del contrato,
 * no un grado de cumplimiento. Mientras la suspensión siga abierta se reporta
 * ese estado, y los hallazgos se devuelven igual para que se vean.
 */
export function computeContractStatus(
  findings: Finding[],
  currentEndDate: CurrentEndDate,
): ContractStatus {
  if (currentEndDate.state === "SUSPENDIDO") return "SUSPENDIDO";
  if (findings.some((f) => OVERDUE_RULE_CODES.has(f.ruleCode))) return "ATRASADO";
  return findings.length > 0 ? "CON_PENDIENTES" : "AL_DIA";
}
