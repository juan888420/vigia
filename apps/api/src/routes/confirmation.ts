import type { FastifyInstance } from "fastify";
import { DocumentSource, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../lib/auth";
import { decimalToString } from "../lib/serialize";
import { nonBlankText, nullableString } from "../lib/validation";

// ─────────────────────────────────────────────────────────────────────────────
// Confirmación de una propuesta de la IA. Es la SEGUNDA MITAD del flujo del
// README —`IA propone → humano valida → sistema guarda`— y el único sitio de
// todo el proyecto donde un documento nace con source = AI_SUGGESTED.
//
// Hasta aquí, /clasificar y /extraer no escriben nada: devuelven una propuesta
// y se olvidan. Este endpoint es donde esa propuesta se convierte en dato, y lo
// que lo autoriza es que una persona identificada lo pidió.
//
// Por eso es la PRIMERA ruta del proyecto que exige autenticación: sin
// `request.user` no hay a quién atribuir la validación, y `validatedById`
// sería un campo decorativo. El resto del CRUD sigue sin autenticar — activarlo
// es una decisión aparte.
//
// LA REGLA QUE SOSTIENE TODO: `validatedById` sale de `request.user.id`, que
// viene del JWT verificado, NUNCA del body. Si el cliente pudiera mandarlo,
// cualquiera podría firmar una validación con el nombre de otro funcionario y
// el rastro de auditoría no valdría nada. Mandarlo en el body es un 400, no un
// campo que se ignora en silencio.
// ─────────────────────────────────────────────────────────────────────────────

const confirmationSchema = {
  body: {
    type: "object",
    // Lo que cierra la puerta a `validatedAt` y `validatedById`: cualquier
    // campo no declarado aquí hace que la petición falle con 400 en vez de
    // colarse. Es el mismo criterio del resto del proyecto, y en esta ruta es
    // además la defensa del rastro de auditoría.
    additionalProperties: false,
    required: ["documentTypeId", "aiConfidence", "originalFileName", "storagePath"],
    properties: {
      /** El que el usuario confirmó o CORRIGIÓ. No tiene por qué ser el que
       *  propuso la IA: que el humano pueda cambiarlo es justamente el punto
       *  del flujo. */
      documentTypeId: { type: "string", minLength: 1 },
      /** El evento que este documento evidencia, si ya se creó vía
       *  POST /contratos/:id/eventos. Null = documento a nivel de contrato. */
      eventId: nullableString,
      /** Tal como lo devolvió /clasificar o /extraer. Se guarda como parte del
       *  rastro: permite responder después "¿con cuánta certeza lo propuso la
       *  IA?" y detectar si se están validando sugerencias flojas sin mirar. */
      aiConfidence: { type: "number", minimum: 0, maximum: 1 },
      /** El texto de inconsistencias de /extraer, tal cual. */
      aiNotes: nullableString,
      // ── El archivo ───────────────────────────────────────────────────────
      // No estaban en el diseño original del body, pero son NOT NULL en
      // ContractDocument: sin ellos no hay fila que crear. El cliente ya los
      // tiene, porque /clasificar y /extraer se los devolvieron en `file`.
      originalFileName: nonBlankText(500),
      /** Texto libre AUTO-REPORTADO por la persona que confirma — igual que en
       *  el formulario manual. El sistema NO lo deriva, NO lo genera y NO
       *  comprueba que apunte a nada: /clasificar y /extraer reciben el PDF y
       *  no lo guardan. Dónde viven de verdad los archivos es la decisión #6
       *  pendiente del README, y hasta que se tome, esta columna es lo que el
       *  usuario diga que es. */
      storagePath: nonBlankText(1000),
      mimeType: nullableString,
      fileSize: { type: ["integer", "null"], minimum: 0 },
      contentHash: nullableString,
    },
  },
} as const;

interface ConfirmationBody {
  documentTypeId: string;
  eventId?: string | null;
  aiConfidence: number;
  aiNotes?: string | null;
  originalFileName: string;
  storagePath: string;
  mimeType?: string | null;
  fileSize?: number | null;
  contentHash?: string | null;
}

const documentInclude = {
  documentType: { select: { id: true, code: true, name: true, stage: true, fileLabel: true } },
  validatedBy: { select: { id: true, name: true, email: true } },
} satisfies Prisma.ContractDocumentInclude;

type DocumentRecord = Prisma.ContractDocumentGetPayload<{ include: typeof documentInclude }>;

function serializeDocument(document: DocumentRecord) {
  return {
    id: document.id,
    contractId: document.contractId,
    documentTypeId: document.documentTypeId,
    documentType: document.documentType,
    paymentId: document.paymentId,
    eventId: document.eventId,
    guaranteeId: document.guaranteeId,
    originalFileName: document.originalFileName,
    standardizedName: document.standardizedName,
    storagePath: document.storagePath,
    mimeType: document.mimeType,
    fileSize: document.fileSize,
    contentHash: document.contentHash,
    source: document.source,
    aiConfidence: decimalToString(document.aiConfidence),
    aiNotes: document.aiNotes,
    validatedById: document.validatedById,
    validatedBy: document.validatedBy,
    validatedAt: document.validatedAt === null ? null : document.validatedAt.toISOString(),
    uploadedAt: document.uploadedAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  };
}

export async function confirmationRoutes(app: FastifyInstance) {
  app.post<{ Params: { contractId: string }; Body: ConfirmationBody }>(
    "/contratos/:contractId/documentos/confirmar",
    { preHandler: requireAuth, schema: confirmationSchema },
    async (request, reply) => {
      // requireAuth garantiza que esté presente; si no, no se habría llegado
      // hasta aquí. El guard es para el tipo, no para la lógica.
      const user = request.user;
      if (!user) {
        return reply.status(401).send({ error: "No autenticado" });
      }

      const contract = await prisma.contract.findUnique({
        where: { id: request.params.contractId },
        select: { id: true },
      });
      if (!contract) {
        return reply.status(404).send({ error: "Contrato no encontrado" });
      }

      const documentType = await prisma.documentType.findUnique({
        where: { id: request.body.documentTypeId },
        select: { id: true },
      });
      if (!documentType) {
        return reply.status(400).send({ error: "El tipo documental no existe" });
      }

      const eventId = request.body.eventId ?? null;
      if (eventId) {
        const event = await prisma.contractEvent.findUnique({
          where: { id: eventId },
          select: { contractId: true },
        });
        // Un evento de OTRO contrato es 400 y no 404 a propósito: el recurso
        // existe, lo que está mal es la petición. Vincular un documento al
        // evento de otro expediente falsearía los dos.
        if (!event || event.contractId !== contract.id) {
          return reply
            .status(400)
            .send({ error: "El evento asociado no existe o pertenece a otro contrato" });
        }
      }

      const document = await prisma.contractDocument.create({
        data: {
          contractId: contract.id,
          documentTypeId: documentType.id,
          eventId,
          // Mismo tratamiento que POST /contratos/:id/documentos: se recortan
          // los espacios y una cadena vacía en un campo opcional se guarda como
          // null. Que las dos rutas escriban la misma columna de forma distinta
          // es cómo se acaba con " ruta/x.pdf" y "ruta/x.pdf" como dos valores
          // diferentes en la misma base.
          originalFileName: request.body.originalFileName.trim(),
          storagePath: request.body.storagePath.trim(),
          mimeType: request.body.mimeType?.trim() || null,
          fileSize: request.body.fileSize ?? null,
          contentHash: request.body.contentHash?.trim() || null,
          aiNotes: request.body.aiNotes?.trim() || null,
          // ── Los cuatro campos que el cliente NO controla ─────────────────
          // El origen es la IA por definición: este endpoint existe para
          // confirmar una propuesta suya. Un documento tecleado a mano entra
          // por POST /contratos/:id/documentos, que lo marca MANUAL.
          source: DocumentSource.AI_SUGGESTED,
          aiConfidence: new Prisma.Decimal(request.body.aiConfidence),
          // La hora la pone el servidor, no el cliente: una fecha de
          // validación que viaja en el body se puede antedatar.
          validatedAt: new Date(),
          // Del token verificado. Nunca del body.
          validatedById: user.id,
        },
        include: documentInclude,
      });

      return reply.status(201).send(serializeDocument(document));
    },
  );
}
