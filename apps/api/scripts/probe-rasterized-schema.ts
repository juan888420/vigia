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
// EL CONTROL LIMPIO — NO ES CÓDIGO DE PRODUCCIÓN.
//
// probe-scanned-schema.ts probó el esquema estricto contra el Otrosí 2
// escaneado y el modelo dejó `daysDelta` en null. Pero ese null es el FÁCIL:
// el Otrosí 2 es una adición que no toca el plazo, así que null es
// sencillamente la respuesta correcta, no una abstención bajo presión.
//
// La pregunta de verdad es otra: cuando el documento SÍ habla del plazo pero se
// contradice —el caso del Otrosí 1, donde el encabezado dice 27-nov y la
// cláusula SEGUNDA dice 05-nov—, ¿el modelo sigue absteniéndose al leerlo como
// IMAGEN, o la imagen le quita la seguridad necesaria para plantarse y acaba
// eligiendo uno de los dos?
//
// Por qué se RASTERIZA en vez de mandar el PDF: el Otrosí 1 tiene capa de
// texto, y la API, al recibir un PDF nativo, manda la imagen Y el texto
// extraído. Eso contamina el experimento —el modelo tendría el texto delante y
// estaríamos midiendo la vía actual con pasos extra—. Convertir cada página a
// PNG destruye la capa de texto y deja al modelo exactamente en la situación
// de un escaneo real, con la ventaja de que conocemos la respuesta correcta:
// la vía de texto sobre este mismo archivo se abstuvo 3 de 3 veces.
//
//   npx tsx --env-file=packages/database/.env \
//     apps/api/scripts/probe-rasterized-schema.ts <archivo.pdf> <nº contrato> [repeticiones]
// ─────────────────────────────────────────────────────────────────────────────

const PRICING: Record<string, { input: number; output: number }> = {
  "claude-sonnet-5": { input: 2.0, output: 10.0 },
  "claude-opus-5": { input: 5.0, output: 25.0 },
};

/** 2× es el punto donde el texto de un acta se lee sin que el PNG se dispare.
 *  Por debajo se pierden los decimales; por encima solo crece la factura. */
const SCALE = 2;

async function rasterize(buffer: Buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const shot = (await parser.getScreenshot({ scale: SCALE })) as {
      total: number;
      pages: { data: Buffer; width: number; height: number; pageNumber: number }[];
    };
    const text = (await parser.getText({ pageJoiner: "" })).text.trim();
    return { pages: shot.pages, total: shot.total, originalTextChars: text.length };
  } finally {
    await parser.destroy();
  }
}

function userContent(contractNumber: string, pages: { data: Buffer }[]) {
  return [
    ...pages.map((p) => ({
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type: "image/png" as const,
        data: Buffer.from(p.data).toString("base64"),
      },
    })),
    {
      type: "text" as const,
      text: [
        `El documento pertenece al expediente del contrato ${contractNumber}.`,
        "",
        "El documento se te entrega como imágenes escaneadas de sus páginas, no como texto.",
        "",
        "Extrae los campos del otrosí.",
      ].join("\n"),
    },
  ];
}

async function main() {
  const [path, contractNumber, repeatsRaw] = process.argv.slice(2);
  if (!path || !contractNumber) {
    throw new Error("Uso: probe-rasterized-schema.ts <archivo.pdf> <nº contrato> [repeticiones]");
  }
  const repeats = Number(repeatsRaw ?? 3);
  const model = getModel();
  const buffer = readFileSync(path);

  const { pages, total, originalTextChars } = await rasterize(buffer);
  const pngBytes = pages.reduce((s, p) => s + p.data.length, 0);

  console.log("═".repeat(78));
  console.log(`${basename(path)}  ·  contrato ${contractNumber}  ·  RASTERIZADO`);
  console.log("═".repeat(78));
  console.log(
    `${total} páginas · el original tenía ${originalTextChars} caracteres de texto, ` +
      `los PNG tienen 0 (capa de texto destruida a propósito)`,
  );
  console.log(`PNG a escala ${SCALE}×: ${(pngBytes / 1024 / 1024).toFixed(2)} MB en total`);
  console.log(`modelo ${model} · effort "${EFFORT}" · esquema importado de routes/extraction.ts`);

  const content = userContent(contractNumber, pages);
  const counted = await getAnthropicClient().messages.countTokens({
    model,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content }],
  });
  console.log(`tokens de entrada: ${counted.input_tokens.toLocaleString("es-CO")}\n`);

  const results = [];
  for (let i = 1; i <= repeats; i += 1) {
    const started = Date.now();
    const message = await getAnthropicClient().messages.parse({
      model,
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      output_config: { effort: EFFORT, format: jsonSchemaOutputFormat(EXTRACTION_SCHEMA) },
      messages: [{ role: "user", content }],
    });
    const seconds = ((Date.now() - started) / 1000).toFixed(1);

    console.log("─".repeat(78));
    console.log(`CORRIDA ${i}  ·  ${seconds}s  ·  stop_reason: ${message.stop_reason}`);
    console.log("─".repeat(78));

    const rate = PRICING[model];
    const u = message.usage;
    const cost = rate ? (u.input_tokens * rate.input + u.output_tokens * rate.output) / 1e6 : 0;
    console.log(`uso: ${u.input_tokens} in + ${u.output_tokens} out  ·  $${cost.toFixed(4)}`);

    if (message.stop_reason !== "end_turn") {
      console.log(`TERMINÓ POR ${message.stop_reason} — la ruta no devolvería extracción.`);
      results.push(null);
      continue;
    }

    const validation = validateExtraction(message.parsed_output);
    if (!validation.ok) {
      console.log(`RECHAZADO POR validateExtraction: ${validation.reason}`);
      results.push(null);
      continue;
    }

    const e = validation.extraction;
    console.log("ACEPTADO por validateExtraction\n");
    console.log(`  sequenceNumber   ${e.sequenceNumber}   (conf ${e.fieldConfidence.sequenceNumber})`);
    console.log(`  signatureDate    ${e.signatureDate}   (conf ${e.fieldConfidence.signatureDate})`);
    console.log(`  valueDelta       ${e.valueDelta}   (conf ${e.fieldConfidence.valueDelta})`);
    console.log(
      `  daysDelta        ${e.daysDelta}   (conf ${e.fieldConfidence.daysDelta})` +
        (e.daysDelta === null ? "   ← SE ABSTUVO" : "   ← RELLENÓ (¡revisar!)"),
    );
    console.log(`  confidence       ${e.confidence}`);
    console.log(`\n  notes:\n`);
    console.log(
      e.notes === null ? "    (null)" : e.notes.split("\n").map((l) => `    ${l}`).join("\n"),
    );
    console.log();
    results.push({ ...e, cost });
  }

  const ok = results.filter((r): r is NonNullable<typeof r> => r !== null);
  console.log("═".repeat(78));
  console.log("VEREDICTO");
  console.log("═".repeat(78));
  console.log(`corridas válidas: ${ok.length}/${repeats}`);
  console.log(`daysDelta null (abstención): ${ok.filter((r) => r.daysDelta === null).length}/${ok.length}`);
  console.log(`notes no vacío: ${ok.filter((r) => r.notes !== null).length}/${ok.length}`);
  console.log(`valueDelta: ${[...new Set(ok.map((r) => r.valueDelta))].join(" | ")}`);
  console.log(`signatureDate: ${[...new Set(ok.map((r) => r.signatureDate))].join(" | ")}`);
  console.log(`confidence: ${ok.map((r) => r.confidence).join(" | ")}`);
  console.log(`coste: $${ok.reduce((s, r) => s + r.cost, 0).toFixed(4)}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack : e);
  process.exitCode = 1;
});
