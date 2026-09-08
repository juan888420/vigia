import type { Prisma, AlertSeverity } from "@prisma/client";
import type {
  BudgetRecord,
  Contract,
  ContractDocument,
  ContractEvent,
  ContractRequirementOverride,
  DocumentRequirement,
  DocumentType,
  Guarantee,
  Payment,
} from "@prisma/client";

// ─────────────────────────────────────────────────────────────────────────────
// Contratos de datos del motor de reglas.
//
// El motor es una función pura: recibe los registros ya cargados y una fecha
// "hoy" inyectada, y devuelve el diagnóstico. No consulta la base ni conoce
// Fastify. Eso lo hace verificable con datos en memoria y evita que un cálculo
// dependa del reloj del proceso en mitad de una regla.
//
// Nada de esto se almacena (README → "los valores vigentes se derivan"): el
// diagnóstico se recalcula en cada consulta.
// ─────────────────────────────────────────────────────────────────────────────

/** Requisito documental de la modalidad, con su tipo resuelto. */
export type RequirementWithType = DocumentRequirement & { documentType: DocumentType };

export interface DiagnosticInput {
  contract: Contract;
  events: ContractEvent[];
  payments: Payment[];
  guarantees: Guarantee[];
  budgetRecords: BudgetRecord[];
  documents: ContractDocument[];
  /** Requisitos de la modalidad del contrato (DocumentRequirement + tipo). */
  requirements: RequirementWithType[];
  /** Excepciones de este contrato sobre esos requisitos. */
  overrides: ContractRequirementOverride[];
  /** Medianoche UTC del día contra el que se evalúan los vencimientos. */
  today: Date;
}

export const RULE_CODES = [
  "DOCUMENTO_FALTANTE",
  "DOCUMENTO_FALTANTE_PAGO",
  "MODIFICACION_SIN_GARANTIA",
  "MODIFICACION_SIN_DOCUMENTO",
  "SIN_GARANTIAS_INICIALES",
  "SALTO_SECUENCIA_EVENTO",
  "SALTO_SECUENCIA_PAGO",
  "PRESUPUESTO_DESCUADRADO",
  "PAGO_ANTICIPO_Y_FINAL",
  "AVISO_15_DIAS",
  "AVISO_5_DIAS",
  "POLIZA_POR_VENCER",
  "POLIZA_VENCIDA",
  "SALDO_NEGATIVO",
  "VENCIDO_SIN_TERMINACION",
] as const;

export type RuleCode = (typeof RULE_CODES)[number];

/**
 * A qué registro concreto apunta un hallazgo. `documentType` no es una fila de
 * ContractDocument sino el tipo que debería existir y no existe: es la única
 * referencia posible de un documento faltante.
 */
export type ReferenceKind = "event" | "payment" | "guarantee" | "document" | "documentType";

export interface FindingReference {
  kind: ReferenceKind;
  id: string;
  /** Texto legible: "Otrosí 1", "Pago 2", "Acta de recibo parcial". */
  label: string;
}

/**
 * Un hallazgo. `ruleCode` sigue el estilo del modelo Alert y es lo que hace
 * auditable el diagnóstico: permite responder "¿por qué dice que está
 * atrasado?" señalando la regla exacta y los registros que la sustentan.
 */
export interface Finding {
  ruleCode: RuleCode;
  severity: AlertSeverity;
  message: string;
  references: FindingReference[];
}

/**
 * Fecha de terminación vigente. No es un número con un posible error: son tres
 * situaciones distintas del expediente.
 *
 * · CALCULADA — hay fechas base y ninguna suspensión abierta.
 * · SUSPENDIDO — hay una suspensión sin reinicio: la fecha real no se puede
 *   determinar todavía, solo una provisional con lo ocurrido antes de ella.
 * · SIN_FECHAS_BASE — falta el acta de inicio o la fecha de terminación
 *   inicial. No hay nada que calcular; no es un error del expediente.
 */
export type CurrentEndDate =
  | { state: "CALCULADA"; date: Date }
  | {
      state: "SUSPENDIDO";
      suspensionEventId: string;
      suspendedSince: Date;
      /** Con las suspensiones ya cerradas y las prórrogas anteriores a la
       *  suspensión abierta. Se moverá cuando se registre el reinicio. */
      provisionalDate: Date | null;
    }
  | { state: "SIN_FECHAS_BASE" };

export type ContractStatus = "AL_DIA" | "CON_PENDIENTES" | "ATRASADO" | "SUSPENDIDO";

/**
 * Lectura del respaldo presupuestal. SIN_RP no es un caso de "no coincide":
 * es un expediente al que todavía no le han registrado el compromiso, y por
 * eso tampoco produce el hallazgo PRESUPUESTO_DESCUADRADO.
 */
export type BudgetBackingStatus = "COINCIDE" | "NO_COINCIDE" | "SIN_RP";

export interface Diagnostic {
  currentValue: Prisma.Decimal;
  currentEndDate: CurrentEndDate;
  balance: Prisma.Decimal;
  budgetBacking: {
    /** Solo RP: es lo que respalda el compromiso. Ver computeBudgetBackingTotal. */
    total: Prisma.Decimal;
    /** Solo CDP: disponibilidad previa. No se compara contra el valor vigente. */
    cdpTotal: Prisma.Decimal;
    matchStatus: BudgetBackingStatus;
  };
  status: ContractStatus;
  findings: Finding[];
}
