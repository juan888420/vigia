import type { FastifyInstance } from "fastify";
import Anthropic from "@anthropic-ai/sdk";
import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";
import { prisma } from "../lib/prisma";
import { getAnthropicClient, isAnthropicConfigured } from "../lib/anthropic";
import { intakePdf } from "../lib/pdf-intake";

// ─────────────────────────────────────────────────────────────────────────────
// Clasificación documental con IA — el ÚNICO punto de IA del sistema.
//
// Este endpoint PROPONE. No guarda nada: ni ContractDocument, ni nada en
// Postgres. Es la primera mitad del flujo obligatorio del README
// (`IA propone → usuario valida → sistema guarda`); la segunda mitad es el
// POST /contratos/:id/documentos que ya existe y que esta ruta no reemplaza.
//
// Lo que la IA decide aquí: a cuál de los tipos del catálogo se parece este
// PDF. Nada más. No extrae campos, no interpreta el contrato, no toca el motor
// de reglas y no puede crear tipos nuevos: el `documentTypeId` que devuelve se
// coteja contra los ids que se le pasaron, y si no coincide se trata como
// respuesta inválida.
// ─────────────────────────────────────────────────────────────────────────────

/** El modelo por defecto de Anthropic hoy. Constante para que cambiarlo sea
 *  una línea y quede en el diff. */
const MODEL = "claude-opus-5";

const SYSTEM_PROMPT = [
  "Eres un clasificador de documentos de expedientes de contratación pública colombiana.",
  "Tu única tarea es decidir a cuál de los tipos documentales del catálogo corresponde el documento que se te entrega.",
  "",
  "Reglas estrictas:",
  "- Elige EXACTAMENTE UN tipo del catálogo. No puedes crear tipos nuevos ni combinar varios.",
  "- Devuelve en `documentTypeId` el id EXACTO que aparece en el catálogo, copiado tal cual. No lo derives del código ni del nombre, no lo abrevies, no lo inventes.",
  "- No extraigas datos del documento (valores, fechas, números de contrato). No es tu tarea.",
  "- No afirmes consecuencias jurídicas ni evalúes si el expediente está completo.",
  "- No inventes información que no aparezca en el texto.",
  "- `reasoning` debe ser UNA sola frase corta, en español, citando la evidencia concreta del texto que sustenta la elección.",
  "- `confidence` es tu certeza real entre 0 y 1. Si el texto es ambiguo, baja la confianza en vez de forzar una respuesta segura.",
].join("\n");

/** Esquema de la respuesta. Structured outputs no admite `minimum`/`maximum`,
 *  así que el rango de `confidence` se valida abajo, en código. */
const CLASSIFICATION_SCHEMA = {
  type: "object",
  properties: {
    documentTypeId: {
      type: "string",
      description: "El id exacto de uno de los tipos del catálogo entregado.",
    },
    confidence: {
      type: "number",
      description: "Certeza de la clasificación, entre 0 y 1.",
    },
    reasoning: {
      type: "string",
      description: "Una sola frase corta con la evidencia encontrada en el documento.",
    },
  },
  required: ["documentTypeId", "confidence", "reasoning"],
  additionalProperties: false,
} as const;

interface ClassificationProposal {
  documentTypeId: string;
  confidence: number;
  reasoning: string;
}

type CatalogEntry = { id: string; code: string; name: string };

/** El catálogo va COMPLETO: todos los tipos, sin filtrar por lo que la
 *  modalidad del contrato exige. Filtrar sesgaría al modelo hacia lo que falta
 *  en el checklist y le impediría reconocer un documento que este contrato no
 *  exigía pero que existe igual. */
function renderCatalog(catalog: CatalogEntry[]): string {
  return catalog.map((type) => `${type.id} | ${type.code} | ${type.name}`).join("\n");
}

function buildUserPrompt(catalog: CatalogEntry[], text: string): string {
  return [
    "CATÁLOGO DE TIPOS DOCUMENTALES (id | code | nombre):",
    renderCatalog(catalog),
    "",
    "TEXTO EXTRAÍDO DEL DOCUMENTO:",
    "<documento>",
    text,
    "</documento>",
    "",
    "Clasifica el documento en uno de los tipos del catálogo.",
  ].join("\n");
}

/** La respuesta del modelo no se cree: se comprueba. `documentTypeId` tiene
 *  que ser uno de los ids que se le entregaron —no uno parecido—, y los otros
 *  dos campos tienen que tener forma utilizable. Cualquier fallo aquí es un
 *  error del endpoint, NO una clasificación de baja confianza: convertir una
 *  respuesta inválida en un resultado válido es exactamente lo que el flujo
 *  `IA propone → usuario valida` existe para impedir. */
function validateProposal(
  value: unknown,
  catalogIds: Set<string>,
): { ok: true; proposal: ClassificationProposal } | { ok: false; reason: string } {
  if (typeof value !== "object" || value === null) {
    return { ok: false, reason: "la respuesta no es un objeto" };
  }

  const candidate = value as Partial<ClassificationProposal>;

  if (typeof candidate.documentTypeId !== "string" || !catalogIds.has(candidate.documentTypeId)) {
    return { ok: false, reason: "el documentTypeId no corresponde a ningún tipo del catálogo" };
  }
  if (
    typeof candidate.confidence !== "number" ||
    !Number.isFinite(candidate.confidence) ||
    candidate.confidence < 0 ||
    candidate.confidence > 1
  ) {
    return { ok: false, reason: "la confianza no es un número entre 0 y 1" };
  }
  if (typeof candidate.reasoning !== "string" || candidate.reasoning.trim().length === 0) {
    return { ok: false, reason: "falta la justificación" };
  }

  return {
    ok: true,
    proposal: {
      documentTypeId: candidate.documentTypeId,
      confidence: candidate.confidence,
      reasoning: candidate.reasoning.trim(),
    },
  };
}

export async function classificationRoutes(app: FastifyInstance) {
  app.post<{ Params: { contractId: string } }>(
    "/contratos/:contractId/documentos/clasificar",
    async (request, reply) => {
      if (!isAnthropicConfigured()) {
        return reply.status(503).send({
          error:
            "La clasificación con IA no está configurada: falta ANTHROPIC_API_KEY en el entorno del API",
        });
      }

      const contract = await prisma.contract.findUnique({
        where: { id: request.params.contractId },
        select: { id: true, number: true },
      });
      if (!contract) {
        return reply.status(404).send({ error: "Contrato no encontrado" });
      }

      // ── El archivo y su texto ────────────────────────────────────────────
      // Mismo tramo que /extraer, en lib/pdf-intake: validación del multipart,
      // firma %PDF-, extracción y umbral de texto mínimo.
      const received = await intakePdf(request);
      if (!received.ok) {
        return reply.status(received.failure.status).send(received.failure.body);
      }
      const { file, extraction, text } = received.intake;

      // ── El catálogo ──────────────────────────────────────────────────────
      const catalog = await prisma.documentType.findMany({
        select: { id: true, code: true, name: true, stage: true, fileLabel: true },
        orderBy: { code: "asc" },
      });
      if (catalog.length === 0) {
        return reply
          .status(503)
          .send({ error: "No hay tipos documentales en el catálogo contra los cuales clasificar" });
      }

      // ── La clasificación ─────────────────────────────────────────────────
      let parsedOutput: unknown;
      try {
        const message = await getAnthropicClient().messages.parse({
          model: MODEL,
          // Holgado para una respuesta de tres campos porque en Opus 5 el
          // razonamiento adaptativo también consume output_tokens.
          max_tokens: 4096,
          system: SYSTEM_PROMPT,
          output_config: {
            // Tarea de clasificación, no de razonamiento profundo.
            effort: "low",
            format: jsonSchemaOutputFormat(CLASSIFICATION_SCHEMA),
          },
          messages: [{ role: "user", content: buildUserPrompt(catalog, text) }],
        });

        // Una negativa del modelo NO es una clasificación. Se comprueba antes
        // de mirar el contenido.
        if (message.stop_reason === "refusal") {
          return reply.status(422).send({
            error: "El modelo declinó clasificar este documento por sus políticas de uso",
          });
        }
        if (message.stop_reason === "max_tokens") {
          return reply
            .status(502)
            .send({ error: "La respuesta del modelo quedó incompleta; vuelve a intentarlo" });
        }

        parsedOutput = message.parsed_output;
      } catch (error) {
        if (error instanceof Anthropic.AuthenticationError) {
          return reply.status(503).send({ error: "La clave de la API de Claude no es válida" });
        }
        if (error instanceof Anthropic.RateLimitError) {
          return reply.status(503).send({
            error: "La API de Claude está limitando las peticiones; reintenta en un momento",
          });
        }
        if (error instanceof Anthropic.APIError) {
          request.log.error({ err: error }, "fallo llamando a la API de Claude");
          return reply.status(502).send({ error: "La API de Claude devolvió un error" });
        }
        throw error;
      }

      const catalogIds = new Set(catalog.map((type) => type.id));
      const validation = validateProposal(parsedOutput, catalogIds);
      if (!validation.ok) {
        // 502 y no 200 con baja confianza: el sistema no puede presentarle al
        // usuario como propuesta algo que no logró clasificar.
        request.log.warn(
          { parsedOutput, reason: validation.reason },
          "respuesta de clasificación inválida",
        );
        return reply.status(502).send({
          error: `El modelo no devolvió una clasificación utilizable: ${validation.reason}`,
        });
      }

      const documentType = catalog.find((type) => type.id === validation.proposal.documentTypeId)!;

      return {
        contractId: contract.id,
        file,
        extraction,
        proposal: {
          documentTypeId: validation.proposal.documentTypeId,
          documentType,
          confidence: validation.proposal.confidence,
          reasoning: validation.proposal.reasoning,
        },
        model: MODEL,
        // Explícito en la respuesta, no solo en la documentación: quien consuma
        // este endpoint tiene que saber que todavía no hay nada guardado y que
        // el documento solo existe cuando el usuario confirma contra
        // POST /contratos/:id/documentos.
        persisted: false,
      };
    },
  );
}
