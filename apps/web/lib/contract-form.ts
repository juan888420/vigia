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
 * Días de plazo entre dos fechas "YYYY-MM-DD", con conteo INCLUSIVO: el día de
 * inicio cuenta como el primer día del plazo. Confirmado por el cliente — un
 * contrato que arranca el 2025-09-04 con 3 meses vence el 2025-12-04, y el 4 de
 * septiembre ya es un día contractual: 91 de diferencia + 1 = 92 días.
 *
 * Es una comodidad del formulario: evita que alguien tenga que traducir
 * "3 meses" a días contando calendario, que da resultados distintos según el
 * mes — del 2025-03-15 al 2025-06-15 son 93 días, no 90.
 *
 * Lo que se guarda sigue siendo `initialTermDays`. El schema no cambia y el
 * motor de reglas no sabe nada de esto.
 *
 * QUÉ PREGUNTA RESPONDE ESTA FUNCIÓN, y cuál no: responde "¿cuánto DURA un
 * plazo pactado?", no "¿cuánto hay que DESPLAZAR una fecha?". Son dos
 * convenciones distintas que conviven a propósito en el sistema, y las dos son
 * correctas para lo que cada una representa:
 *
 *   · `initialTermDays` (esta función): duración inclusiva. Del 2025-05-28 al
 *     2025-08-27 son 92 días porque el 28 de mayo ya es un día contractual.
 *   · `ContractEvent.daysDelta` (motor de reglas): desplazamiento plano. Un
 *     otrosí que corre el vencimiento del 2025-08-27 al 2025-11-27 vale 92
 *     porque es la diferencia calendario entre las dos fechas, sin el +1.
 *     Ver `computeCurrentEndDate` en apps/api/src/rules/derived.ts.
 *
 * Que ambas den 92 en CD-007-2025 es coincidencia aritmética, no equivalencia.
 *
 * Hoy no pueden contradecirse porque `initialTermDays` es un valor puramente
 * INFORMATIVO: ningún cálculo del motor de reglas lo consume. La fecha de
 * terminación vigente se deriva de `initialEndDate` más los eventos, nunca del
 * plazo en días.
 *
 * ⚠ SI ALGUNA VEZ SE ESCRIBE UNA REGLA que compare `initialTermDays` contra
 * (`initialEndDate` − `startDate`) para detectar expedientes descuadrados, esa
 * comparación tiene que rehacer el conteo INCLUSIVO de aquí (diferencia + 1).
 * Escribirla con el `daysBetween`/`addDays` del motor de reglas, que son
 * planos, marcaría como inconsistentes todos los contratos bien cargados por
 * un día de diferencia.
 *
 * Devuelve null si falta alguna fecha o si la terminación es anterior al
 * inicio. Terminación igual al inicio SÍ es válida y vale 1 día: con conteo
 * inclusivo, un contrato de un solo día es exactamente eso.
 */
export function daysBetween(start: string, end: string): number | null {
  if (start === "" || end === "") return null;

  const startMs = Date.parse(`${start}T00:00:00.000Z`);
  const endMs = Date.parse(`${end}T00:00:00.000Z`);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return null;

  // Ambas fechas se anclan a medianoche UTC, así que la división es exacta y no
  // la desplaza ningún cambio de horario.
  const difference = (endMs - startMs) / 86_400_000;
  return difference >= 0 ? difference + 1 : null;
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
