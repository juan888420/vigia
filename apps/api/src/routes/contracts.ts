import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { normalizeContractNumber } from "../lib/contract-number";
import { dateOnly, decimalToString } from "../lib/serialize";

// Only Contract is exposed here. Payment, ContractEvent, Guarantee and
// ContractDocument have no routes yet, and neither does the rules engine: this
// API returns what is stored, never a derived status, a balance or an alert.

const contractInclude = {
  contractType: { select: { id: true, code: true, name: true } },
  office: { select: { id: true, name: true } },
} satisfies Prisma.ContractInclude;

type ContractWithRelations = Prisma.ContractGetPayload<{ include: typeof contractInclude }>;

function serializeContract(contract: ContractWithRelations) {
  return {
    id: contract.id,
    number: contract.number,
    normalizedNumber: contract.normalizedNumber,
    object: contract.object,
    contractor: contract.contractor,
    contractorId: contract.contractorId,
    supervisor: contract.supervisor,
    initialValue: decimalToString(contract.initialValue),
    initialTermDays: contract.initialTermDays,
    signatureDate: dateOnly(contract.signatureDate),
    startDate: dateOnly(contract.startDate),
    initialEndDate: dateOnly(contract.initialEndDate),
    advanceValue: decimalToString(contract.advanceValue),
    notes: contract.notes,
    parentContractId: contract.parentContractId,
    contractType: contract.contractType,
    office: contract.office,
    createdAt: contract.createdAt.toISOString(),
    updatedAt: contract.updatedAt.toISOString(),
  };
}

const nullableString = { type: ["string", "null"] } as const;
const nullableDate = { type: ["string", "null"], format: "date" } as const;
/** Accepts "45000000.00" or 45000000; Prisma parses both into Decimal(15,2). */
const money = { type: ["string", "number"], pattern: "^-?\\d{1,13}(\\.\\d{1,2})?$" } as const;

/** Campos escribibles del contrato. Create y update comparten esta definición
 *  para que un campo nuevo no pueda quedar validado en una ruta y en la otra no. */
const contractProperties = {
  officeId: { type: "string", minLength: 1 },
  contractTypeId: { type: "string", minLength: 1 },
  number: { type: "string", minLength: 1, maxLength: 60 },
  object: { type: "string", minLength: 1 },
  contractor: nullableString,
  contractorId: nullableString,
  supervisor: nullableString,
  initialValue: money,
  initialTermDays: { type: ["integer", "null"], minimum: 1 },
  signatureDate: nullableDate,
  startDate: nullableDate,
  initialEndDate: nullableDate,
  advanceValue: { ...money, type: ["string", "number", "null"] },
} as const;

const createContractSchema = {
  type: "object",
  required: ["officeId", "contractTypeId", "number", "object", "initialValue"],
  additionalProperties: false,
  properties: contractProperties,
} as const;

/** PATCH: cualquier subconjunto, pero nunca un body vacío. Sin `required`, y
 *  los campos obligatorios en creación tampoco pueden ponerse a null aquí
 *  porque su definición no admite el tipo "null". */
const updateContractSchema = {
  type: "object",
  minProperties: 1,
  additionalProperties: false,
  properties: contractProperties,
} as const;

type CreateContractBody = {
  officeId: string;
  contractTypeId: string;
  number: string;
  object: string;
  contractor?: string | null;
  contractorId?: string | null;
  supervisor?: string | null;
  initialValue: string | number;
  initialTermDays?: number | null;
  signatureDate?: string | null;
  startDate?: string | null;
  initialEndDate?: string | null;
  advanceValue?: string | number | null;
};

type UpdateContractBody = Partial<CreateContractBody>;

/** "2025-03-15" → Date at UTC midnight, so a @db.Date column keeps the day. */
function toDate(value: string | null | undefined): Date | null {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

function toDecimal(value: string | number | null | undefined): Prisma.Decimal | null {
  return value === null || value === undefined ? null : new Prisma.Decimal(value);
}

/**
 * Traduce los errores conocidos de Prisma a respuestas HTTP. Devuelve null
 * cuando el error no es uno de los esperados, para que suba y quede en el log
 * en vez de convertirse en un 400 genérico que oculte un fallo real.
 */
function prismaErrorResponse(error: unknown): { status: number; body: object } | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return null;

  switch (error.code) {
    // Unique violation on (officeId, normalizedNumber).
    case "P2002":
      return {
        status: 409,
        body: { error: "Ya existe un contrato con ese número en la oficina" },
      };
    // FK violation: officeId or contractTypeId does not exist.
    case "P2003":
      return {
        status: 400,
        body: { error: "La oficina o la modalidad de contratación no existe" },
      };
    // Update/delete sobre un id inexistente.
    case "P2025":
      return { status: 404, body: { error: "Contrato no encontrado" } };
    default:
      return null;
  }
}

export async function contractsRoutes(app: FastifyInstance) {
  app.get("/", async () => {
    const contracts = await prisma.contract.findMany({
      include: contractInclude,
      orderBy: { createdAt: "desc" },
    });
    return contracts.map(serializeContract);
  });

  app.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const contract = await prisma.contract.findUnique({
      where: { id: request.params.id },
      include: contractInclude,
    });
    if (!contract) {
      return reply.status(404).send({ error: "Contrato no encontrado" });
    }
    return serializeContract(contract);
  });

  app.post<{ Body: CreateContractBody }>(
    "/",
    { schema: { body: createContractSchema } },
    async (request, reply) => {
      const body = request.body;

      try {
        const contract = await prisma.contract.create({
          data: {
            officeId: body.officeId,
            contractTypeId: body.contractTypeId,
            number: body.number.trim(),
            normalizedNumber: normalizeContractNumber(body.number),
            object: body.object.trim(),
            contractor: body.contractor?.trim() || null,
            contractorId: body.contractorId?.trim() || null,
            supervisor: body.supervisor?.trim() || null,
            initialValue: new Prisma.Decimal(body.initialValue),
            initialTermDays: body.initialTermDays ?? null,
            signatureDate: toDate(body.signatureDate),
            startDate: toDate(body.startDate),
            initialEndDate: toDate(body.initialEndDate),
            advanceValue: toDecimal(body.advanceValue),
          },
          include: contractInclude,
        });

        return reply.status(201).send(serializeContract(contract));
      } catch (error) {
        const mapped = prismaErrorResponse(error);
        if (mapped) return reply.status(mapped.status).send(mapped.body);
        throw error;
      }
    },
  );

  app.patch<{ Params: { id: string }; Body: UpdateContractBody }>(
    "/:id",
    { schema: { body: updateContractSchema } },
    async (request, reply) => {
      const body = request.body;

      const current = await prisma.contract.findUnique({
        where: { id: request.params.id },
        select: { id: true, officeId: true, normalizedNumber: true },
      });
      if (!current) {
        return reply.status(404).send({ error: "Contrato no encontrado" });
      }

      // Solo se escriben las claves presentes en el body: un campo ausente se
      // deja como está, y uno enviado explícitamente como null se borra.
      const data: Prisma.ContractUncheckedUpdateInput = {};

      if (body.officeId !== undefined) data.officeId = body.officeId;
      if (body.contractTypeId !== undefined) data.contractTypeId = body.contractTypeId;
      if (body.object !== undefined) data.object = body.object.trim();
      if (body.contractor !== undefined) data.contractor = body.contractor?.trim() || null;
      if (body.contractorId !== undefined) data.contractorId = body.contractorId?.trim() || null;
      if (body.supervisor !== undefined) data.supervisor = body.supervisor?.trim() || null;
      if (body.initialValue !== undefined) data.initialValue = new Prisma.Decimal(body.initialValue);
      if (body.initialTermDays !== undefined) data.initialTermDays = body.initialTermDays;
      if (body.signatureDate !== undefined) data.signatureDate = toDate(body.signatureDate);
      if (body.startDate !== undefined) data.startDate = toDate(body.startDate);
      if (body.initialEndDate !== undefined) data.initialEndDate = toDate(body.initialEndDate);
      if (body.advanceValue !== undefined) data.advanceValue = toDecimal(body.advanceValue);

      if (body.number !== undefined) {
        data.number = body.number.trim();
        data.normalizedNumber = normalizeContractNumber(body.number);
      }

      // La unicidad es (officeId, normalizedNumber), así que cambiar de oficina
      // puede provocar una colisión aunque el número no se toque. Se comprueba
      // contra los valores efectivos, no solo contra los recibidos.
      const targetOfficeId = body.officeId ?? current.officeId;
      const targetNormalized =
        body.number !== undefined ? normalizeContractNumber(body.number) : current.normalizedNumber;

      if (targetOfficeId !== current.officeId || targetNormalized !== current.normalizedNumber) {
        const clash = await prisma.contract.findFirst({
          where: {
            officeId: targetOfficeId,
            normalizedNumber: targetNormalized,
            id: { not: current.id },
          },
          select: { number: true },
        });
        if (clash) {
          return reply.status(409).send({
            error: `Ya existe el contrato ${clash.number} con ese número en la oficina`,
            normalizedNumber: targetNormalized,
          });
        }
      }

      try {
        const contract = await prisma.contract.update({
          where: { id: current.id },
          data,
          include: contractInclude,
        });
        return serializeContract(contract);
      } catch (error) {
        // El chequeo previo cubre el caso normal; P2002 aquí solo aparecería si
        // otra petición creara el mismo número entre la comprobación y el update.
        const mapped = prismaErrorResponse(error);
        if (mapped) return reply.status(mapped.status).send(mapped.body);
        throw error;
      }
    },
  );

  // Borrado real. Todavía no existen Payment / ContractEvent / Guarantee que
  // dependan del contrato, así que no hay nada que proteger ni que archivar.
  app.delete<{ Params: { id: string } }>("/:id", async (request, reply) => {
    try {
      await prisma.contract.delete({ where: { id: request.params.id } });
      return reply.status(204).send();
    } catch (error) {
      const mapped = prismaErrorResponse(error);
      if (mapped) return reply.status(mapped.status).send(mapped.body);
      throw error;
    }
  });
}
