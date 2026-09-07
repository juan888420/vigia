import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";

// Read-only lookups. They exist only so the "Nuevo contrato" form can resolve
// officeId and contractTypeId without the user typing a cuid by hand.

export async function catalogRoutes(app: FastifyInstance) {
  app.get("/oficinas", async () =>
    prisma.office.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  );

  app.get("/modalidades", async () =>
    prisma.contractType.findMany({
      where: { active: true },
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
    }),
  );

  // Tipos documentales que aplican a una modalidad. Se consulta a través de
  // DocumentRequirement, no de DocumentType directo: el catálogo de tipos es
  // independiente de la modalidad (el mismo "Acta de inicio" sirve para CD y
  // para licitación) y es DocumentRequirement el que dice cuáles aplican a
  // cada una. Hoy solo existe CD y devuelve los 29, pero cuando entre una
  // segunda modalidad el selector no ofrecerá tipos que no le corresponden.
  //
  // `displayOrder` manda el orden: es la secuencia en que los documentos
  // aparecen en el expediente, no el alfabético.
  app.get<{ Params: { contractTypeId: string } }>(
    "/modalidades/:contractTypeId/tipos-documentales",
    async (request, reply) => {
      const contractType = await prisma.contractType.findUnique({
        where: { id: request.params.contractTypeId },
        select: { id: true },
      });
      if (!contractType) {
        return reply.status(404).send({ error: "Modalidad no encontrada" });
      }

      const requirements = await prisma.documentRequirement.findMany({
        where: { contractTypeId: contractType.id },
        orderBy: { displayOrder: "asc" },
        select: {
          required: true,
          appliesToEachPayment: true,
          documentType: {
            select: { id: true, code: true, name: true, stage: true, fileLabel: true },
          },
        },
      });

      return requirements.map((requirement) => ({
        ...requirement.documentType,
        required: requirement.required,
        appliesToEachPayment: requirement.appliesToEachPayment,
      }));
    },
  );
}
