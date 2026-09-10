import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { healthRoutes } from "./routes/health";
import { contractsRoutes } from "./routes/contracts";
import { paymentsRoutes } from "./routes/payments";
import { eventsRoutes } from "./routes/events";
import { guaranteesRoutes } from "./routes/guarantees";
import { budgetRoutes } from "./routes/budget";
import { documentsRoutes } from "./routes/documents";
import { catalogRoutes } from "./routes/catalog";
import { diagnosticsRoutes } from "./routes/diagnostics";
import { classificationRoutes } from "./routes/classification";
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
  // Solo lo usa la clasificación documental. Un archivo por petición: este
  // endpoint clasifica UN documento, y aceptar varios en silencio haría creer
  // que se procesaron todos.
  await app.register(multipart, {
    limits: { fileSize: 20 * 1024 * 1024, files: 1 },
  });

  await app.register(healthRoutes);
  await app.register(catalogRoutes);
  await app.register(contractsRoutes, { prefix: "/contratos" });
  // Sin prefijo: declara tanto /contratos/:contractId/pagos como /pagos/:id.
  await app.register(paymentsRoutes);
  await app.register(eventsRoutes);
  await app.register(guaranteesRoutes);
  await app.register(budgetRoutes);
  await app.register(documentsRoutes);
  // Sin prefijo y aparte de contractsRoutes: no es un CRUD del contrato sino
  // el motor de reglas leyendo todo el expediente.
  await app.register(diagnosticsRoutes);
  // El único punto de IA del sistema. Aparte del CRUD de documentos porque no
  // escribe nada: propone una clasificación que el usuario tiene que confirmar
  // contra POST /contratos/:id/documentos.
  await app.register(classificationRoutes);

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
