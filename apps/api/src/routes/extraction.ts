import type { FastifyInstance } from "fastify";
import Anthropic from "@anthropic-ai/sdk";
import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";
import { prisma } from "../lib/prisma";
import { getAnthropicClient, getModel, isAnthropicConfigured } from "../lib/anthropic";
import { requireAuth } from "../lib/auth";
import { buildUserContent, intakePdf, sourceNotice, type PdfIntake } from "../lib/pdf-intake";

// ─────────────────────────────────────────────────────────────────────────────
// Extracción de campos con IA — segundo punto de IA del sistema, y por ahora
// el último previsto.
//
// SOLO OTROSÍ. Este endpoint lee un acta de modificación contractual y propone
// los campos que un ContractEvent necesita. No sabe leer pólizas, ni actas de
// pago, ni nada más: cada tipo documental tiene campos distintos y meterlos
// todos en un prompt genérico degrada los cuatro. Cuando haya un segundo tipo,
// será otro esquema y otra ruta, no un `if` aquí dentro.
//
// Igual que /clasificar: PROPONE y no guarda nada (`persisted: false`). Ningún
// ContractEvent se crea desde aquí. El flujo del README —IA propone → humano
// valida → sistema guarda— no está a medias: esta ruta es la primera mitad.
//
// Lo que la IA NO hace aquí, deliberadamente:
//   · No elige el `type` del evento (AMENDMENT / ADDITION / EXTENSION). Un
//     otrosí que toca valor Y plazo cae en los tres según cómo se mire; eso es
//     criterio de la oficina, no lectura del documento.
//   · No resuelve contradicciones del documento. Las SEÑALA en `notes` y deja
//     el campo en null si no puede leerlo sin elegir por su cuenta. Un
//     expediente real trae un otrosí cuyo encabezado y cuerpo dan fechas
//     distintas: la respuesta correcta es avisar, no desempatar en silencio.
//   · No calcula nada derivado (valor vigente, fecha de terminación). Eso es
//     del motor de reglas, con los datos ya validados por una persona.
// ─────────────────────────────────────────────────────────────────────────────

/** Más alto que en /clasificar (que usa "low"): aquí hay que leer cifras, casar
 *  fechas y detectar que dos partes del documento se contradicen. Es la parte
 *  del sistema donde un error se convierte en plata mal registrada. */
export const EFFORT = "high";

// ─────────────────────────────────────────────────────────────────────────────
// Por qué `EFFORT`, `SYSTEM_PROMPT`, `EXTRACTION_SCHEMA` y `validateExtraction`
// están exportados aunque nada dentro de `src/` los importe:
//
// Los usa apps/api/scripts/probe-scanned-schema.ts, la prueba que comprueba si
// el mismo contrato estricto se sostiene cuando el documento llega como imagen
// en vez de como texto. Copiarlos al script los habría dejado divergir del día
// siguiente, y entonces la prueba ya no diría nada sobre ESTA ruta.
//
// No los borres por "no tener consumidores": el consumidor está fuera del
// directorio que compila el tsconfig.
// ─────────────────────────────────────────────────────────────────────────────

export const SYSTEM_PROMPT = [
  "Eres un asistente que lee otrosíes (actas de modificación) de contratos estatales colombianos y extrae sus campos.",
  "",
  "Reglas estrictas:",
  "- Extrae ÚNICAMENTE lo que el documento dice. Si un campo no aparece, déjalo en null. Nunca lo deduzcas, lo estimes ni lo completes con lo que suele pasar en este tipo de documentos.",
  "- Si el documento NO es un otrosí ni un acta de modificación contractual, pon `isAmendment` en false, deja TODOS los campos en null y explica en `notes` qué parece ser. No fuerces una extracción.",
  "",
  "Sobre `valueDelta` (efecto en el VALOR del contrato):",
  "- Es el CAMBIO, no el valor total del contrato. Si el documento dice que el contrato queda en $X, eso NO es valueDelta.",
  "- Puede ser NEGATIVO. Un otrosí no siempre adiciona: también corrige errores de digitación, reduce el valor o libera saldos. No asumas que es una adición.",
  "- Formato: cadena de dígitos con punto decimal opcional y hasta dos decimales, con signo menos si disminuye. Sin separadores de miles, sin símbolo de moneda. Ejemplos: \"-91478\", \"15000000.50\".",
  "- Si el documento no expresa un cambio de valor, es null. Si expresa uno pero es ambiguo, déjalo en null y explícalo en `notes`.",
  "",
  "Sobre `daysDelta` (efecto en el PLAZO, en días):",
  "- Es el CAMBIO en días, no el plazo total. Positivo si prorroga, negativo si reduce.",
  "- Si el documento da la prórroga en meses o en un rango de fechas y no en días, conviértelo solo si el documento da los datos exactos para hacerlo, y di en `notes` cómo lo calculaste. Si no, déjalo en null.",
  "",
  "Sobre `signatureDate`: la fecha en que se firma o suscribe el acta, en formato YYYY-MM-DD. No es la fecha de inicio del contrato ni la fecha hasta la que se prorroga.",
  "",
  "Sobre `notes` — es el campo más importante de tu respuesta:",
  "- Revisa el documento COMPLETO, no solo las partes de donde salen los cuatro campos que extraes. Una inconsistencia en una cláusula que no afecta a ninguno de esos campos sigue siendo relevante y va aquí.",
  "- Señala CUALQUIER inconsistencia FACTUAL entre dos partes del documento, o entre el documento y su propio encabezado. En particular:",
  "  · Fechas que no concuerdan entre el encabezado, el cuerpo y las cláusulas.",
  "  · Valores o cifras que aparecen distintos en dos sitios, o en números y en letras, o que no cuadran con la suma de sus componentes.",
  "  · Nombres de las partes, cédulas, NIT o cargos que cambian a lo largo del documento o están mal escritos.",
  "  · Números de referencia que no coinciden: número de contrato, de otrosí, de CDP, de RP, de póliza, de acta.",
  "  · Plazos y términos que aparecen con duraciones distintas en cláusulas distintas (por ejemplo, un plazo de días hábiles para cumplir una obligación que se enuncia con un número en una cláusula y con otro número en otra parte del documento).",
  "  · Porcentajes que no corresponden a los valores sobre los que se calculan.",
  "  · Referencias a documentos, anexos o cláusulas que no están en el documento que se te entregó.",
  "- Cada inconsistencia va con la CITA TEXTUAL de las dos partes que no cuadran, entre comillas, tal como aparecen. Sin la cita, quien revisa no puede verificarla.",
  "- NO resuelvas la contradicción. No elijas cuál de los dos datos es el correcto ni digas cuál es 'probablemente' el bueno. Descríbela tal como aparece y deja que una persona decida.",
  "- NO evalúes consecuencias jurídicas ni digas qué implica una inconsistencia: ni que invalida algo, ni que incumple una norma, ni que genera un riesgo, ni que hay que corregirla. Tu trabajo termina en señalar que existe y citarla.",
  "- Si el campo afectado por la contradicción no se puede leer sin elegir, déjalo en null y dilo aquí.",
  "- Si no encontraste ninguna inconsistencia, deja `notes` en null. No lo rellenes con un resumen del documento, ni con observaciones sobre lo que el documento sí dice de forma coherente.",
  "",
  "Sobre las confianzas: `confidence` es tu certeza global en la extracción y `fieldConfidence` la de cada campo, entre 0 y 1. Un campo en null lleva confianza null. Si algo es ambiguo, baja la confianza en vez de forzar una respuesta segura.",
].join("\n");

/** Un número entre 0 y 1, o null. El rango se valida abajo en código: structured
 *  outputs no admite `minimum`/`maximum`. */
const NULLABLE_CONFIDENCE = {
  anyOf: [{ type: "number" }, { type: "null" }],
} as const;

/** Los campos opcionales van con `anyOf: [tipo, null]` y NO omitiéndolos de
 *  `required`: structured outputs exige que todo esté en `required`, así que
 *  "ausente" se expresa como null explícito. Que el modelo tenga que escribir
 *  null a propósito es además lo que queremos — obliga a una decisión, no a un
 *  olvido. */
export const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    isAmendment: {
      type: "boolean",
      description: "true solo si el documento es un otrosí o acta de modificación contractual.",
    },
    sequenceNumber: {
      anyOf: [{ type: "integer" }, { type: "null" }],
      description: "Número del otrosí (1 para 'Otrosí No. 1'). Null si no está numerado.",
    },
    signatureDate: {
      anyOf: [{ type: "string", format: "date" }, { type: "null" }],
      description: "Fecha de firma del acta, YYYY-MM-DD.",
    },
    valueDelta: {
      // Cadena, no número: es dinero. Un JSON number pasa por un float de
      // doble precisión antes de llegar a Prisma, y el destino es un
      // Decimal(15,2) de Postgres. Mantenerlo como texto conserva exactamente
      // lo que el modelo leyó y permite validar el formato con una regex antes
      // de que nadie lo convierta.
      anyOf: [{ type: "string" }, { type: "null" }],
      description:
        "Cambio en el valor del contrato, con signo. Sin separadores de miles ni moneda. Null si el documento no cambia el valor.",
    },
    daysDelta: {
      anyOf: [{ type: "integer" }, { type: "null" }],
      description: "Cambio en el plazo en días, con signo. Null si el documento no cambia el plazo.",
    },
    notes: {
      anyOf: [{ type: "string" }, { type: "null" }],
      description:
        "Ambigüedades y contradicciones encontradas, sin resolverlas. Null si no hay ninguna.",
    },
    confidence: { type: "number", description: "Certeza global de la extracción, entre 0 y 1." },
    fieldConfidence: {
      type: "object",
      properties: {
        sequenceNumber: NULLABLE_CONFIDENCE,
        signatureDate: NULLABLE_CONFIDENCE,
        valueDelta: NULLABLE_CONFIDENCE,
        daysDelta: NULLABLE_CONFIDENCE,
      },
      required: ["sequenceNumber", "signatureDate", "valueDelta", "daysDelta"],
      additionalProperties: false,
    },
  },
  required: [
    "isAmendment",
    "sequenceNumber",
    "signatureDate",
    "valueDelta",
    "daysDelta",
    "notes",
    "confidence",
    "fieldConfidence",
  ],
  additionalProperties: false,
} as const;

const AMOUNT_PATTERN = /^-?\d{1,13}(\.\d{1,2})?$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type FieldName = "sequenceNumber" | "signatureDate" | "valueDelta" | "daysDelta";

export interface AmendmentExtraction {
  isAmendment: boolean;
  sequenceNumber: number | null;
  signatureDate: string | null;
  valueDelta: string | null;
  daysDelta: number | null;
  notes: string | null;
  confidence: number;
  fieldConfidence: Record<FieldName, number | null>;
}

function isConfidence(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

/** Una fecha con forma correcta puede seguir sin existir ("2025-02-30"). El
 *  round-trip por Date descarta esas. */
function isRealDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Mismo encuadre en las dos vías: solo cambia si el documento llega inline
 *  como texto o en su propio bloque. La instrucción final es idéntica a
 *  propósito — es la que se validó en las pruebas de abstención, y cambiarla
 *  invalidaría lo que sabemos del comportamiento del modelo. */
function buildUserPrompt(contractNumber: string, intake: PdfIntake): string {
  const lines = [`El documento pertenece al expediente del contrato ${contractNumber}.`, ""];

  if (intake.source === "TEXT_LAYER") {
    lines.push("TEXTO EXTRAÍDO DEL DOCUMENTO:", "<documento>", intake.text, "</documento>", "");
  } else {
    lines.push(sourceNotice(intake), "");
  }

  lines.push("Extrae los campos del otrosí.");
  return lines.join("\n");
}

/** La respuesta del modelo no se cree: se comprueba. Cualquier fallo aquí es un
 *  error del endpoint, NO una extracción de baja confianza: convertir una
 *  respuesta malformada en una propuesta válida es justo lo que el flujo
 *  `IA propone → humano valida` existe para impedir. */
export function validateExtraction(
  value: unknown,
): { ok: true; extraction: AmendmentExtraction } | { ok: false; reason: string } {
  if (typeof value !== "object" || value === null) {
    return { ok: false, reason: "la respuesta no es un objeto" };
  }
  const candidate = value as Record<string, unknown>;

  if (typeof candidate.isAmendment !== "boolean") {
    return { ok: false, reason: "falta isAmendment" };
  }
  if (!isConfidence(candidate.confidence)) {
    return { ok: false, reason: "la confianza global no es un número entre 0 y 1" };
  }
  if (
    candidate.sequenceNumber !== null &&
    (!Number.isInteger(candidate.sequenceNumber) || (candidate.sequenceNumber as number) < 1)
  ) {
    return { ok: false, reason: "sequenceNumber no es un entero positivo ni null" };
  }
  if (
    candidate.signatureDate !== null &&
    (typeof candidate.signatureDate !== "string" || !isRealDate(candidate.signatureDate))
  ) {
    return { ok: false, reason: "signatureDate no es una fecha YYYY-MM-DD válida ni null" };
  }
  if (
    candidate.valueDelta !== null &&
    (typeof candidate.valueDelta !== "string" || !AMOUNT_PATTERN.test(candidate.valueDelta))
  ) {
    // Un importe con separadores de miles, con "$" o en notación científica se
    // rechaza en vez de normalizarse: adivinar qué quiso decir el modelo con
    // una cifra mal formada es exactamente donde se pierde dinero.
    return { ok: false, reason: "valueDelta no es un importe con formato válido ni null" };
  }
  if (candidate.daysDelta !== null && !Number.isInteger(candidate.daysDelta)) {
    return { ok: false, reason: "daysDelta no es un entero ni null" };
  }
  if (
    candidate.notes !== null &&
    (typeof candidate.notes !== "string" || candidate.notes.trim().length === 0)
  ) {
    return { ok: false, reason: "notes no es texto ni null" };
  }

  const rawFieldConfidence = candidate.fieldConfidence;
  if (typeof rawFieldConfidence !== "object" || rawFieldConfidence === null) {
    return { ok: false, reason: "falta fieldConfidence" };
  }
  const fields: FieldName[] = ["sequenceNumber", "signatureDate", "valueDelta", "daysDelta"];
  const fieldConfidence = {} as Record<FieldName, number | null>;
  for (const field of fields) {
    const entry = (rawFieldConfidence as Record<string, unknown>)[field];
    if (entry !== null && !isConfidence(entry)) {
      return { ok: false, reason: `la confianza de ${field} no es un número entre 0 y 1 ni null` };
    }
    fieldConfidence[field] = entry as number | null;
  }

  return {
    ok: true,
    extraction: {
      isAmendment: candidate.isAmendment,
      sequenceNumber: candidate.sequenceNumber as number | null,
      signatureDate: candidate.signatureDate as string | null,
      valueDelta: candidate.valueDelta as string | null,
      daysDelta: candidate.daysDelta as number | null,
      notes: typeof candidate.notes === "string" ? candidate.notes.trim() : null,
      confidence: candidate.confidence,
      fieldConfidence,
    },
  };
}

export async function extractionRoutes(app: FastifyInstance) {
  app.post<{ Params: { contractId: string } }>(
    "/contratos/:contractId/documentos/extraer",
    // Misma razón que en /clasificar, y aquí pesa más: esta ruta corre con
    // `effort: "high"`, que es la llamada más cara del proyecto. `preHandler`
    // garantiza que el 401 llegue antes del intake del PDF y antes del modelo.
    { preHandler: requireAuth },
    async (request, reply) => {
      if (!isAnthropicConfigured()) {
        return reply.status(503).send({
          error:
            "La extracción con IA no está configurada: falta ANTHROPIC_API_KEY en el entorno del API",
        });
      }

      const contract = await prisma.contract.findUnique({
        where: { id: request.params.contractId },
        select: { id: true, number: true },
      });
      if (!contract) {
        return reply.status(404).send({ error: "Contrato no encontrado" });
      }

      const received = await intakePdf(request);
      if (!received.ok) {
        return reply.status(received.failure.status).send(received.failure.body);
      }
      const { file, extraction } = received.intake;

      // Igual que en /clasificar: se resuelve una vez para que el `model` que
      // se devuelve sea el que realmente leyó el documento.
      const model = getModel();

      let parsedOutput: unknown;
      try {
        const message = await getAnthropicClient().messages.parse({
          model,
          // Holgado: con effort alto el razonamiento adaptativo también consume
          // output_tokens, y quedarse corto trunca la respuesta a media extracción.
          max_tokens: 8192,
          system: SYSTEM_PROMPT,
          output_config: {
            effort: EFFORT,
            format: jsonSchemaOutputFormat(EXTRACTION_SCHEMA),
          },
          messages: [
            {
              role: "user",
              content: buildUserContent(
                received.intake,
                buildUserPrompt(contract.number, received.intake),
              ),
            },
          ],
        });

        if (message.stop_reason === "refusal") {
          return reply.status(422).send({
            error: "El modelo declinó leer este documento por sus políticas de uso",
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

      const validation = validateExtraction(parsedOutput);
      if (!validation.ok) {
        request.log.warn(
          { parsedOutput, reason: validation.reason },
          "respuesta de extracción inválida",
        );
        return reply.status(502).send({
          error: `El modelo no devolvió una extracción utilizable: ${validation.reason}`,
        });
      }

      const { isAmendment, notes, confidence, fieldConfidence, ...fields } = validation.extraction;

      return {
        contractId: contract.id,
        documentType: "OTROSI",
        file,
        extraction,
        // 200 y no un error: que el documento no sea un otrosí es una respuesta
        // legítima del modelo —la alternativa era que inventara los campos— y
        // quien llama necesita poder distinguirla de un fallo del endpoint.
        looksLikeAmendment: isAmendment,
        proposal: {
          // Nombres iguales a los del modelo ContractEvent, para que la
          // validación posterior sea un mapeo directo y no una traducción.
          // `type` NO va aquí: elegir entre AMENDMENT, ADDITION y EXTENSION es
          // criterio de la oficina, no lectura del documento.
          ...fields,
          notes,
          confidence,
          fieldConfidence,
        },
        model,
        effort: EFFORT,
        persisted: false,
      };
    },
  );
}
