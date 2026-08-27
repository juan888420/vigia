import type { FastifyInstance } from "fastify";
import { Prisma, PaymentStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { dateOnly, decimalToString } from "../lib/serialize";
import { prismaErrorResponse } from "../lib/prisma-errors";
import { money, nullableDate, nullableString, toDate } from "../lib/validation";

// Pagos de un contrato. Todavía no se cuelgan soportes documentales de aquí
// (ContractDocument no tiene rutas), y `status` es un estado administrativo
// declarado — NO la completitud documental del pago, que la derivará el motor
// de reglas comparando los DocumentRequirement con appliesToEachPayment.
//
// Tampoco se detectan saltos de secuencia: eso es del motor de reglas.

type PaymentRecord = Prisma.PaymentGetPayload<Record<string, never>>;

function serializePayment(payment: PaymentRecord) {
  return {
    id: payment.id,
    contractId: payment.contractId,
    sequenceNumber: payment.sequenceNumber,
    value: decimalToString(payment.value),
    actDate: dateOnly(payment.actDate),
    paidAt: dateOnly(payment.paidAt),
    status: payment.status,
    isAdvance: payment.isAdvance,
    notes: payment.notes,
    createdAt: payment.createdAt.toISOString(),
    updatedAt: payment.updatedAt.toISOString(),
  };
}

/** Campos escribibles del pago. Create y update comparten la definición para
 *  que un campo nuevo no quede validado en una ruta y suelto en la otra.
 *  `contractId` no está aquí: viene en la URL, no en el body. */
const paymentProperties = {
  sequenceNumber: { type: "integer", minimum: 1 },
  value: money,
  actDate: nullableDate,
  paidAt: nullableDate,
  status: { type: "string", enum: Object.values(PaymentStatus) },
  isAdvance: { type: "boolean" },
  notes: nullableString,
} as const;

const createPaymentSchema = {
  type: "object",
  required: ["sequenceNumber", "value"],
  additionalProperties: false,
  properties: paymentProperties,
} as const;

const updatePaymentSchema = {
  type: "object",
  minProperties: 1,
  additionalProperties: false,
  properties: paymentProperties,
} as const;

type CreatePaymentBody = {
  sequenceNumber: number;
  value: string | number;
  actDate?: string | null;
  paidAt?: string | null;
  status?: PaymentStatus;
  isAdvance?: boolean;
  notes?: string | null;
};

type UpdatePaymentBody = Partial<CreatePaymentBody>;

const paymentErrors = (sequenceNumber: number) => ({
  conflict: `Ya existe el pago ${sequenceNumber} para este contrato`,
  foreignKey: "El contrato no existe",
  notFound: "Pago no encontrado",
});

export async function paymentsRoutes(app: FastifyInstance) {
  // ── Anidadas bajo el contrato ────────────────────────────────────────────

  app.get<{ Params: { contractId: string } }>(
    "/contratos/:contractId/pagos",
    async (request, reply) => {
      const contract = await prisma.contract.findUnique({
        where: { id: request.params.contractId },
        select: { id: true },
      });
      // El contrato viene en el path, así que su ausencia es un 404 igual que
      // en GET /contratos/:id — el 400 queda para las FK que llegan en el body.
      if (!contract) {
        return reply.status(404).send({ error: "Contrato no encontrado" });
      }

      const payments = await prisma.payment.findMany({
        where: { contractId: contract.id },
        orderBy: { sequenceNumber: "asc" },
      });
      return payments.map(serializePayment);
    },
  );

  app.post<{ Params: { contractId: string }; Body: CreatePaymentBody }>(
    "/contratos/:contractId/pagos",
    { schema: { body: createPaymentSchema } },
    async (request, reply) => {
      const body = request.body;

      const contract = await prisma.contract.findUnique({
        where: { id: request.params.contractId },
        select: { id: true },
      });
      if (!contract) {
        return reply.status(404).send({ error: "Contrato no encontrado" });
      }

      // La unicidad es (contractId, sequenceNumber): el pago 1 existe en cada
      // contrato, no una sola vez en toda la base.
      const clash = await prisma.payment.findFirst({
        where: { contractId: contract.id, sequenceNumber: body.sequenceNumber },
        select: { id: true },
      });
      if (clash) {
        return reply
          .status(409)
          .send({ error: `Ya existe el pago ${body.sequenceNumber} para este contrato` });
      }

      try {
        const payment = await prisma.payment.create({
          data: {
            contractId: contract.id,
            sequenceNumber: body.sequenceNumber,
            value: new Prisma.Decimal(body.value),
            actDate: toDate(body.actDate),
            paidAt: toDate(body.paidAt),
            status: body.status ?? PaymentStatus.REGISTERED,
            isAdvance: body.isAdvance ?? false,
            notes: body.notes?.trim() || null,
          },
        });
        return reply.status(201).send(serializePayment(payment));
      } catch (error) {
        // El chequeo previo cubre el caso normal; P2002 solo saltaría si otra
        // petición creara el mismo número entre la comprobación y el insert.
        const mapped = prismaErrorResponse(error, paymentErrors(body.sequenceNumber));
        if (mapped) return reply.status(mapped.status).send(mapped.body);
        throw error;
      }
    },
  );

  // ── Por id de pago ───────────────────────────────────────────────────────

  app.get<{ Params: { id: string } }>("/pagos/:id", async (request, reply) => {
    const payment = await prisma.payment.findUnique({ where: { id: request.params.id } });
    if (!payment) {
      return reply.status(404).send({ error: "Pago no encontrado" });
    }
    return serializePayment(payment);
  });

  app.patch<{ Params: { id: string }; Body: UpdatePaymentBody }>(
    "/pagos/:id",
    { schema: { body: updatePaymentSchema } },
    async (request, reply) => {
      const body = request.body;

      const current = await prisma.payment.findUnique({
        where: { id: request.params.id },
        select: { id: true, contractId: true, sequenceNumber: true },
      });
      if (!current) {
        return reply.status(404).send({ error: "Pago no encontrado" });
      }

      // Solo se escriben las claves presentes: un campo ausente se deja como
      // está, y uno enviado como null se borra.
      const data: Prisma.PaymentUncheckedUpdateInput = {};

      if (body.sequenceNumber !== undefined) data.sequenceNumber = body.sequenceNumber;
      if (body.value !== undefined) data.value = new Prisma.Decimal(body.value);
      if (body.actDate !== undefined) data.actDate = toDate(body.actDate);
      if (body.paidAt !== undefined) data.paidAt = toDate(body.paidAt);
      if (body.status !== undefined) data.status = body.status;
      if (body.isAdvance !== undefined) data.isAdvance = body.isAdvance;
      if (body.notes !== undefined) data.notes = body.notes?.trim() || null;

      if (body.sequenceNumber !== undefined && body.sequenceNumber !== current.sequenceNumber) {
        const clash = await prisma.payment.findFirst({
          where: {
            contractId: current.contractId,
            sequenceNumber: body.sequenceNumber,
            id: { not: current.id },
          },
          select: { id: true },
        });
        if (clash) {
          return reply
            .status(409)
            .send({ error: `Ya existe el pago ${body.sequenceNumber} para este contrato` });
        }
      }

      try {
        const payment = await prisma.payment.update({ where: { id: current.id }, data });
        return serializePayment(payment);
      } catch (error) {
        const mapped = prismaErrorResponse(
          error,
          paymentErrors(body.sequenceNumber ?? current.sequenceNumber),
        );
        if (mapped) return reply.status(mapped.status).send(mapped.body);
        throw error;
      }
    },
  );

  // Borrado real. Todavía no cuelga ningún ContractDocument del pago, así que
  // no hay soportes que arrastrar ni que proteger.
  app.delete<{ Params: { id: string } }>("/pagos/:id", async (request, reply) => {
    try {
      await prisma.payment.delete({ where: { id: request.params.id } });
      return reply.status(204).send();
    } catch (error) {
      const mapped = prismaErrorResponse(error, { notFound: "Pago no encontrado" });
      if (mapped) return reply.status(mapped.status).send(mapped.body);
      throw error;
    }
  });
}
