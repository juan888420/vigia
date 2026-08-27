import type { Guarantee, GuaranteePayload, GuaranteeType } from "./api";

export const GUARANTEE_TYPE_OPTIONS: { value: GuaranteeType; label: string }[] = [
  { value: "CUMPLIMIENTO", label: "Cumplimiento" },
  { value: "RESPONSABILIDAD_CIVIL", label: "Responsabilidad civil" },
  { value: "SALARIOS_PRESTACIONES", label: "Salarios y prestaciones" },
  { value: "ESTABILIDAD_OBRA", label: "Estabilidad de la obra" },
  { value: "ANTICIPO", label: "Buen manejo del anticipo" },
  { value: "CALIDAD", label: "Calidad" },
  { value: "OTRA", label: "Otra" },
];

export const GUARANTEE_TYPE_LABELS: Record<GuaranteeType, string> = {
  CUMPLIMIENTO: "Cumplimiento",
  RESPONSABILIDAD_CIVIL: "Responsabilidad civil",
  SALARIOS_PRESTACIONES: "Salarios y prestaciones",
  ESTABILIDAD_OBRA: "Estabilidad de la obra",
  ANTICIPO: "Buen manejo del anticipo",
  CALIDAD: "Calidad",
  OTRA: "Otra",
};

export interface GuaranteeFormValues {
  coversEventId: string;
  type: GuaranteeType;
  policyNumber: string;
  insurer: string;
  insuredValue: string;
  validFrom: string;
  validUntil: string;
  approvedAt: string;
}

export const EMPTY_GUARANTEE_FORM: GuaranteeFormValues = {
  coversEventId: "",
  type: "CUMPLIMIENTO",
  policyNumber: "",
  insurer: "",
  insuredValue: "",
  validFrom: "",
  validUntil: "",
  approvedAt: "",
};

function nullIfEmpty(value: string) {
  return value.trim() === "" ? null : value.trim();
}

/** `coversEventId` vacío = garantía inicial del contrato, no un dato faltante.
 *  El monto asegurado viaja como string crudo, sin formatear. */
export function toGuaranteePayload(form: GuaranteeFormValues): GuaranteePayload {
  return {
    coversEventId: nullIfEmpty(form.coversEventId),
    type: form.type,
    policyNumber: form.policyNumber.trim(),
    insurer: nullIfEmpty(form.insurer),
    insuredValue: nullIfEmpty(form.insuredValue),
    validFrom: nullIfEmpty(form.validFrom),
    validUntil: nullIfEmpty(form.validUntil),
    approvedAt: nullIfEmpty(form.approvedAt),
  };
}

export function guaranteeToFormValues(guarantee: Guarantee): GuaranteeFormValues {
  return {
    coversEventId: guarantee.coversEventId ?? "",
    type: guarantee.type,
    policyNumber: guarantee.policyNumber,
    insurer: guarantee.insurer ?? "",
    insuredValue: guarantee.insuredValue ?? "",
    validFrom: guarantee.validFrom ?? "",
    validUntil: guarantee.validUntil ?? "",
    approvedAt: guarantee.approvedAt ?? "",
  };
}
