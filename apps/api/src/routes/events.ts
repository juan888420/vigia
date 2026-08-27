import type { FastifyInstance } from "fastify";
import { Prisma, EventType } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { dateOnly, decimalToString } from "../lib/serialize";
import { prismaErrorResponse } from "../lib/prisma-errors";
import { nullableDate, nullableMoney, nullableString, toDate } from "../lib/validation";

// Historial de lo que le ocurre a un contrato: otrosíes, adiciones, prórrogas,
// suspensiones, reinicios, terminación y liquidación.
//
// Este módulo NO calcula nada derivado: ni valor vigente, ni fecha de
// terminación vigente, ni saltos de secuencia. Eso es del motor de reglas.
// La única escritura automática es la sincronización RESUMPTION → SUSPENSION
// de más abajo, que no es un cálculo sino mantener coherente el propio dato.

type EventRecord = Prisma.ContractEventGetPayload<Record<string, never>>;

function serializeEvent(event: EventRecord) {
  return {
    id: event.id,
    contractId: event.contractId,
    type: event.type,
    sequenceNumber: event.sequenceNumber,
    eventDate: dateOnly(event.eventDate),
    valueDelta: decimalToString(event.valueDelta),
    daysDelta: event.daysDelta,
    startDate: dateOnly(event.startDate),
    endDate: dateOnly(event.endDate),
    relatedEventId: event.relatedEventId,
    description: event.description,
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
  };
}

/** Campos escribibles. `contractId` no está: viene en la URL, no en el body. */
const eventProperties = {
  type: { type: "string", enum: Object.values(EventType) },
  sequenceNumber: { type: ["integer", "null"], minimum: 1 },
  eventDate: { type: "string", format: "date" },
  valueDelta: nullableMoney,
  daysDelta: { type: ["integer", "null"] },
  startDate: nullableDate,
  endDate: nullableDate,
  relatedEventId: nullableString,
  description: nullableString,
} as const;

const createEventSchema = {
  type: "object",
  required: ["type", "eventDate"],
  additionalProperties: false,
  properties: eventProperties,
} as const;

const updateEventSchema = {
  type: "object",
  minProperties: 1,
  additionalProperties: false,
  properties: eventProperties,
} as const;

type CreateEventBody = {
  type: EventType;
  sequenceNumber?: number | null;
  eventDate: string;
  valueDelta?: string | number | null;
  daysDelta?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  relatedEventId?: string | null;
  description?: string | null;
};

type UpdateEventBody = Partial<CreateEventBody>;

/** Etiquetas para los mensajes de conflicto: "Ya existe la prórroga 2...". */
const EVENT_LABELS: Record<EventType, string> = {
  AMENDMENT: "el otrosí",
  ADDITION: "la adición",
  EXTENSION: "la prórroga",
  SUSPENSION: "la suspensión",
  RESUMPTION: "el reinicio",
  TERMINATION: "el acta de terminación",
  LIQUIDATION: "el acta de liquidación",
};

type Tx = Prisma.TransactionClient | PrismaClient;

/** Actos únicos: un contrato se termina y se liquida una sola vez. Lo garantiza
 *  un índice parcial en la base (ver la migración
 *  20260827014508_unique_termination_liquidation); aquí se comprueba antes para
 *  poder devolver un mensaje legible en vez del choque crudo del índice. */
const SINGLE_OCCURRENCE_TYPES: EventType[] = [EventType.TERMINATION, EventType.LIQUIDATION];

async function findExistingSingleton(contractId: string, type: EventType, excludeId?: string) {
  if (!SINGLE_OCCURRENCE_TYPES.includes(type)) return null;
  return prisma.contractEvent.findFirst({
    where: { contractId, type, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true },
  });
}

const SINGLETON_CONFLICT: Record<string, string> = {
  TERMINATION: "Este contrato ya tiene un acta de terminación",
  LIQUIDATION: "Este contrato ya tiene un acta de liquidación",
};

/**
 * Sincroniza el cierre de una suspensión.
 *
 * `SUSPENSION.endDate` no se escribe nunca a mano: lo pone el RESUMPTION que la
 * reanuda. Así el motor de reglas podrá saber con una sola consulta si un
 * contrato sigue suspendido (endDate nulo) sin recorrer la cadena de eventos.
 * Es determinístico: copia una fecha ya registrada, no la interpreta.
 */
async function closeSuspension(tx: Tx, suspensionId: string | null, endDate: Date | null) {
  if (!suspensionId) return;
  const target = await tx.contractEvent.findUnique({
    where: { id: suspensionId },
    select: { id: true, type: true },
  });
  // Solo una SUSPENSION tiene periodo que cerrar. La validación de entrada ya
  // impide que un reinicio apunte a otro tipo; esta guarda queda como red por
  // si un vínculo viejo sobrevive a un cambio de tipo.
  if (target?.type !== EventType.SUSPENSION) return;
  await tx.contractEvent.update({ where: { id: target.id }, data: { endDate } });
}

/**
 * Valida el evento referenciado por `relatedEventId`. Devuelve el mensaje de
 * error, o null si es válido.
 *
 * Un reinicio solo puede reanudar una suspensión: apuntar a un otrosí dejaría
 * un vínculo que nunca cierra ningún periodo y que el motor de reglas leería
 * como una reanudación real.
 */
async function validateRelatedEvent(
  relatedEventId: string,
  contractId: string,
  resultingType: EventType,
): Promise<string | null> {
  const referenced = await prisma.contractEvent.findUnique({
    where: { id: relatedEventId },
    select: { contractId: true, type: true },
  });

  if (!referenced || referenced.contractId !== contractId) {
    return "El evento relacionado no existe o pertenece a otro contrato";
  }
  if (resultingType === EventType.RESUMPTION && referenced.type !== EventType.SUSPENSION) {
    return "relatedEventId debe apuntar a una suspensión";
  }
  return null;
}

export async function eventsRoutes(app: FastifyInstance) {
  // ── Anidadas bajo el contrato ────────────────────────────────────────────

  app.get<{ Params: { contractId: string } }>(
    "/contratos/:contractId/eventos",
    async (request, reply) => {
      const contract = await prisma.contract.findUnique({
        where: { id: request.params.contractId },
        select: { id: true },
      });
      if (!contract) {
        return reply.status(404).send({ error: "Contrato no encontrado" });
      }

      const events = await prisma.contractEvent.findMany({
        where: { contractId: contract.id },
        orderBy: [{ eventDate: "asc" }, { createdAt: "asc" }],
      });
      return events.map(serializeEvent);
    },
  );

  app.post<{ Params: { contractId: string }; Body: CreateEventBody }>(
    "/contratos/:contractId/eventos",
    { schema: { body: createEventSchema } },
    async (request, reply) => {
      const body = request.body;

      const contract = await prisma.contract.findUnique({
        where: { id: request.params.contractId },
        select: { id: true },
      });
      if (!contract) {
        return reply.status(404).send({ error: "Contrato no encontrado" });
      }

      if (body.relatedEventId) {
        const problem = await validateRelatedEvent(body.relatedEventId, contract.id, body.type);
        if (problem) {
          return reply.status(400).send({ error: problem });
        }
      }

      const existingSingleton = await findExistingSingleton(contract.id, body.type);
      if (existingSingleton) {
        return reply.status(409).send({ error: SINGLETON_CONFLICT[body.type] });
      }

      // La unicidad es (contractId, type, sequenceNumber): la numeración corre
      // por separado en cada tipo, así que Prórroga 1 y Suspensión 1 conviven.
      // Solo se comprueba con sequenceNumber presente — con null, Postgres no
      // considera colisión y TERMINATION/LIQUIDATION no se numeran.
      if (body.sequenceNumber != null) {
        const clash = await prisma.contractEvent.findFirst({
          where: {
            contractId: contract.id,
            type: body.type,
            sequenceNumber: body.sequenceNumber,
          },
          select: { id: true },
        });
        if (clash) {
          return reply.status(409).send({
            error: `Ya existe ${EVENT_LABELS[body.type]} ${body.sequenceNumber} para este contrato`,
          });
        }
      }

      try {
        const event = await prisma.$transaction(async (tx) => {
          const created = await tx.contractEvent.create({
            data: {
              contractId: contract.id,
              type: body.type,
              sequenceNumber: body.sequenceNumber ?? null,
              eventDate: toDate(body.eventDate)!,
              valueDelta:
                body.valueDelta == null ? null : new Prisma.Decimal(body.valueDelta),
              daysDelta: body.daysDelta ?? null,
              startDate: toDate(body.startDate),
              endDate: toDate(body.endDate),
              relatedEventId: body.relatedEventId || null,
              description: body.description?.trim() || null,
            },
          });

          if (created.type === EventType.RESUMPTION) {
            await closeSuspension(tx, created.relatedEventId, created.eventDate);
          }
          return created;
        });

        return reply.status(201).send(serializeEvent(event));
      } catch (error) {
        const mapped = prismaErrorResponse(error, {
          conflict: "Ya existe un evento en conflicto con este en el contrato",
          foreignKey: "El contrato o el evento relacionado no existe",
          notFound: "Evento no encontrado",
        });
        if (mapped) return reply.status(mapped.status).send(mapped.body);
        throw error;
      }
    },
  );

  // ── Por id de evento ─────────────────────────────────────────────────────

  app.get<{ Params: { id: string } }>("/eventos/:id", async (request, reply) => {
    const event = await prisma.contractEvent.findUnique({ where: { id: request.params.id } });
    if (!event) {
      return reply.status(404).send({ error: "Evento no encontrado" });
    }
    return serializeEvent(event);
  });

  app.patch<{ Params: { id: string }; Body: UpdateEventBody }>(
    "/eventos/:id",
    { schema: { body: updateEventSchema } },
    async (request, reply) => {
      const body = request.body;

      const current = await prisma.contractEvent.findUnique({
        where: { id: request.params.id },
      });
      if (!current) {
        return reply.status(404).send({ error: "Evento no encontrado" });
      }

      if (body.relatedEventId && body.relatedEventId === current.id) {
        return reply.status(400).send({ error: "Un evento no puede relacionarse consigo mismo" });
      }

      // Se valida el estado RESULTANTE, no solo lo que llega en el body: pasar
      // un evento a RESUMPTION conservando un relatedEventId que apunta a otro
      // otrosí produciría el mismo vínculo inválido sin tocar relatedEventId.
      const resultingType = body.type ?? current.type;
      const resultingRelatedId =
        body.relatedEventId !== undefined ? body.relatedEventId || null : current.relatedEventId;

      if (resultingRelatedId) {
        const problem = await validateRelatedEvent(
          resultingRelatedId,
          current.contractId,
          resultingType,
        );
        if (problem) {
          return reply.status(400).send({ error: problem });
        }
      }

      const data: Prisma.ContractEventUncheckedUpdateInput = {};

      if (body.type !== undefined) data.type = body.type;
      if (body.sequenceNumber !== undefined) data.sequenceNumber = body.sequenceNumber;
      if (body.eventDate !== undefined) data.eventDate = toDate(body.eventDate)!;
      if (body.valueDelta !== undefined) {
        data.valueDelta = body.valueDelta == null ? null : new Prisma.Decimal(body.valueDelta);
      }
      if (body.daysDelta !== undefined) data.daysDelta = body.daysDelta;
      if (body.startDate !== undefined) data.startDate = toDate(body.startDate);
      if (body.endDate !== undefined) data.endDate = toDate(body.endDate);
      if (body.relatedEventId !== undefined) data.relatedEventId = body.relatedEventId || null;
      if (body.description !== undefined) data.description = body.description?.trim() || null;

      const targetSequence =
        body.sequenceNumber !== undefined ? body.sequenceNumber : current.sequenceNumber;

      if (resultingType !== current.type) {
        const singleton = await findExistingSingleton(
          current.contractId,
          resultingType,
          current.id,
        );
        if (singleton) {
          return reply.status(409).send({ error: SINGLETON_CONFLICT[resultingType] });
        }
      }

      // Cambiar el tipo también puede provocar colisión aunque el número no se
      // toque, porque la unicidad incluye el tipo.
      if (
        targetSequence != null &&
        (resultingType !== current.type || targetSequence !== current.sequenceNumber)
      ) {
        const clash = await prisma.contractEvent.findFirst({
          where: {
            contractId: current.contractId,
            type: resultingType,
            sequenceNumber: targetSequence,
            id: { not: current.id },
          },
          select: { id: true },
        });
        if (clash) {
          return reply.status(409).send({
            error: `Ya existe ${EVENT_LABELS[resultingType]} ${targetSequence} para este contrato`,
          });
        }
      }

      try {
        const event = await prisma.$transaction(async (tx) => {
          const updated = await tx.contractEvent.update({ where: { id: current.id }, data });

          // Si el reinicio deja de apuntar a la suspensión anterior (o deja de
          // ser un reinicio), esa suspensión vuelve a quedar abierta: si no se
          // limpiara, quedaría marcada como reanudada sin que nada la reanude.
          const previousLink =
            current.type === EventType.RESUMPTION ? current.relatedEventId : null;
          const newLink = updated.type === EventType.RESUMPTION ? updated.relatedEventId : null;

          if (previousLink && previousLink !== newLink) {
            await closeSuspension(tx, previousLink, null);
          }
          if (newLink) {
            await closeSuspension(tx, newLink, updated.eventDate);
          }
          return updated;
        });

        return serializeEvent(event);
      } catch (error) {
        const mapped = prismaErrorResponse(error, {
          conflict: "Ya existe un evento en conflicto con este en el contrato",
          foreignKey: "El evento relacionado no existe",
          notFound: "Evento no encontrado",
        });
        if (mapped) return reply.status(mapped.status).send(mapped.body);
        throw error;
      }
    },
  );

  app.delete<{ Params: { id: string } }>("/eventos/:id", async (request, reply) => {
    const current = await prisma.contractEvent.findUnique({
      where: { id: request.params.id },
      select: { id: true, type: true, relatedEventId: true },
    });
    if (!current) {
      return reply.status(404).send({ error: "Evento no encontrado" });
    }

    try {
      await prisma.$transaction(async (tx) => {
        // Borrar el reinicio devuelve su suspensión al estado "sin reanudar".
        if (current.type === EventType.RESUMPTION) {
          await closeSuspension(tx, current.relatedEventId, null);
        }
        await tx.contractEvent.delete({ where: { id: current.id } });
      });
      return reply.status(204).send();
    } catch (error) {
      const mapped = prismaErrorResponse(error, { notFound: "Evento no encontrado" });
      if (mapped) return reply.status(mapped.status).send(mapped.body);
      throw error;
    }
  });
}
