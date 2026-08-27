import type { Contract, ContractPayload } from "./api";

// Módulo neutro (sin "use client"): la pantalla de edición es un server
// component y necesita construir los valores iniciales antes de entregárselos
// al formulario, que sí es cliente.
//
// El formulario trabaja siempre con strings, montos incluidos. El valor viaja
// al API sin formatear; los separadores de miles son exclusivos de la lectura.

export interface ContractFormValues {
  officeId: string;
  contractTypeId: string;
  number: string;
  object: string;
  contractor: string;
  contractorId: string;
  supervisor: string;
  initialValue: string;
  initialTermDays: string;
  signatureDate: string;
  startDate: string;
  initialEndDate: string;
  advanceValue: string;
}

export const EMPTY_CONTRACT_FORM: ContractFormValues = {
  officeId: "",
  contractTypeId: "",
  number: "",
  object: "",
  contractor: "",
  contractorId: "",
  supervisor: "",
  initialValue: "",
  initialTermDays: "",
  signatureDate: "",
  startDate: "",
  initialEndDate: "",
  advanceValue: "",
};

function nullIfEmpty(value: string) {
  return value.trim() === "" ? null : value.trim();
}

/**
 * Días entre dos fechas "YYYY-MM-DD", como diferencia simple (sin contar el día
 * de inicio). Es una comodidad del formulario: evita que alguien tenga que
 * traducir "3 meses" a días contando calendario, que da resultados distintos
 * según el mes — del 2025-03-15 al 2025-06-15 hay 92 días, no 90.
 *
 * Lo que se guarda sigue siendo `initialTermDays`. El schema no cambia y el
 * motor de reglas no sabe nada de esto.
 *
 * Devuelve null si falta alguna fecha o si el rango no es válido (terminación
 * anterior o igual al inicio): el API exige un plazo de al menos 1 día, así que
 * un rango invertido no puede convertirse en un número y enviarse.
 */
export function daysBetween(start: string, end: string): number | null {
  if (start === "" || end === "") return null;

  const startMs = Date.parse(`${start}T00:00:00.000Z`);
  const endMs = Date.parse(`${end}T00:00:00.000Z`);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return null;

  // Ambas fechas se anclan a medianoche UTC, así que la división es exacta y no
  // la desplaza ningún cambio de horario.
  const days = (endMs - startMs) / 86_400_000;
  return days > 0 ? days : null;
}

/** Los campos vacíos viajan como null: una cadena vacía en la base sería
 *  indistinguible de un dato realmente cargado. */
export function toContractPayload(form: ContractFormValues): ContractPayload {
  // Con ambas fechas presentes el plazo se deriva y pisa cualquier valor que se
  // hubiera escrito antes a mano; sin ellas, se respeta lo tecleado.
  const derivedTermDays = daysBetween(form.startDate, form.initialEndDate);
  const manualTermDays = form.initialTermDays.trim() === "" ? null : Number(form.initialTermDays);

  return {
    officeId: form.officeId,
    contractTypeId: form.contractTypeId,
    number: form.number.trim(),
    object: form.object.trim(),
    contractor: nullIfEmpty(form.contractor),
    contractorId: nullIfEmpty(form.contractorId),
    supervisor: nullIfEmpty(form.supervisor),
    initialValue: form.initialValue.trim(),
    initialTermDays: derivedTermDays ?? manualTermDays,
    signatureDate: nullIfEmpty(form.signatureDate),
    startDate: nullIfEmpty(form.startDate),
    initialEndDate: nullIfEmpty(form.initialEndDate),
    advanceValue: nullIfEmpty(form.advanceValue),
  };
}

/** Precarga del formulario de edición. `initialValue` y `advanceValue` se
 *  copian tal como los devuelve el API ("10945259"), sin formatear. */
export function contractToFormValues(contract: Contract): ContractFormValues {
  return {
    officeId: contract.office.id,
    contractTypeId: contract.contractType.id,
    number: contract.number,
    object: contract.object,
    contractor: contract.contractor ?? "",
    contractorId: contract.contractorId ?? "",
    supervisor: contract.supervisor ?? "",
    initialValue: contract.initialValue,
    initialTermDays: contract.initialTermDays === null ? "" : String(contract.initialTermDays),
    signatureDate: contract.signatureDate ?? "",
    startDate: contract.startDate ?? "",
    initialEndDate: contract.initialEndDate ?? "",
    advanceValue: contract.advanceValue ?? "",
  };
}
