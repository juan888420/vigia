// Cliente del API real. Es la única fuente de datos de la app: el wireframe
// con datos mock ya no existe.

import { authHeader } from "./auth-client";

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
  /** Valor vigente: inicial + adiciones. Lo calcula el motor de reglas
   *  (computeCurrentValue), NO esta app. Es de solo lectura — no está en
   *  ContractPayload y el API lo ignora si se envía. */
  currentValue: string;
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

// ── Diagnóstico (motor de reglas) ───────────────────────────────────────────
// Nada de esto está guardado en la base: el API lo calcula en cada consulta a
// partir de los datos ya registrados. Esta app solo lo muestra.

export type ContractStatus = "AL_DIA" | "CON_PENDIENTES" | "ATRASADO" | "SUSPENDIDO";

export type FindingSeverity = "INFO" | "WARNING" | "CRITICAL";

/** Tres situaciones, no un booleano: un contrato sin RP registrado todavía no
 *  está descuadrado, y por eso tampoco produce PRESUPUESTO_DESCUADRADO. */
export type BudgetBackingStatus = "COINCIDE" | "NO_COINCIDE" | "SIN_RP";

/** A qué registro apunta un hallazgo. `documentType` no es una fila de
 *  ContractDocument sino el tipo que debería existir y falta. */
export type FindingReferenceKind = "event" | "payment" | "guarantee" | "document" | "documentType";

export interface FindingReference {
  kind: FindingReferenceKind;
  id: string;
  label: string;
}

/** `ruleCode` llega como string y no como unión cerrada: el motor puede
 *  incorporar reglas nuevas sin que esta pantalla deje de compilar. */
export interface Finding {
  ruleCode: string;
  severity: FindingSeverity;
  message: string;
  references: FindingReference[];
  /** Aclaración del motor cuando el hallazgo se leería como contradicción con
   *  otra parte del diagnóstico (el CDP/RP registrado en Presupuesto cuyo PDF
   *  todavía no se ha subido). No cambia la severidad ni el conteo. */
  note?: string;
}

/** Tres situaciones distintas, no un valor con posible error: ver el motor
 *  de reglas (apps/api/src/rules/types.ts). */
export type CurrentEndDate =
  | { state: "CALCULADA"; date: string }
  | {
      state: "SUSPENDIDO";
      suspensionEventId: string;
      suspendedSince: string;
      provisionalDate: string | null;
    }
  | { state: "SIN_FECHAS_BASE" };

/** Un tipo documental del expediente con su estado real. `required: false`
 *  es un requisito que este contrato no exige (ContractRequirementOverride):
 *  se muestra, pero no cuenta como falta. */
export interface DiagnosticStageItem {
  documentTypeId: string;
  name: string;
  required: boolean;
  present: boolean;
  /** Misma aclaración que en Finding, para el ítem del riel. El ítem sigue
   *  ausente y sigue restando en el contador de la etapa. */
  note?: string;
}

/** Completitud de soportes de UN pago. Los requisitos que se exigen una vez
 *  por pago no están en `stages`: su denominador depende de cuántos pagos haya
 *  y solo se entienden mirando cada pago, no el riel del contrato. */
export interface PaymentSupport {
  paymentId: string;
  sequenceNumber: number;
  present: number;
  total: number;
  missing: string[];
}

/** El expediente agrupado por etapa. Sale del MISMO cruce que los hallazgos
 *  DOCUMENTO_FALTANTE, así que el riel no puede contradecirlos. */
export interface DiagnosticStage {
  stage: ContractStage;
  items: DiagnosticStageItem[];
}

export interface Diagnostic {
  contract: { id: string; number: string; object: string };
  computedAt: string;
  currentValue: string;
  currentEndDate: CurrentEndDate;
  balance: string;
  /** `total` suma solo los RP: son los que respaldan el compromiso. `cdpTotal`
   *  suma los CDP (disponibilidad previa) y no se compara contra el valor
   *  vigente — CDP y RP no son partidas acumulables. */
  budgetBacking: { total: string; cdpTotal: string; matchStatus: BudgetBackingStatus };
  status: ContractStatus;
  findings: Finding[];
  stages: DiagnosticStage[];
  paymentSupport: PaymentSupport[];
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

export function getDiagnostic(contractId: string) {
  return request<Diagnostic>(`/contratos/${contractId}/diagnostico`);
}

// ── Sesión ──────────────────────────────────────────────────────────────────

/** Única ruta pública de autenticación del API: no hay registro ni
 *  recuperación de contraseña. El token se guarda en el navegador desde la
 *  página de login, no aquí — este módulo no toca localStorage. */
export function login(email: string, password: string) {
  return request<{ token: string }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

// ── Clasificación y extracción con IA ───────────────────────────────────────
// Estas tres llamadas se salen del patrón de `request()` por dos motivos
// distintos.
//
// Las dos primeras, porque suben un archivo: el `Content-Type: application/json`
// que `request()` fija sirve para todo el CRUD y aquí rompería el multipart (el
// navegador tiene que poner él mismo el boundary).
//
// Las TRES, porque son las únicas rutas autenticadas del API y por tanto las
// únicas que mandan Authorization. Las de IA no lo exigen por el dato —no
// escriben nada— sino por el gasto: cada una consume tokens de pago. El resto
// del CRUD sigue sin token, que es una decisión aparte y deliberada.

/** Resumen del tipo documental tal como lo devuelve /clasificar: sale del
 *  catálogo completo, sin pasar por DocumentRequirement, así que no trae
 *  `required` ni `appliesToEachPayment` — la IA clasifica contra los 30 tipos,
 *  no contra los que esta modalidad exige. */
export interface ClassifiedDocumentType {
  id: string;
  code: string;
  name: string;
  stage: ContractStage;
  fileLabel: string;
}

/** Metadatos del archivo que el API devolvió tras leerlo. `contentHash` lo
 *  calcula el servidor sobre el PDF recibido; el cliente lo reenvía tal cual a
 *  /documentos/confirmar en vez de rehashear el archivo por su cuenta. */
export interface IntakeFile {
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  contentHash: string;
}

/**
 * De dónde sacó el modelo el contenido del documento.
 *
 * TEXT_LAYER  — el PDF traía capa de texto y se le mandó el texto.
 * PAGE_IMAGES — el PDF estaba escaneado y se le mandaron las páginas.
 *
 * No es un detalle de implementación: quien revisa una propuesta tiene que
 * saber si salió de un texto exacto o de una imagen interpretada, porque no se
 * leen con la misma fiabilidad.
 */
export type ContentSource = "TEXT_LAYER" | "PAGE_IMAGES";

export interface IntakeExtraction {
  characters: number;
  pages: number;
  truncated: boolean;
  source: ContentSource;
}

export interface ClassificationResult {
  contractId: string;
  file: IntakeFile;
  extraction: IntakeExtraction;
  proposal: {
    documentTypeId: string;
    documentType: ClassifiedDocumentType;
    confidence: number;
    reasoning: string;
  };
  model: string;
  /** Siempre false: /clasificar propone, no guarda. Viene en la respuesta para
   *  que quede explícito en el contrato del endpoint, no solo en la doc. */
  persisted: boolean;
}

/** Los cuatro campos que la IA lee de un otrosí. `type` no está: elegir entre
 *  AMENDMENT, ADDITION y EXTENSION es criterio de la oficina, y el API no lo
 *  propone nunca. */
export interface AmendmentFieldConfidence {
  sequenceNumber: number | null;
  signatureDate: number | null;
  valueDelta: number | null;
  daysDelta: number | null;
}

export interface ExtractionResult {
  contractId: string;
  documentType: "OTROSI";
  file: IntakeFile;
  extraction: IntakeExtraction;
  /** El modelo puede decir que el documento no es un otrosí. Es una respuesta
   *  legítima —la alternativa era que inventara los campos—, no un fallo. */
  looksLikeAmendment: boolean;
  proposal: {
    sequenceNumber: number | null;
    signatureDate: string | null;
    /** Monto plano CON signo: un otrosí puede corregir el valor a la baja. */
    valueDelta: string | null;
    daysDelta: number | null;
    /** Inconsistencias que la IA encontró y NO resolvió. Null si no halló
     *  ninguna. */
    notes: string | null;
    confidence: number;
    fieldConfidence: AmendmentFieldConfidence;
  };
  model: string;
  effort: string;
  persisted: boolean;
}

/** El body de /documentos/confirmar. `source`, `validatedAt` y `validatedById`
 *  NO están y no pueden estarlo: el API los fija él mismo y rechaza con 400
 *  cualquier body que los incluya. */
export interface DocumentConfirmationPayload {
  documentTypeId: string;
  eventId: string | null;
  aiConfidence: number;
  aiNotes: string | null;
  originalFileName: string;
  storagePath: string;
  mimeType: string | null;
  fileSize: number | null;
  contentHash: string | null;
}

/** El multipart lo arma el navegador: no se fija `Content-Type` a mano porque
 *  hay que dejar que añada el boundary. El único header explícito es el de
 *  autenticación. */
async function uploadPdf<T>(path: string, file: File): Promise<T> {
  const body = new FormData();
  body.append("file", file);

  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    body,
    cache: "no-store",
    headers: authHeader(),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new ApiError(
      payload?.error ?? payload?.message ?? `Error ${response.status}`,
      response.status,
    );
  }

  return response.json() as Promise<T>;
}

export function classifyDocument(contractId: string, file: File) {
  return uploadPdf<ClassificationResult>(`/contratos/${contractId}/documentos/clasificar`, file);
}

export function extractDocument(contractId: string, file: File) {
  return uploadPdf<ExtractionResult>(`/contratos/${contractId}/documentos/extraer`, file);
}

/** La segunda mitad del flujo del README: aquí la propuesta de la IA se
 *  convierte en dato. Única llamada autenticada de la app. */
export function confirmDocument(contractId: string, input: DocumentConfirmationPayload) {
  return request<ContractDocument>(`/contratos/${contractId}/documentos/confirmar`, {
    method: "POST",
    headers: authHeader(),
    body: JSON.stringify(input),
  });
}
