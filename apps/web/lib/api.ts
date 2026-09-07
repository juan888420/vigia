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
  isFinal: boolean;
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
  isFinal: boolean;
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

export type BudgetRecordType = "CDP" | "RP";

/** Respaldo presupuestal. Un contrato puede tener varios CDP/RP a la vez
 *  cuando se compone de partidas que no pueden mezclarse; el valor del
 *  contrato es la suma de todas. `value` llega como string por la misma razón
 *  que initialValue: la base guarda Decimal(15,2). */
export interface BudgetRecord {
  id: string;
  contractId: string;
  eventId: string | null;
  type: BudgetRecordType;
  number: string;
  value: string;
  issuedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetRecordPayload {
  type: BudgetRecordType;
  number: string;
  value: string;
  issuedAt: string | null;
  eventId: string | null;
}

export type ContractStage = "PRECONTRACTUAL" | "CONTRACTUAL" | "POSTCONTRACTUAL";

export type DocumentSource = "MANUAL" | "AI_SUGGESTED";

/** Tipo documental del catálogo, resuelto para una modalidad concreta a través
 *  de DocumentRequirement. `required` y `appliesToEachPayment` vienen del
 *  requisito, no del tipo: el mismo "Acta de inicio" puede ser obligatorio en
 *  una modalidad y opcional en otra. */
export interface DocumentTypeOption {
  id: string;
  code: string;
  name: string;
  stage: ContractStage;
  fileLabel: string;
  required: boolean;
  appliesToEachPayment: boolean;
}

/** Resumen del tipo que viaja embebido en cada documento, igual que
 *  `contractType` viaja dentro de Contract. */
export interface DocumentTypeSummary {
  id: string;
  code: string;
  name: string;
  stage: ContractStage;
  fileLabel: string;
}

/**
 * Un archivo del expediente. `source`, `aiConfidence`, `validatedById` y
 * `validatedAt` llegan pero son de SOLO LECTURA: pertenecen al flujo de
 * clasificación con IA, que todavía no existe. Nada de esta app los escribe.
 */
export interface ContractDocument {
  id: string;
  contractId: string;
  documentTypeId: string | null;
  documentType: DocumentTypeSummary | null;
  paymentId: string | null;
  eventId: string | null;
  guaranteeId: string | null;
  originalFileName: string;
  standardizedName: string | null;
  storagePath: string;
  mimeType: string | null;
  fileSize: number | null;
  contentHash: string | null;
  source: DocumentSource;
  aiConfidence: string | null;
  validatedById: string | null;
  validatedAt: string | null;
  uploadedAt: string;
  updatedAt: string;
}

/** Campos escribibles. Las tres FK de contexto son excluyentes: como mucho una
 *  distinta de null. El formulario lo garantiza con un solo select; el API lo
 *  vuelve a comprobar. */
export interface ContractDocumentPayload {
  documentTypeId: string;
  paymentId: string | null;
  eventId: string | null;
  guaranteeId: string | null;
  originalFileName: string;
  storagePath: string;
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

export function listBudgetRecords(contractId: string) {
  return request<BudgetRecord[]>(`/contratos/${contractId}/presupuesto`);
}

export function getBudgetRecord(id: string) {
  return request<BudgetRecord>(`/presupuesto/${id}`);
}

export function createBudgetRecord(contractId: string, input: BudgetRecordPayload) {
  return request<BudgetRecord>(`/contratos/${contractId}/presupuesto`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateBudgetRecord(id: string, input: Partial<BudgetRecordPayload>) {
  return request<BudgetRecord>(`/presupuesto/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteBudgetRecord(id: string) {
  return request<void>(`/presupuesto/${id}`, { method: "DELETE" });
}

export function listDocumentTypes(contractTypeId: string) {
  return request<DocumentTypeOption[]>(`/modalidades/${contractTypeId}/tipos-documentales`);
}

export function listDocuments(contractId: string) {
  return request<ContractDocument[]>(`/contratos/${contractId}/documentos`);
}

export function getDocument(id: string) {
  return request<ContractDocument>(`/documentos/${id}`);
}

export function createDocument(contractId: string, input: ContractDocumentPayload) {
  return request<ContractDocument>(`/contratos/${contractId}/documentos`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateDocument(id: string, input: Partial<ContractDocumentPayload>) {
  return request<ContractDocument>(`/documentos/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteDocument(id: string) {
  return request<void>(`/documentos/${id}`, { method: "DELETE" });
}

const currency = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

export function formatMoney(value: string | null) {
  return value === null ? null : currency.format(Number(value));
}
