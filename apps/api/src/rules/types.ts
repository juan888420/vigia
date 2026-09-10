import type { Prisma, AlertSeverity, ContractStage } from "@prisma/client";
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

/**
 * Un requisito documental cruzado contra los documentos del contrato.
 *
 * Es el dato intermedio del que salen DOS lecturas de la misma comparación:
 * los hallazgos 2.1/2.2, que listan solo lo ausente y obligatorio, y `stages`,
 * que lista todo con su estado. Ver rules/checklist.ts.
 */
export interface ChecklistItem {
  requirement: RequirementWithType;
  /** `required` efectivo, ya corregido por los overrides del contrato. */
  required: boolean;
  present: boolean;
  /** Solo con `appliesToEachPayment`: los pagos a los que les falta el
   *  soporte. Vacío en los requisitos de contrato. */
  missingForPayments: Payment[];
  /** Aclaración de presentación cuando el dato existe en otra parte del
   *  expediente pero el archivo no. No participa en ningún cálculo: ver
   *  `budgetNote` en rules/checklist.ts. */
  note?: string;
}

export interface DiagnosticStageItem {
  documentTypeId: string;
  name: string;
  /** false = este contrato no lo exige (override). No cuenta como falta. */
  required: boolean;
  present: boolean;
  /** Por qué falta el archivo aunque el dato ya esté cargado en otra pantalla.
   *  Solo texto: el ítem sigue ausente y sigue contando como falta. */
  note?: string;
}

/**
 * Completitud documental de UN pago. Es la mitad por-pago del mismo checklist:
 * lo que 2.2 reporta pago a pago, contado.
 *
 * Vive aparte de `stages` porque no es del contrato sino de cada pago: meter
 * los soportes de tres pagos en el riel del expediente lo hace ilegible sin
 * decir nada útil ("0/16" cuando 12 de esos 16 dependen de cuántos pagos haya).
 */
export interface PaymentSupport {
  paymentId: string;
  sequenceNumber: number;
  /** Soportes exigidos por pago que este pago ya tiene. */
  present: number;
  /** Cuántos se le exigen. Igual para todos los pagos del contrato. */
  total: number;
  /** Nombres de los que faltan, en el orden del expediente. */
  missing: string[];
}

/** El checklist agrupado por etapa, en el orden en que se recorre un
 *  expediente. Alimenta el riel de etapas de la pantalla de detalle. */
export interface DiagnosticStage {
  stage: ContractStage;
  items: DiagnosticStageItem[];
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
  /** Aclaración opcional. NO altera el hallazgo: misma severidad, mismo
   *  `ruleCode`, sigue contando. Existe para que un hallazgo que se lee como
   *  contradicción con otra parte del diagnóstico se explique solo. */
  note?: string;
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
  /** El expediente documental completo, no solo lo que falta. Sale del mismo
   *  cruce que los hallazgos 2.1/2.2 (ver rules/checklist.ts). */
  stages: DiagnosticStage[];
  /** Completitud de soportes por pago, del mismo cruce. */
  paymentSupport: PaymentSupport[];
}
