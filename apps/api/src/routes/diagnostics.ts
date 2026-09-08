import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";
import { decimalToString } from "../lib/serialize";
import { formatDate, startOfUtcDay } from "../rules/dates";
import { computeDiagnostic } from "../rules/engine";
import type { CurrentEndDate, Diagnostic } from "../rules/types";

// Diagnóstico de un contrato: la única ruta del API que devuelve algo
// calculado en vez de algo guardado.
//
// Es de SOLO LECTURA y sin caché a propósito. El estado no es una columna
// (README → decisión pendiente #1): se recalcula en cada consulta leyendo los
// datos ya registrados, así que nunca puede quedar desfasado del expediente.
// Si el volumen crece, la caché será explícita y marcada como derivada.

function serializeEndDate(endDate: CurrentEndDate) {
  switch (endDate.state) {
    case "CALCULADA":
      return { state: endDate.state, date: formatDate(endDate.date) };
    case "SUSPENDIDO":
      return {
        state: endDate.state,
        suspensionEventId: endDate.suspensionEventId,
        suspendedSince: formatDate(endDate.suspendedSince),
        provisionalDate:
          endDate.provisionalDate === null ? null : formatDate(endDate.provisionalDate),
      };
    case "SIN_FECHAS_BASE":
      return { state: endDate.state };
  }
}

function serializeDiagnostic(diagnostic: Diagnostic, today: Date) {
  return {
    computedAt: formatDate(today),
    // Los montos salen como string por la misma razón que en el resto del API:
    // son Decimal(15,2) y un number de JSON los redondearía en silencio.
    currentValue: decimalToString(diagnostic.currentValue),
    currentEndDate: serializeEndDate(diagnostic.currentEndDate),
    balance: decimalToString(diagnostic.balance),
    budgetBacking: {
      total: decimalToString(diagnostic.budgetBacking.total),
      cdpTotal: decimalToString(diagnostic.budgetBacking.cdpTotal),
      matchStatus: diagnostic.budgetBacking.matchStatus,
    },
    status: diagnostic.status,
    findings: diagnostic.findings,
  };
}

export async function diagnosticsRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>("/contratos/:id/diagnostico", async (request, reply) => {
    const contract = await prisma.contract.findUnique({ where: { id: request.params.id } });
    if (!contract) {
      return reply.status(404).send({ error: "Contrato no encontrado" });
    }

    const [events, payments, guarantees, budgetRecords, documents, requirements, overrides] =
      await Promise.all([
        prisma.contractEvent.findMany({
          where: { contractId: contract.id },
          orderBy: [{ eventDate: "asc" }, { createdAt: "asc" }],
        }),
        prisma.payment.findMany({
          where: { contractId: contract.id },
          orderBy: { sequenceNumber: "asc" },
        }),
        prisma.guarantee.findMany({ where: { contractId: contract.id } }),
        prisma.budgetRecord.findMany({ where: { contractId: contract.id } }),
        prisma.contractDocument.findMany({ where: { contractId: contract.id } }),
        // La plantilla de la modalidad del contrato, en el orden en que los
        // documentos aparecen en el expediente.
        prisma.documentRequirement.findMany({
          where: { contractTypeId: contract.contractTypeId },
          include: { documentType: true },
          orderBy: { displayOrder: "asc" },
        }),
        prisma.contractRequirementOverride.findMany({ where: { contractId: contract.id } }),
      ]);

    // "Hoy" se fija aquí y se inyecta: el motor no lee el reloj, para que dos
    // reglas de la misma petición no puedan evaluarse contra días distintos.
    // Medianoche UTC, igual que las columnas @db.Date con las que se compara.
    const today = startOfUtcDay(new Date());

    const diagnostic = computeDiagnostic({
      contract,
      events,
      payments,
      guarantees,
      budgetRecords,
      documents,
      requirements,
      overrides,
      today,
    });

    return {
      contract: { id: contract.id, number: contract.number, object: contract.object },
      ...serializeDiagnostic(diagnostic, today),
    };
  });
}
