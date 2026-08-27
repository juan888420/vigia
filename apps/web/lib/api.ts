// Cliente del API real. Convive con lib/mock-data.ts: la pantalla de detalle
// sigue siendo el wireframe con datos mock hasta que existan Payment /
// ContractEvent / Guarantee.

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3333";

export interface Office {
  id: string;
  name: string;
}

export interface ContractTypeSummary {
  id: string;
  code: string;
  name: string;
}

/**
 * Espejo exacto de lo que devuelve el API. Los montos llegan como string
 * porque en la base son Decimal(15,2): pasarlos por un number de JSON los
 * expondría a redondeo. Se formatean para mostrar, nunca se recalculan aquí.
 */
export interface Contract {
  id: string;
  number: string;
  normalizedNumber: string;
  object: string;
  contractor: string | null;
  contractorId: string | null;
  supervisor: string | null;
  initialValue: string;
  initialTermDays: number | null;
  signatureDate: string | null;
  startDate: string | null;
  initialEndDate: string | null;
  advanceValue: string | null;
  notes: string | null;
  parentContractId: string | null;
  contractType: ContractTypeSummary;
  office: Office;
  createdAt: string;
  updatedAt: string;
}

/** Campos escribibles. POST los exige completos; PATCH acepta cualquier
 *  subconjunto, por eso las mutaciones lo reciben como Partial. */
export interface ContractPayload {
  officeId: string;
  contractTypeId: string;
  number: string;
  object: string;
  contractor: string | null;
  contractorId: string | null;
  supervisor: string | null;
  initialValue: string;
  initialTermDays: number | null;
  signatureDate: string | null;
  startDate: string | null;
  initialEndDate: string | null;
  advanceValue: string | null;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(body?.error ?? body?.message ?? `Error ${response.status}`, response.status);
  }

  // DELETE responde 204 sin cuerpo: intentar parsearlo como JSON reventaría.
  if (response.status === 204) return undefined as T;

  return response.json() as Promise<T>;
}

export function listContracts() {
  return request<Contract[]>("/contratos");
}

export function getContract(id: string) {
  return request<Contract>(`/contratos/${id}`);
}

export function listOffices() {
  return request<Office[]>("/oficinas");
}

export function listContractTypes() {
  return request<ContractTypeSummary[]>("/modalidades");
}

export function createContract(input: ContractPayload) {
  return request<Contract>("/contratos", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateContract(id: string, input: Partial<ContractPayload>) {
  return request<Contract>(`/contratos/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteContract(id: string) {
  return request<void>(`/contratos/${id}`, { method: "DELETE" });
}

const currency = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

export function formatMoney(value: string | null) {
  return value === null ? null : currency.format(Number(value));
}
