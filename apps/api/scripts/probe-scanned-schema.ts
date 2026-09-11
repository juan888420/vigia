import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";
import { PDFParse } from "pdf-parse";
import { getAnthropicClient, getModel } from "../src/lib/anthropic";
import {
  EFFORT,
  EXTRACTION_SCHEMA,
  SYSTEM_PROMPT,
  validateExtraction,
} from "../src/routes/extraction";

// ─────────────────────────────────────────────────────────────────────────────
// PRUEBA DE VIABILIDAD, SEGUNDA PARTE — NO ES CÓDIGO DE PRODUCCIÓN.
//
// La primera prueba (probe-scanned-pdf.ts) mandó el PDF escaneado en modo
// exploratorio, sin esquema. Demostró que el modelo LEE la imagen. Lo que no
// pudo demostrar es lo único que de verdad decide si esto se puede integrar:
//
//   ¿SIGUE ABSTENIÉNDOSE cuando el documento no da para responder?
//
// Sin esquema no hay campos que rellenar, así que no hay ocasión de abstenerse
// y la prueba no dice nada. Con `output_config.format` el modelo TIENE que
// emitir `daysDelta`, y ahí es donde puede aparecer el fallo que importa:
// inventar un número por no dejar el hueco. Un `daysDelta` inventado entra en
// la fecha de terminación vigente del contrato, que es un dato con
// consecuencias jurídicas.
//
// Todo lo que define el contrato —prompt, esquema, effort y el validador— se
// IMPORTA de routes/extraction.ts. No hay copias: si la ruta cambia mañana,
// esta prueba cambia con ella. Lo único distinto es cómo llega el documento:
//
//   /extraer      →  pdf-parse saca el texto  →  se manda TEXTO
//   este script   →  se manda el PDF entero   →  el modelo VE las páginas
//
//   npx tsx --env-file=packages/database/.env \
//     apps/api/scripts/probe-scanned-schema.ts <archivo.pdf> <nº contrato> [repeticiones]
// ─────────────────────────────────────────────────────────────────────────────

const PRICING: Record<string, { input: number; output: number }> = {
  "claude-sonnet-5": { input: 2.0, output: 10.0 },
  "claude-opus-5": { input: 5.0, output: 25.0 },
};

/** El gemelo de `buildUserPrompt` de la ruta, con el bloque <documento>
 *  sustituido por el PDF. Mismo encuadre y misma instrucción final: si el
 *  texto de alrededor cambiara, la comparación dejaría de medir el efecto de
 *  la imagen y pasaría a medir el efecto del prompt. */
function userContent(contractNumber: string, buffer: Buffer) {
  return [
    {
      type: "document" as const,
      source: {
        type: "base64" as const,
        media_type: "application/pdf" as const,
        data: buffer.toString("base64"),
      },
    },
    {
      type: "text" as const,
      text: [
        `El documento pertenece al expediente del contrato ${contractNumber}.`,
        "",
        "El documento se te entrega como PDF escaneado: lo ves como imágenes de página, no como texto.",
        "",
        "Extrae los campos del otrosí.",
      ].join("\n"),
    },
  ];
}

async function pageCount(buffer: Buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const r = await parser.getText({ pageJoiner: "" });
    return { pages: r.total, textChars: r.text.trim().length };
  } finally {
    await parser.destroy();
  }
}

async function run(path: string, contractNumber: string, model: string, round: number) {
  const buffer = readFileSync(path);

  const started = Date.now();
  const message = await getAnthropicClient().messages.parse({
    model,
    // Idénticos a la ruta.
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    output_config: { effort: EFFORT, format: jsonSchemaOutputFormat(EXTRACTION_SCHEMA) },
    messages: [{ role: "user", content: userContent(contractNumber, buffer) }],
  });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);

  console.log(`\n${"─".repeat(78)}`);
  console.log(`CORRIDA ${round}  ·  ${seconds}s  ·  stop_reason: ${message.stop_reason}`);
  console.log("─".repeat(78));

  const rate = PRICING[model];
  const u = message.usage;
  const cost = rate ? (u.input_tokens * rate.input + u.output_tokens * rate.output) / 1e6 : null;
  console.log(
    `uso: ${u.input_tokens.toLocaleString("es-CO")} in + ${u.output_tokens.toLocaleString("es-CO")} out` +
      (cost === null ? "" : `  ·  $${cost.toFixed(4)} USD`),
  );

  if (message.stop_reason === "refusal") {
    console.log("EL MODELO DECLINÓ. La ruta devolvería 422.");
    return null;
  }
  if (message.stop_reason === "max_tokens") {
    console.log("RESPUESTA TRUNCADA. La ruta devolvería 502.");
    return null;
  }

  // El validador REAL de la ruta. Si esto falla, /extraer respondería 502 y la
  // extracción no llegaría nunca al usuario — da igual lo bien que leyera.
  const validation = validateExtraction(message.parsed_output);
  if (!validation.ok) {
    console.log(`RECHAZADO POR validateExtraction: ${validation.reason}`);
    console.log(JSON.stringify(message.parsed_output, null, 2));
    return null;
  }

  const e = validation.extraction;
  console.log("ACEPTADO por validateExtraction (la ruta lo habría devuelto tal cual)\n");
  console.log(`  isAmendment      ${e.isAmendment}`);
  console.log(`  sequenceNumber   ${e.sequenceNumber}   (conf ${e.fieldConfidence.sequenceNumber})`);
  console.log(`  signatureDate    ${e.signatureDate}   (conf ${e.fieldConfidence.signatureDate})`);
  console.log(`  valueDelta       ${e.valueDelta}   (conf ${e.fieldConfidence.valueDelta})`);
  console.log(
    `  daysDelta        ${e.daysDelta}   (conf ${e.fieldConfidence.daysDelta})` +
      (e.daysDelta === null ? "   ← SE ABSTUVO" : "   ← RELLENÓ EL CAMPO"),
  );
  console.log(`  confidence       ${e.confidence}`);
  console.log(`\n  notes (literal):\n`);
  console.log(e.notes === null ? "    (null)" : e.notes.split("\n").map((l) => `    ${l}`).join("\n"));

  return { ...e, cost, inputTokens: u.input_tokens, outputTokens: u.output_tokens };
}

async function main() {
  const [path, contractNumber, repeatsRaw] = process.argv.slice(2);
  if (!path || !contractNumber) {
    throw new Error(
      "Uso: probe-scanned-schema.ts <archivo.pdf> <número de contrato> [repeticiones]",
    );
  }
  const repeats = Number(repeatsRaw ?? 3);
  const model = getModel();
  const buffer = readFileSync(path);
  const facts = await pageCount(buffer);

  console.log("═".repeat(78));
  console.log(`${basename(path)}  ·  contrato ${contractNumber}`);
  console.log("═".repeat(78));
  console.log(
    `${facts.pages} páginas · capa de texto: ${facts.textChars} caracteres` +
      (facts.textChars < 50 ? "  (ESCANEADO — /extraer hoy devuelve 422)" : ""),
  );
  console.log(`modelo ${model} · effort "${EFFORT}" · esquema estricto importado de routes/extraction.ts`);
  console.log(`${repeats} corridas: una sola no distingue disciplina de suerte.`);

  const results = [];
  for (let i = 1; i <= repeats; i += 1) {
    results.push(await run(path, contractNumber, model, i));
  }

  console.log(`\n${"═".repeat(78)}`);
  console.log("ESTABILIDAD ENTRE CORRIDAS");
  console.log("═".repeat(78));
  const ok = results.filter((r): r is NonNullable<typeof r> => r !== null);
  console.log(`corridas válidas: ${ok.length}/${repeats}`);
  const abstained = ok.filter((r) => r.daysDelta === null).length;
  console.log(`daysDelta null (abstención): ${abstained}/${ok.length}`);
  console.log(`valueDelta distintos: ${[...new Set(ok.map((r) => r.valueDelta))].join(" | ")}`);
  console.log(`signatureDate distintos: ${[...new Set(ok.map((r) => r.signatureDate))].join(" | ")}`);
  console.log(`sequenceNumber distintos: ${[...new Set(ok.map((r) => r.sequenceNumber))].join(" | ")}`);
  console.log(`confidence: ${ok.map((r) => r.confidence).join(" | ")}`);
  const totalCost = ok.reduce((s, r) => s + (r.cost ?? 0), 0);
  console.log(`coste total de la prueba: $${totalCost.toFixed(4)} USD`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack : e);
  process.exitCode = 1;
});
