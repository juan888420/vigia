import type {
  BudgetRecord,
  BudgetRecordType,
  ContractDocument,
  ContractRequirementOverride,
  Payment,
} from "@prisma/client";
import type {
  ChecklistItem,
  DiagnosticStage,
  PaymentSupport,
  RequirementWithType,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// El cruce entre lo que el expediente DEBERÍA tener y lo que tiene.
//
// Vive aparte de findings.ts porque no es una regla: es el dato del que salen
// dos lecturas distintas de la misma comparación.
//
//   · Los hallazgos 2.1 y 2.2 listan solo lo AUSENTE y obligatorio.
//   · `stages` lista TODO con su estado, para el riel de etapas de la pantalla.
//
// Que ambas lean de aquí es lo que impide que la pantalla marque presente un
// documento que el motor reporta como faltante, o al revés.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Un documento cuenta como presente si lo clasificó una persona, o si lo
 * propuso la IA y alguien lo validó. Un AI_SUGGESTED sin validar está en la
 * cola de revisión: el dato todavía no existe (README → flujo obligatorio).
 */
export function isPresent(document: ContractDocument): boolean {
  return document.source === "MANUAL" || document.validatedAt !== null;
}

/**
 * Requisitos con su `required` EFECTIVO, corregido por las excepciones del
 * contrato. No filtra: marca.
 *
 * ContractRequirementOverride existe para el caso real que señaló el cliente
 * ("un contrato de obra no exige lo mismo que uno de suministro"). Antes esta
 * función descartaba los no exigidos, que es lo que necesitan los hallazgos;
 * pero el riel de etapas tiene que poder mostrar también un documento que este
 * contrato no exige, sin marcarlo como falta. Cada consumidor filtra por
 * `required` según lo que le toque.
 */
export function resolveRequirements(
  requirements: RequirementWithType[],
  overrides: ContractRequirementOverride[],
): RequirementWithType[] {
  const overridden = new Map(overrides.map((override) => [override.requirementId, override.required]));
  return requirements.map((requirement) => ({
    ...requirement,
    required: overridden.get(requirement.id) ?? requirement.required,
  }));
}

/**
 * El CDP y el RP viven en DOS sitios del expediente: como fila en Presupuesto
 * (el número y el valor, que es el dato del que sale budgetBacking) y como PDF
 * en Documentos (el soporte escaneado). Tener el número cargado y el archivo
 * no es lo normal mientras se arma el expediente — pero en pantalla se lee
 * como una contradicción: "respaldo COINCIDE" justo al lado de "falta el RP".
 *
 * Esta nota explica esa diferencia y NADA más. El requisito sigue ausente,
 * sigue siendo WARNING y sigue contando como falta: comparar filas de
 * BudgetRecord contra requisitos documentales sería mezclar dos cruces
 * distintos y daría por presente un documento que nadie ha subido.
 *
 * El caso inverso —el PDF cargado sin la fila en Presupuesto— no lleva nota:
 * ya lo dicen matchStatus SIN_RP y el hallazgo PRESUPUESTO_DESCUADRADO.
 */
const BUDGET_BACKED_DOCUMENT_TYPES: Record<string, BudgetRecordType> = {
  CDP: "CDP",
  RP: "RP",
};

function budgetNote(
  requirement: RequirementWithType,
  budgetRecords: BudgetRecord[],
): string | undefined {
  const type = BUDGET_BACKED_DOCUMENT_TYPES[requirement.documentType.code];
  if (!type) return undefined;

  const numbers = budgetRecords
    .filter((record) => record.type === type)
    .map((record) => record.number)
    .sort((a, b) => a.localeCompare(b));
  if (numbers.length === 0) return undefined;

  return `El número está registrado en Presupuesto (${type} ${numbers.join(", ")}), pero el documento aún no se ha subido a Documentos.`;
}

/**
 * Compara los requisitos contra los documentos cargados, una sola vez.
 *
 * Para los requisitos por pago (`appliesToEachPayment`) el criterio es el
 * mismo de la regla 2.2: el requisito está cubierto solo si NINGÚN pago se
 * quedó sin su soporte. `missingForPayments` conserva cuáles, que es lo que
 * la regla necesita para nombrarlos uno por uno.
 */
export function buildDocumentChecklist(
  requirements: RequirementWithType[],
  payments: Payment[],
  documents: ContractDocument[],
  budgetRecords: BudgetRecord[],
): ChecklistItem[] {
  const validated = documents.filter(isPresent);

  const presentTypes = new Set(validated.map((document) => document.documentTypeId));
  const presentPerPayment = new Set(
    validated
      .filter((document) => document.paymentId !== null)
      .map((document) => `${document.paymentId}:${document.documentTypeId}`),
  );

  // Se evalúan todos los pagos registrados, incluidos los anulados: un pago
  // CANCELLED no suma al saldo, pero sigue siendo un trámite del expediente.
  const ordered = [...payments].sort((a, b) => a.sequenceNumber - b.sequenceNumber);

  return requirements.map((requirement) => {
    if (!requirement.appliesToEachPayment) {
      const present = presentTypes.has(requirement.documentTypeId);
      return {
        requirement,
        required: requirement.required,
        present,
        missingForPayments: [],
        // Solo cuando falta: sobre un requisito ya cubierto no hay nada que
        // aclarar.
        note: present ? undefined : budgetNote(requirement, budgetRecords),
      };
    }

    const missingForPayments = ordered.filter(
      (payment) => !presentPerPayment.has(`${payment.id}:${requirement.documentTypeId}`),
    );

    return {
      requirement,
      required: requirement.required,
      // Sin ningún pago registrado no hay soporte que mostrar: se deja en
      // ausente en vez de "cubierto por vacío", que pintaría de verde un
      // requisito del que no existe ni un solo documento.
      present: ordered.length > 0 && missingForPayments.length === 0,
      missingForPayments,
    };
  });
}

/** Orden del expediente, no alfabético: es como se recorre un contrato. */
const STAGE_ORDER = ["PRECONTRACTUAL", "CONTRACTUAL", "POSTCONTRACTUAL"] as const;

/**
 * El mismo checklist, agrupado por etapa para el riel de la pantalla.
 *
 * SOLO los requisitos de contrato: los que se exigen una vez por cada pago
 * quedan fuera. No es que dejen de importar —siguen produciendo sus hallazgos
 * DOCUMENTO_FALTANTE_PAGO— sino que no pertenecen al riel del expediente: su
 * denominador depende de cuántos pagos tenga el contrato, así que inflaba la
 * etapa contractual con doce filas que solo se entienden pago a pago. Esa
 * lectura vive en `buildPaymentSupport`.
 *
 * Incluye los requisitos no exigidos por este contrato, con `required: false`:
 * la pantalla los muestra sin contarlos como falta.
 *
 * Una etapa sin ningún requisito no se emite: un riel con un tramo vacío
 * sugeriría que falta cargar algo, cuando la modalidad simplemente no pide
 * nada ahí.
 */
export function buildStages(checklist: ChecklistItem[]): DiagnosticStage[] {
  return STAGE_ORDER.map((stage) => ({
    stage,
    items: checklist
      .filter((item) => !item.requirement.appliesToEachPayment)
      .filter((item) => item.requirement.documentType.stage === stage)
      .map((item) => ({
        documentTypeId: item.requirement.documentTypeId,
        name: item.requirement.documentType.name,
        required: item.required,
        present: item.present,
        note: item.note,
      })),
  })).filter((stage) => stage.items.length > 0);
}

/**
 * La otra mitad del mismo cruce: cuántos soportes tiene cada pago.
 *
 * `missingForPayments` ya dice, por requisito, a qué pagos les falta; aquí se
 * invierte para leerlo por pago, que es como se mira en la pantalla de Pagos.
 * Solo cuentan los requisitos exigidos: los opcionales no son deuda.
 */
export function buildPaymentSupport(
  checklist: ChecklistItem[],
  payments: Payment[],
): PaymentSupport[] {
  const perPayment = checklist.filter(
    (item) => item.required && item.requirement.appliesToEachPayment,
  );

  return [...payments]
    .sort((a, b) => a.sequenceNumber - b.sequenceNumber)
    .map((payment) => {
      const missing = perPayment
        .filter((item) => item.missingForPayments.some((p) => p.id === payment.id))
        .map((item) => item.requirement.documentType.name);

      return {
        paymentId: payment.id,
        sequenceNumber: payment.sequenceNumber,
        present: perPayment.length - missing.length,
        total: perPayment.length,
        missing,
      };
    });
}
