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
import { extractionRoutes } from "./routes/extraction";
import { authRoutes } from "./routes/auth";
import { confirmationRoutes } from "./routes/confirmation";
import { prisma } from "./lib/prisma";

const app = Fastify({
  logger: true,
  // Fastify configura AJV con removeAdditional por defecto: un campo no
  // declarado se descarta en silencio y la petición pasa. Aquí eso significaría
  // aceptar un dato del expediente y perderlo sin aviso, así que se rechaza.
  ajv: { customOptions: { removeAdditional: false, coerceTypes: false } },
});

/** Orígenes autorizados a llamar al API desde un navegador. Sale del entorno
 *  para que un dominio de producción sea un cambio de variable y no de código;
 *  admite varios separados por coma.
 *
 *  Si falta, no se autoriza NINGUNO. Falla cerrado a propósito: un fallback a
 *  "cualquier origen" convierte un despliegue mal configurado en un API abierto
 *  sin que nadie se entere. El aviso de abajo es para que en desarrollo se note
 *  enseguida que falta la variable, en vez de perseguir un error de CORS en el
 *  navegador. */
function allowedOrigins(): string[] {
  return (process.env.CORS_ORIGIN ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

async function main() {
  const origins = allowedOrigins();
  if (origins.length === 0) {
    app.log.warn(
      "CORS_ORIGIN no está definido: ningún origen de navegador podrá llamar al API. Defínelo en packages/database/.env (ej. http://localhost:3000).",
    );
  }
  // Lista explícita, nunca `origin: true`. Con `true` el API refleja el origen
  // que venga en la petición, es decir, autoriza a cualquier sitio web a llamar
  // al API desde el navegador de un usuario.
  //
  // Qué hace y qué NO hace esto: CORS es una protección del NAVEGADOR. Ante un
  // origen no autorizado, el API simplemente no devuelve la cabecera
  // Access-Control-Allow-Origin y es el navegador el que le niega la respuesta
  // a la página. Un cliente sin navegador (curl, un script) sigue recibiendo el
  // cuerpo: CORS no es control de acceso. Eso es trabajo de requireAuth.
  await app.register(cors, { origin: origins });
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
  // Segundo punto de IA: lee los campos de un otrosí y los propone. Tampoco
  // escribe: ningún ContractEvent se crea desde aquí.
  await app.register(extractionRoutes);
  // Login. Es la única ruta pública de autenticación: no hay registro.
  await app.register(authRoutes);
  // Segunda mitad del flujo de IA: convierte una propuesta en dato. ÚNICA ruta
  // del proyecto que exige autenticación hoy — sin identidad no hay
  // `validatedById` que valga.
  await app.register(confirmationRoutes);

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
