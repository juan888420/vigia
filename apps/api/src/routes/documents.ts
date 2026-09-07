import type { FastifyInstance } from "fastify";
import { Prisma, DocumentSource } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { decimalToString } from "../lib/serialize";
import { prismaErrorResponse } from "../lib/prisma-errors";
import { nullableString } from "../lib/validation";

// Archivos del expediente.
//
// `originalFileName` se conserva SIEMPRE: es la única forma de que el
// funcionario reconozca su propio archivo y de poder auditar una clasificación
// equivocada. `standardizedName` es una consecuencia de la clasificación, no su
// insumo, así que este módulo lo acepta pero no lo genera.
//
// Un documento cuelga del contrato y, a lo sumo, de UN contexto: pago, evento o
// garantía. Las tres FK nulas = documento a nivel del contrato (el estudio
// previo, el CDP, el clausulado).
//
// LÍMITE DELIBERADO: este módulo NO escribe `source`, `aiConfidence`,
// `validatedById` ni `validatedAt`. Esos cuatro campos son los que impiden que
// una sugerencia de IA se convierta en dato sin que un humano la confirme, y
// pertenecen al flujo de clasificación que todavía no existe. Todo lo que entra
// por aquí es MANUAL por definición: lo tecleó una persona.
//
// Tampoco se evalúa aquí ningún checklist ni se calcula qué documentos faltan:
// eso es del motor de reglas.

const documentInclude = {
  documentType: { select: { id: true, code: true, name: true, stage: true, fileLabel: true } },
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
    // Solo lectura: ver el límite deliberado de la cabecera.
    source: document.source,
    aiConfidence: decimalToString(document.aiConfidence),
    validatedById: document.validatedById,
    validatedAt: document.validatedAt === null ? null : document.validatedAt.toISOString(),
    uploadedAt: document.uploadedAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  };
}

/** Campos escribibles. Create y update comparten la definición para que un
 *  campo nuevo no quede validado en una ruta y suelto en la otra.
 *  `contractId` no está aquí: viene en la URL, no en el body.
 *
 *  `documentTypeId` no admite null: en el schema es opcional porque un
 *  documento en la cola de revisión de la IA todavía no tiene tipo, pero un
 *  registro manual siempre lo tiene. Dejar borrarlo por PATCH permitiría
 *  desclasificar un documento ya validado. */
const documentProperties = {
  documentTypeId: { type: "string", minLength: 1 },
  paymentId: nullableString,
  eventId: nullableString,
  guaranteeId: nullableString,
  originalFileName: { type: "string", minLength: 1, maxLength: 500 },
  standardizedName: nullableString,
  storagePath: { type: "string", minLength: 1, maxLength: 1000 },
  mimeType: nullableString,
  fileSize: { type: ["integer", "null"], minimum: 0 },
  contentHash: nullableString,
} as const;

const createDocumentSchema = {
  type: "object",
  required: ["documentTypeId", "originalFileName", "storagePath"],
  additionalProperties: false,
  properties: documentProperties,
} as const;

const updateDocumentSchema = {
  type: "object",
  minProperties: 1,
  additionalProperties: false,
  properties: documentProperties,
} as const;

type CreateDocumentBody = {
  documentTypeId: string;
  paymentId?: string | null;
  eventId?: string | null;
  guaranteeId?: string | null;
  originalFileName: string;
  standardizedName?: string | null;
  storagePath: string;
  mimeType?: string | null;
  fileSize?: number | null;
  contentHash?: string | null;
};

type UpdateDocumentBody = Partial<CreateDocumentBody>;

const DOCUMENT_ERRORS = {
  conflict: "El documento ya existe",
  foreignKey: "El contrato, el tipo documental o el elemento asociado no existe",
  notFound: "Documento no encontrado",
};

/** Contexto al que cuelga el documento. A lo sumo uno de los tres. */
interface DocumentContext {
  paymentId: string | null;
  eventId: string | null;
  guaranteeId: string | null;
}

/**
 * Comprueba que el contexto sea coherente: como mucho una de las tres FK, y la
 * que venga debe pertenecer al MISMO contrato. Sin lo segundo, un documento
 * podría decir que es el soporte de un pago de otro expediente.
 *
 * Devuelve el mensaje de error, o null si el contexto es válido.
 */
async function validateContext(
  context: DocumentContext,
  contractId: string,
): Promise<string | null> {
  const present = [context.paymentId, context.eventId, context.guaranteeId].filter(Boolean);
  if (present.length > 1) {
    return "Un documento puede colgar de un pago, un evento o una garantía, pero no de varios a la vez";
  }

  if (context.paymentId) {
    const payment = await prisma.payment.findUnique({
      where: { id: context.paymentId },
      select: { contractId: true },
    });
    if (!payment || payment.contractId !== contractId) {
      return "El pago asociado no existe o pertenece a otro contrato";
    }
  }

  if (context.eventId) {
    const event = await prisma.contractEvent.findUnique({
      where: { id: context.eventId },
      select: { contractId: true },
    });
    if (!event || event.contractId !== contractId) {
      return "El evento asociado no existe o pertenece a otro contrato";
    }
  }

  if (context.guaranteeId) {
    const guarantee = await prisma.guarantee.findUnique({
      where: { id: context.guaranteeId },
      select: { contractId: true },
    });
    if (!guarantee || guarantee.contractId !== contractId) {
      return "La garantía asociada no existe o pertenece a otro contrato";
    }
  }

  return null;
}

/** El tipo documental debe existir. Se comprueba antes para devolver un
 *  mensaje concreto en vez del P2003 genérico de las tres FK juntas. */
async function documentTypeExists(documentTypeId: string) {
  const documentType = await prisma.documentType.findUnique({
    where: { id: documentTypeId },
    select: { id: true },
  });
  return Boolean(documentType);
}

export async function documentsRoutes(app: FastifyInstance) {
  // ── Anidadas bajo el contrato ────────────────────────────────────────────

  app.get<{ Params: { contractId: string } }>(
    "/contratos/:contractId/documentos",
    async (request, reply) => {
      const contract = await prisma.contract.findUnique({
        where: { id: request.params.contractId },
        select: { id: true },
      });
      if (!contract) {
        return reply.status(404).send({ error: "Contrato no encontrado" });
      }

      const documents = await prisma.contractDocument.findMany({
        where: { contractId: contract.id },
        include: documentInclude,
        // Por etapa del expediente y, dentro de ella, por orden de carga.
        orderBy: [{ documentType: { stage: "asc" } }, { uploadedAt: "asc" }],
      });
      return documents.map(serializeDocument);
    },
  );

  app.post<{ Params: { contractId: string }; Body: CreateDocumentBody }>(
    "/contratos/:contractId/documentos",
    { schema: { body: createDocumentSchema } },
    async (request, reply) => {
      const body = request.body;

      const contract = await prisma.contract.findUnique({
        where: { id: request.params.contractId },
        select: { id: true },
      });
      if (!contract) {
        return reply.status(404).send({ error: "Contrato no encontrado" });
      }

      if (!(await documentTypeExists(body.documentTypeId))) {
        return reply.status(400).send({ error: "El tipo documental no existe" });
      }

      const contextError = await validateContext(
        {
          paymentId: body.paymentId || null,
          eventId: body.eventId || null,
          guaranteeId: body.guaranteeId || null,
        },
        contract.id,
      );
      if (contextError) {
        return reply.status(400).send({ error: contextError });
      }

      try {
        const document = await prisma.contractDocument.create({
          data: {
            contractId: contract.id,
            documentTypeId: body.documentTypeId,
            paymentId: body.paymentId || null,
            eventId: body.eventId || null,
            guaranteeId: body.guaranteeId || null,
            originalFileName: body.originalFileName.trim(),
            standardizedName: body.standardizedName?.trim() || null,
            storagePath: body.storagePath.trim(),
            mimeType: body.mimeType?.trim() || null,
            fileSize: body.fileSize ?? null,
            contentHash: body.contentHash?.trim() || null,
            // Explícito aunque sea el default del schema: lo que entra por esta
            // ruta lo tecleó una persona, nunca una IA.
            source: DocumentSource.MANUAL,
          },
          include: documentInclude,
        });
        return reply.status(201).send(serializeDocument(document));
      } catch (error) {
        const mapped = prismaErrorResponse(error, DOCUMENT_ERRORS);
        if (mapped) return reply.status(mapped.status).send(mapped.body);
        throw error;
      }
    },
  );

  // ── Por id de documento ──────────────────────────────────────────────────

  app.get<{ Params: { id: string } }>("/documentos/:id", async (request, reply) => {
    const document = await prisma.contractDocument.findUnique({
      where: { id: request.params.id },
      include: documentInclude,
    });
    if (!document) {
      return reply.status(404).send({ error: "Documento no encontrado" });
    }
    return serializeDocument(document);
  });

  app.patch<{ Params: { id: string }; Body: UpdateDocumentBody }>(
    "/documentos/:id",
    { schema: { body: updateDocumentSchema } },
    async (request, reply) => {
      const body = request.body;

      const current = await prisma.contractDocument.findUnique({
        where: { id: request.params.id },
        select: {
          id: true,
          contractId: true,
          paymentId: true,
          eventId: true,
          guaranteeId: true,
        },
      });
      if (!current) {
        return reply.status(404).send({ error: "Documento no encontrado" });
      }

      if (body.documentTypeId !== undefined && !(await documentTypeExists(body.documentTypeId))) {
        return reply.status(400).send({ error: "El tipo documental no existe" });
      }

      // El contexto se valida sobre el estado RESULTANTE, no sobre lo enviado:
      // mover el documento de un pago a un evento exige mandar el pago en null
      // en la misma petición, y así el conflicto se detecta igual.
      const resultingContext: DocumentContext = {
        paymentId: body.paymentId === undefined ? current.paymentId : body.paymentId || null,
        eventId: body.eventId === undefined ? current.eventId : body.eventId || null,
        guaranteeId:
          body.guaranteeId === undefined ? current.guaranteeId : body.guaranteeId || null,
      };
      const contextError = await validateContext(resultingContext, current.contractId);
      if (contextError) {
        return reply.status(400).send({ error: contextError });
      }

      // Solo se escriben las claves presentes: un campo ausente se deja como
      // está, y uno enviado como null se borra.
      const data: Prisma.ContractDocumentUncheckedUpdateInput = {};

      if (body.documentTypeId !== undefined) data.documentTypeId = body.documentTypeId;
      if (body.paymentId !== undefined) data.paymentId = body.paymentId || null;
      if (body.eventId !== undefined) data.eventId = body.eventId || null;
      if (body.guaranteeId !== undefined) data.guaranteeId = body.guaranteeId || null;
      if (body.originalFileName !== undefined) {
        data.originalFileName = body.originalFileName.trim();
      }
      if (body.standardizedName !== undefined) {
        data.standardizedName = body.standardizedName?.trim() || null;
      }
      if (body.storagePath !== undefined) data.storagePath = body.storagePath.trim();
      if (body.mimeType !== undefined) data.mimeType = body.mimeType?.trim() || null;
      if (body.fileSize !== undefined) data.fileSize = body.fileSize ?? null;
      if (body.contentHash !== undefined) data.contentHash = body.contentHash?.trim() || null;

      try {
        const document = await prisma.contractDocument.update({
          where: { id: current.id },
          data,
          include: documentInclude,
        });
        return serializeDocument(document);
      } catch (error) {
        const mapped = prismaErrorResponse(error, DOCUMENT_ERRORS);
        if (mapped) return reply.status(mapped.status).send(mapped.body);
        throw error;
      }
    },
  );

  // Borrado real: quita el registro del expediente. El archivo en el storage no
  // se toca — todavía no hay storage que tocar.
  app.delete<{ Params: { id: string } }>("/documentos/:id", async (request, reply) => {
    try {
      await prisma.contractDocument.delete({ where: { id: request.params.id } });
      return reply.status(204).send();
    } catch (error) {
      const mapped = prismaErrorResponse(error, DOCUMENT_ERRORS);
      if (mapped) return reply.status(mapped.status).send(mapped.body);
      throw error;
    }
  });
}
