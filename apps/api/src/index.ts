import Fastify from "fastify";
import cors from "@fastify/cors";
import { healthRoutes } from "./routes/health";
import { contractsRoutes } from "./routes/contracts";
import { catalogRoutes } from "./routes/catalog";
import { prisma } from "./lib/prisma";

const app = Fastify({
  logger: true,
  // Fastify configura AJV con removeAdditional por defecto: un campo no
  // declarado se descarta en silencio y la petición pasa. Aquí eso significaría
  // aceptar un dato del expediente y perderlo sin aviso, así que se rechaza.
  ajv: { customOptions: { removeAdditional: false, coerceTypes: false } },
});

async function main() {
  await app.register(cors, { origin: true });

  await app.register(healthRoutes);
  await app.register(catalogRoutes);
  await app.register(contractsRoutes, { prefix: "/contratos" });

  app.addHook("onClose", async () => {
    await prisma.$disconnect();
  });

  const port = Number(process.env.PORT) || 3333;
  await app.listen({ port, host: "0.0.0.0" });
}

main().catch((err) => {
  app.log.error(err);
  process.exit(1);
});
