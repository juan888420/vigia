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

export type PaymentStatus = "REGISTERED" | "PAID" | "CANCELLED";

/** Espejo de lo que devuelve el API. `value` llega como string por la misma
 *  razón que initialValue: la base guarda Decimal(15,2). */
export interface Payment {
  id: string;
  contractId: string;
  sequenceNumber: number;
  value: string;
  actDate: string | null;
  paidAt: string | null;
  status: PaymentStatus;
  isAdvance: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Campos escribibles. POST exige sequenceNumber y value; PATCH acepta
 *  cualquier subconjunto, por eso las mutaciones lo reciben como Partial. */
export interface PaymentPayload {
  sequenceNumber: number;
  value: string;
  actDate: string | null;
  paidAt: string | null;
  status: PaymentStatus;
  isAdvance: boolean;
  notes: string | null;
}

export type EventType =
  | "AMENDMENT"
  | "ADDITION"
  | "EXTENSION"
  | "SUSPENSION"
  | "RESUMPTION"
  | "TERMINATION"
  | "LIQUIDATION";

export interface ContractEvent {
  id: string;
  contractId: string;
  type: EventType;
  sequenceNumber: number | null;
  eventDate: string;
  valueDelta: string | null;
  daysDelta: number | null;
  startDate: string | null;
  endDate: string | null;
  relatedEventId: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EventPayload {
  type: EventType;
  sequenceNumber: number | null;
  eventDate: string;
  valueDelta: string | null;
  daysDelta: number | null;
  startDate: string | null;
  relatedEventId: string | null;
  description: string | null;
}

export type GuaranteeType =
  | "CUMPLIMIENTO"
  | "RESPONSABILIDAD_CIVIL"
  | "SALARIOS_PRESTACIONES"
  | "ESTABILIDAD_OBRA"
  | "ANTICIPO"
  | "CALIDAD"
  | "OTRA";

export interface Guarantee {
  id: string;
  contractId: string;
  coversEventId: string | null;
  type: GuaranteeType;
  policyNumber: string;
  insurer: string | null;
  insuredValue: string | null;
  validFrom: string | null;
  validUntil: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GuaranteePayload {
  coversEventId: string | null;
  type: GuaranteeType;
  policyNumber: string;
  insurer: string | null;
  insuredValue: string | null;
  validFrom: string | null;
  validUntil: string | null;
  approvedAt: string | null;
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

export function listPayments(contractId: string) {
  return request<Payment[]>(`/contratos/${contractId}/pagos`);
}

export function getPayment(id: string) {
  return request<Payment>(`/pagos/${id}`);
}

export function createPayment(contractId: string, input: PaymentPayload) {
  return request<Payment>(`/contratos/${contractId}/pagos`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updatePayment(id: string, input: Partial<PaymentPayload>) {
  return request<Payment>(`/pagos/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deletePayment(id: string) {
  return request<void>(`/pagos/${id}`, { method: "DELETE" });
}

export function listEvents(contractId: string) {
  return request<ContractEvent[]>(`/contratos/${contractId}/eventos`);
}

export function getEvent(id: string) {
  return request<ContractEvent>(`/eventos/${id}`);
}

export function createEvent(contractId: string, input: EventPayload) {
  return request<ContractEvent>(`/contratos/${contractId}/eventos`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateEvent(id: string, input: Partial<EventPayload>) {
  return request<ContractEvent>(`/eventos/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteEvent(id: string) {
  return request<void>(`/eventos/${id}`, { method: "DELETE" });
}

export function listGuarantees(contractId: string) {
  return request<Guarantee[]>(`/contratos/${contractId}/garantias`);
}

export function getGuarantee(id: string) {
  return request<Guarantee>(`/garantias/${id}`);
}

export function createGuarantee(contractId: string, input: GuaranteePayload) {
  return request<Guarantee>(`/contratos/${contractId}/garantias`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateGuarantee(id: string, input: Partial<GuaranteePayload>) {
  return request<Guarantee>(`/garantias/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteGuarantee(id: string) {
  return request<void>(`/garantias/${id}`, { method: "DELETE" });
}

const currency = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

export function formatMoney(value: string | null) {
  return value === null ? null : currency.format(Number(value));
}
