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
}
