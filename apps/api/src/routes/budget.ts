import type { FastifyInstance } from "fastify";
import { Prisma, BudgetRecordType } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { dateOnly, decimalToString } from "../lib/serialize";
import { prismaErrorResponse } from "../lib/prisma-errors";
import { money, nullableDate, nullableString, toDate } from "../lib/validation";

// Respaldo presupuestal del contrato: CDP y RP como filas.
//
// Un contrato puede tener VARIOS CDP/RP simultáneos cuando se compone de
// partidas que no pueden mezclarse (presupuesto operativo + honorarios
// administrativos, en los interadministrativos). El valor del contrato es la
// suma de esas partidas — por eso esto son filas y no dos columnas en
// Contract. Este módulo solo las guarda: la comparación entre la suma de los
// respaldos y el valor vigente es del motor de reglas, no de aquí.
//
// `eventId` nulo = respaldo del presupuesto inicial. Cuando apunta a un
// evento, es el CDP/RP que soporta esa adición posterior.

type BudgetRecordRecord = Prisma.BudgetRecordGetPayload<Record<string, never>>;

function serializeBudgetRecord(record: BudgetRecordRecord) {
  return {
    id: record.id,
    contractId: record.contractId,
    eventId: record.eventId,
    type: record.type,
    number: record.number,
    value: decimalToString(record.value),
    issuedAt: dateOnly(record.issuedAt),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

/** Campos escribibles. Create y update comparten la definición para que un
 *  campo nuevo no quede validado en una ruta y suelto en la otra.
 *  `contractId` no está aquí: viene en la URL, no en el body. */
const budgetRecordProperties = {
  type: { type: "string", enum: Object.values(BudgetRecordType) },
  number: { type: "string", minLength: 1, maxLength: 50 },
  value: money,
  issuedAt: nullableDate,
  eventId: nullableString,
} as const;

const createBudgetRecordSchema = {
  type: "object",
  required: ["type", "number", "value"],
  additionalProperties: false,
  properties: budgetRecordProperties,
} as const;

const updateBudgetRecordSchema = {
  type: "object",
  minProperties: 1,
  additionalProperties: false,
  properties: budgetRecordProperties,
} as const;

type CreateBudgetRecordBody = {
  type: BudgetRecordType;
  number: string;
  value: string | number;
  issuedAt?: string | null;
  eventId?: string | null;
};

type UpdateBudgetRecordBody = Partial<CreateBudgetRecordBody>;

const BUDGET_RECORD_ERRORS = {
  conflict: "Ya existe un respaldo presupuestal con ese tipo y número en el contrato",
  foreignKey: "El contrato o el evento asociado no existe",
  notFound: "Respaldo presupuestal no encontrado",
};

/** El evento asociado debe existir y pertenecer al mismo contrato: si no, el
 *  CDP diría respaldar una adición de otro expediente. */
async function assertSameContractEvent(eventId: string, contractId: string) {
  const referenced = await prisma.contractEvent.findUnique({
    where: { id: eventId },
    select: { contractId: true },
  });
  return Boolean(referenced && referenced.contractId === contractId);
}

/** La unicidad es (contractId, type, number), respaldada por el índice de la
 *  migración 20260907120000_budget_record_unique_type_number. Se comprueba
 *  antes para devolver un mensaje legible; el P2002 de abajo es la garantía
 *  real ante dos peticiones concurrentes. */
async function findClashingRecord(
  contractId: string,
  type: BudgetRecordType,
  number: string,
  excludeId?: string,
) {
  return prisma.budgetRecord.findFirst({
    where: { contractId, type, number, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true },
  });
}

const clashMessage = (type: BudgetRecordType, number: string) =>
  `Ya existe un ${type} con el número ${number} para este contrato`;

export async function budgetRoutes(app: FastifyInstance) {
  // ── Anidadas bajo el contrato ────────────────────────────────────────────

  app.get<{ Params: { contractId: string } }>(
    "/contratos/:contractId/presupuesto",
    async (request, reply) => {
      const contract = await prisma.contract.findUnique({
        where: { id: request.params.contractId },
        select: { id: true },
      });
      if (!contract) {
        return reply.status(404).send({ error: "Contrato no encontrado" });
      }

      const records = await prisma.budgetRecord.findMany({
        where: { contractId: contract.id },
        // Los CDP anteceden a los RP y, dentro de cada tipo, manda la fecha de
        // expedición: es el orden en que aparecen en el expediente.
        orderBy: [{ type: "asc" }, { issuedAt: "asc" }, { createdAt: "asc" }],
      });
      return records.map(serializeBudgetRecord);
    },
  );

  app.post<{ Params: { contractId: string }; Body: CreateBudgetRecordBody }>(
    "/contratos/:contractId/presupuesto",
    { schema: { body: createBudgetRecordSchema } },
    async (request, reply) => {
      const body = request.body;
      const number = body.number.trim();

      const contract = await prisma.contract.findUnique({
        where: { id: request.params.contractId },
        select: { id: true },
      });
      if (!contract) {
        return reply.status(404).send({ error: "Contrato no encontrado" });
      }

      if (body.eventId) {
        const ok = await assertSameContractEvent(body.eventId, contract.id);
        if (!ok) {
          return reply
            .status(400)
            .send({ error: "El evento asociado no existe o pertenece a otro contrato" });
        }
      }

      const clash = await findClashingRecord(contract.id, body.type, number);
      if (clash) {
        return reply.status(409).send({ error: clashMessage(body.type, number) });
      }

      try {
        const record = await prisma.budgetRecord.create({
          data: {
            contractId: contract.id,
            eventId: body.eventId || null,
            type: body.type,
            number,
            value: new Prisma.Decimal(body.value),
            issuedAt: toDate(body.issuedAt),
          },
        });
        return reply.status(201).send(serializeBudgetRecord(record));
      } catch (error) {
        const mapped = prismaErrorResponse(error, BUDGET_RECORD_ERRORS);
        if (mapped) return reply.status(mapped.status).send(mapped.body);
        throw error;
      }
    },
  );

  // ── Por id ───────────────────────────────────────────────────────────────

  app.get<{ Params: { id: string } }>("/presupuesto/:id", async (request, reply) => {
    const record = await prisma.budgetRecord.findUnique({ where: { id: request.params.id } });
    if (!record) {
      return reply.status(404).send({ error: "Respaldo presupuestal no encontrado" });
    }
    return serializeBudgetRecord(record);
  });

  app.patch<{ Params: { id: string }; Body: UpdateBudgetRecordBody }>(
    "/presupuesto/:id",
    { schema: { body: updateBudgetRecordSchema } },
    async (request, reply) => {
      const body = request.body;

      const current = await prisma.budgetRecord.findUnique({
        where: { id: request.params.id },
        select: { id: true, contractId: true, type: true, number: true },
      });
      if (!current) {
        return reply.status(404).send({ error: "Respaldo presupuestal no encontrado" });
      }

      if (body.eventId) {
        const ok = await assertSameContractEvent(body.eventId, current.contractId);
        if (!ok) {
          return reply
            .status(400)
            .send({ error: "El evento asociado no existe o pertenece a otro contrato" });
        }
      }

      // Cambiar solo el tipo también puede provocar colisión aunque el número
      // no se toque, porque la unicidad incluye ambos.
      const resultingType = body.type ?? current.type;
      const resultingNumber = body.number === undefined ? current.number : body.number.trim();

      if (resultingType !== current.type || resultingNumber !== current.number) {
        const clash = await findClashingRecord(
          current.contractId,
          resultingType,
          resultingNumber,
          current.id,
        );
        if (clash) {
          return reply.status(409).send({ error: clashMessage(resultingType, resultingNumber) });
        }
      }

      const data: Prisma.BudgetRecordUncheckedUpdateInput = {};

      if (body.eventId !== undefined) data.eventId = body.eventId || null;
      if (body.type !== undefined) data.type = body.type;
      if (body.number !== undefined) data.number = resultingNumber;
      if (body.value !== undefined) data.value = new Prisma.Decimal(body.value);
      if (body.issuedAt !== undefined) data.issuedAt = toDate(body.issuedAt);

      try {
        const record = await prisma.budgetRecord.update({ where: { id: current.id }, data });
        return serializeBudgetRecord(record);
      } catch (error) {
        const mapped = prismaErrorResponse(error, BUDGET_RECORD_ERRORS);
        if (mapped) return reply.status(mapped.status).send(mapped.body);
        throw error;
      }
    },
  );

  app.delete<{ Params: { id: string } }>("/presupuesto/:id", async (request, reply) => {
    try {
      await prisma.budgetRecord.delete({ where: { id: request.params.id } });
      return reply.status(204).send();
    } catch (error) {
      const mapped = prismaErrorResponse(error, BUDGET_RECORD_ERRORS);
      if (mapped) return reply.status(mapped.status).send(mapped.body);
      throw error;
    }
  });
}
