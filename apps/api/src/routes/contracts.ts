import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { normalizeContractNumber } from "../lib/contract-number";
import { dateOnly, decimalToString } from "../lib/serialize";
import { prismaErrorResponse } from "../lib/prisma-errors";
import { money, nullableDate, nullableMoney, nullableString, toDate } from "../lib/validation";
import { resolveInitialTermDays } from "../lib/contract-term";
import { computeCurrentValue } from "../rules/derived";

// Only Contract is exposed here as a writable resource.
//
// One exception to "this API returns only what is stored": `currentValue`.
// It is computed here with the SAME `computeCurrentValue` the diagnostic uses
// (rules/derived.ts), never with a second copy of the rule. The dashboard
// lists every contract at once, and asking for a full diagnostic per row
// would be N+1 requests to discard 97% of each payload. It stays READ-ONLY:
// the writable columns are still only the initial conditions.

const contractInclude = {
  contractType: { select: { id: true, code: true, name: true } },
  office: { select: { id: true, name: true } },
  // Solo para derivar `currentValue`. No se serializan: los eventos tienen su
  // propia ruta. Va en el include COMPARTIDO —y no solo en el listado— para
  // que todas las respuestas de contrato tengan la misma forma; un campo que
  // aparece en unas rutas y en otras no es un tipo que miente.
  events: true,
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
    /// Derivado, de solo lectura: valor inicial + adiciones. Ver la cabecera.
    currentValue: decimalToString(computeCurrentValue(contract, contract.events)),
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
  advanceValue: nullableMoney,
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

function toDecimal(value: string | number | null | undefined): Prisma.Decimal | null {
  return value === null || value === undefined ? null : new Prisma.Decimal(value);
}

const CONTRACT_ERRORS = {
  conflict: "Ya existe un contrato con ese número en la oficina",
  foreignKey: "La oficina o la modalidad de contratación no existe",
  notFound: "Contrato no encontrado",
};


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

      // El plazo no se copia del body sin más: con las dos fechas presentes se
      // deriva de ellas y un número que las contradiga es un 400. Toda la
      // decisión está en lib/contract-term.ts, compartida con el PATCH.
      const startDate = toDate(body.startDate);
      const initialEndDate = toDate(body.initialEndDate);
      const termDays = resolveInitialTermDays({
        startDate,
        initialEndDate,
        initialTermDays: body.initialTermDays,
      });
      if (!termDays.ok) {
        return reply.status(400).send({ error: termDays.error });
      }

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
            initialTermDays: termDays.value,
            signatureDate: toDate(body.signatureDate),
            startDate,
            initialEndDate,
            advanceValue: toDecimal(body.advanceValue),
          },
          include: contractInclude,
        });

        return reply.status(201).send(serializeContract(contract));
      } catch (error) {
        const mapped = prismaErrorResponse(error, CONTRACT_ERRORS);
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
        select: {
          id: true,
          officeId: true,
          normalizedNumber: true,
          // Necesarias para fusionar: un PATCH que mueve UNA fecha recalcula el
          // plazo contra la otra, la que ya estaba guardada.
          startDate: true,
          initialEndDate: true,
        },
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
      if (body.signatureDate !== undefined) data.signatureDate = toDate(body.signatureDate);
      if (body.startDate !== undefined) data.startDate = toDate(body.startDate);
      if (body.initialEndDate !== undefined) data.initialEndDate = toDate(body.initialEndDate);

      // El plazo solo se revisa si el PATCH toca alguna de las tres claves que
      // lo determinan. Para el resto rige la semántica normal de PATCH —clave
      // ausente, campo intacto—: cambiar el supervisor no puede borrar un plazo
      // manual, que es el único dato del contrato cuyo valor no se puede
      // reconstruir desde las fechas cuando estas no están completas.
      const touchesTerm =
        body.startDate !== undefined ||
        body.initialEndDate !== undefined ||
        body.initialTermDays !== undefined;

      if (touchesTerm) {
        // Fechas EFECTIVAS: lo que trae el body, o lo ya guardado si la clave
        // no vino. Sin fusionar, un PATCH que solo mueve initialEndDate
        // recalcularía contra un startDate inexistente y borraría el plazo.
        const effectiveStartDate =
          body.startDate !== undefined ? toDate(body.startDate) : current.startDate;
        const effectiveEndDate =
          body.initialEndDate !== undefined ? toDate(body.initialEndDate) : current.initialEndDate;

        const termDays = resolveInitialTermDays({
          startDate: effectiveStartDate,
          initialEndDate: effectiveEndDate,
          initialTermDays: body.initialTermDays,
        });
        if (!termDays.ok) {
          return reply.status(400).send({ error: termDays.error });
        }
        data.initialTermDays = termDays.value;
      }
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
        const mapped = prismaErrorResponse(error, CONTRACT_ERRORS);
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
      const mapped = prismaErrorResponse(error, CONTRACT_ERRORS);
      if (mapped) return reply.status(mapped.status).send(mapped.body);
      throw error;
    }
  });
}
