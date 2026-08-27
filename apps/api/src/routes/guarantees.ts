import type { FastifyInstance } from "fastify";
import { Prisma, GuaranteeType } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { dateOnly, decimalToString } from "../lib/serialize";
import { prismaErrorResponse } from "../lib/prisma-errors";
import { nullableDate, nullableMoney, nullableString, toDate } from "../lib/validation";

// Pólizas del contrato. Una fila por amparo, tal como aparecen en los
// expedientes reales (PDFs separados por amparo).
//
// `coversEventId` nulo = garantía inicial del contrato. Cuando apunta a un
// evento, indica qué modificación ampara. Este módulo solo guarda esa
// relación: la regla "todo evento que cambia valor o plazo debe tener una
// garantía que lo referencie" es del motor de reglas, no de aquí.

type GuaranteeRecord = Prisma.GuaranteeGetPayload<Record<string, never>>;

function serializeGuarantee(guarantee: GuaranteeRecord) {
  return {
    id: guarantee.id,
    contractId: guarantee.contractId,
    coversEventId: guarantee.coversEventId,
    type: guarantee.type,
    policyNumber: guarantee.policyNumber,
    insurer: guarantee.insurer,
    insuredValue: decimalToString(guarantee.insuredValue),
    validFrom: dateOnly(guarantee.validFrom),
    validUntil: dateOnly(guarantee.validUntil),
    approvedAt: dateOnly(guarantee.approvedAt),
    createdAt: guarantee.createdAt.toISOString(),
    updatedAt: guarantee.updatedAt.toISOString(),
  };
}

const guaranteeProperties = {
  coversEventId: nullableString,
  type: { type: "string", enum: Object.values(GuaranteeType) },
  policyNumber: { type: "string", minLength: 1, maxLength: 100 },
  insurer: nullableString,
  insuredValue: nullableMoney,
  validFrom: nullableDate,
  validUntil: nullableDate,
  approvedAt: nullableDate,
} as const;

const createGuaranteeSchema = {
  type: "object",
  required: ["type", "policyNumber"],
  additionalProperties: false,
  properties: guaranteeProperties,
} as const;

const updateGuaranteeSchema = {
  type: "object",
  minProperties: 1,
  additionalProperties: false,
  properties: guaranteeProperties,
} as const;

type CreateGuaranteeBody = {
  coversEventId?: string | null;
  type: GuaranteeType;
  policyNumber: string;
  insurer?: string | null;
  insuredValue?: string | number | null;
  validFrom?: string | null;
  validUntil?: string | null;
  approvedAt?: string | null;
};

type UpdateGuaranteeBody = Partial<CreateGuaranteeBody>;

const GUARANTEE_ERRORS = {
  conflict: "La garantía ya existe",
  foreignKey: "El contrato o el evento amparado no existe",
  notFound: "Garantía no encontrada",
};

/** El evento amparado debe existir y pertenecer al mismo contrato: si no, la
 *  póliza diría amparar una modificación de otro expediente. */
async function assertSameContractEvent(eventId: string, contractId: string) {
  const referenced = await prisma.contractEvent.findUnique({
    where: { id: eventId },
    select: { contractId: true },
  });
  return Boolean(referenced && referenced.contractId === contractId);
}

export async function guaranteesRoutes(app: FastifyInstance) {
  app.get<{ Params: { contractId: string } }>(
    "/contratos/:contractId/garantias",
    async (request, reply) => {
      const contract = await prisma.contract.findUnique({
        where: { id: request.params.contractId },
        select: { id: true },
      });
      if (!contract) {
        return reply.status(404).send({ error: "Contrato no encontrado" });
      }

      const guarantees = await prisma.guarantee.findMany({
        where: { contractId: contract.id },
        orderBy: [{ validFrom: "asc" }, { createdAt: "asc" }],
      });
      return guarantees.map(serializeGuarantee);
    },
  );

  app.post<{ Params: { contractId: string }; Body: CreateGuaranteeBody }>(
    "/contratos/:contractId/garantias",
    { schema: { body: createGuaranteeSchema } },
    async (request, reply) => {
      const body = request.body;

      const contract = await prisma.contract.findUnique({
        where: { id: request.params.contractId },
        select: { id: true },
      });
      if (!contract) {
        return reply.status(404).send({ error: "Contrato no encontrado" });
      }

      if (body.coversEventId) {
        const ok = await assertSameContractEvent(body.coversEventId, contract.id);
        if (!ok) {
          return reply
            .status(400)
            .send({ error: "El evento amparado no existe o pertenece a otro contrato" });
        }
      }

      try {
        const guarantee = await prisma.guarantee.create({
          data: {
            contractId: contract.id,
            coversEventId: body.coversEventId || null,
            type: body.type,
            policyNumber: body.policyNumber.trim(),
            insurer: body.insurer?.trim() || null,
            insuredValue:
              body.insuredValue == null ? null : new Prisma.Decimal(body.insuredValue),
            validFrom: toDate(body.validFrom),
            validUntil: toDate(body.validUntil),
            approvedAt: toDate(body.approvedAt),
          },
        });
        return reply.status(201).send(serializeGuarantee(guarantee));
      } catch (error) {
        const mapped = prismaErrorResponse(error, GUARANTEE_ERRORS);
        if (mapped) return reply.status(mapped.status).send(mapped.body);
        throw error;
      }
    },
  );

  app.get<{ Params: { id: string } }>("/garantias/:id", async (request, reply) => {
    const guarantee = await prisma.guarantee.findUnique({ where: { id: request.params.id } });
    if (!guarantee) {
      return reply.status(404).send({ error: "Garantía no encontrada" });
    }
    return serializeGuarantee(guarantee);
  });

  app.patch<{ Params: { id: string }; Body: UpdateGuaranteeBody }>(
    "/garantias/:id",
    { schema: { body: updateGuaranteeSchema } },
    async (request, reply) => {
      const body = request.body;

      const current = await prisma.guarantee.findUnique({
        where: { id: request.params.id },
        select: { id: true, contractId: true },
      });
      if (!current) {
        return reply.status(404).send({ error: "Garantía no encontrada" });
      }

      if (body.coversEventId) {
        const ok = await assertSameContractEvent(body.coversEventId, current.contractId);
        if (!ok) {
          return reply
            .status(400)
            .send({ error: "El evento amparado no existe o pertenece a otro contrato" });
        }
      }

      const data: Prisma.GuaranteeUncheckedUpdateInput = {};

      if (body.coversEventId !== undefined) data.coversEventId = body.coversEventId || null;
      if (body.type !== undefined) data.type = body.type;
      if (body.policyNumber !== undefined) data.policyNumber = body.policyNumber.trim();
      if (body.insurer !== undefined) data.insurer = body.insurer?.trim() || null;
      if (body.insuredValue !== undefined) {
        data.insuredValue =
          body.insuredValue == null ? null : new Prisma.Decimal(body.insuredValue);
      }
      if (body.validFrom !== undefined) data.validFrom = toDate(body.validFrom);
      if (body.validUntil !== undefined) data.validUntil = toDate(body.validUntil);
      if (body.approvedAt !== undefined) data.approvedAt = toDate(body.approvedAt);

      try {
        const guarantee = await prisma.guarantee.update({ where: { id: current.id }, data });
        return serializeGuarantee(guarantee);
      } catch (error) {
        const mapped = prismaErrorResponse(error, GUARANTEE_ERRORS);
        if (mapped) return reply.status(mapped.status).send(mapped.body);
        throw error;
      }
    },
  );

  app.delete<{ Params: { id: string } }>("/garantias/:id", async (request, reply) => {
    try {
      await prisma.guarantee.delete({ where: { id: request.params.id } });
      return reply.status(204).send();
    } catch (error) {
      const mapped = prismaErrorResponse(error, GUARANTEE_ERRORS);
      if (mapped) return reply.status(mapped.status).send(mapped.body);
      throw error;
    }
  });
}
