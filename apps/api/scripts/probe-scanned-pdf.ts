import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { PDFParse } from "pdf-parse";
import { getAnthropicClient, getModel } from "../src/lib/anthropic";
import { prisma } from "../src/lib/prisma";

// ─────────────────────────────────────────────────────────────────────────────
// PRUEBA DE VIABILIDAD — NO ES CÓDIGO DE PRODUCCIÓN.
//
// Manda el PDF ENTERO a Claude como documento nativo (base64), sin pasar por
// pdf-intake ni por extracción de texto. El modelo ve las páginas renderizadas,
// así que puede leer un escaneo — que es justo lo que el flujo actual rechaza
// con 422.
//
// En qué se diferencia de lo que ya existe:
//   /clasificar y /extraer  →  pdf-parse saca el texto → se manda TEXTO
//   este script             →  se manda el PDF → el modelo VE las páginas
//
// Vive en apps/api/scripts/ y no en src/ a propósito: el tsconfig del API
// compila solo `src`, así que esto no entra en el build ni puede acabar
// importado por una ruta sin que alguien lo mueva a mano.
//
// No escribe NADA en la base: solo lee el catálogo de tipos documentales para
// dárselo al modelo, igual que hace /clasificar.
//
//   npx tsx --env-file=packages/database/.env \
//     apps/api/scripts/probe-scanned-pdf.ts <archivo.pdf> [...]
// ─────────────────────────────────────────────────────────────────────────────

/** Tarifas de Claude Sonnet 5, USD por millón de tokens. Están aquí y no
 *  calculadas por el SDK porque la API no devuelve importes, solo tokens. Si
 *  se cambia el modelo hay que cambiarlas: un coste calculado con la tarifa de
 *  otro modelo es peor que no calcularlo. */
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-sonnet-5": { input: 2.0, output: 10.0 },
  "claude-opus-5": { input: 5.0, output: 25.0 },
};

/** Sin `output_config.format`: la gracia de esta prueba es ver qué lee el
 *  modelo y qué dice que NO puede leer. Un esquema estricto lo obligaría a
 *  rellenar campos y escondería justo la señal que buscamos — dónde la imagen
 *  no da para más. */
const SYSTEM_PROMPT = [
  "Eres un asistente que lee documentos escaneados de expedientes de contratación pública colombiana.",
  "Recibes el PDF completo como imágenes de página, no como texto: puede haber ruido de escaneo, perforaciones, sellos, firmas manuscritas e inclinación.",
  "",
  "Haz DOS cosas, en este orden:",
  "",
  "1. CLASIFICACIÓN. Elige exactamente un tipo del catálogo que se te entrega. Di el `code` y el `name`, y tu certeza de 0 a 1.",
  "",
  "2. EXTRACCIÓN EXPLORATORIA. Enumera TODO dato clave que consigas leer con seguridad: números de contrato, números de acta, valores en pesos, fechas, plazos, nombres de contratista y supervisor, números de póliza, cuentas bancarias. Para cada dato di el valor y tu certeza.",
  "",
  "Reglas que no puedes romper:",
  "- Si un dato está borroso, tapado por una perforación, cortado o simplemente no lo puedes leer, DILO. No lo adivines ni lo completes con lo que suele aparecer en este tipo de documentos.",
  "- Distingue siempre entre 'el documento no lo dice' y 'no lo puedo leer por la calidad de la imagen'. No son lo mismo.",
  "- No resuelvas contradicciones: si dos partes del documento se contradicen, descríbelas.",
  "",
  "3. CALIDAD DE IMAGEN. Termina con una valoración honesta: qué páginas se leen bien, cuáles mal, y qué te ha estorbado (perforaciones, sellos, firmas encima del texto, inclinación, resolución baja). Si crees que un OCR o un humano leería mejor que tú, dilo.",
].join("\n");

interface PdfFacts {
  pages: number;
  textChars: number;
  bytes: number;
}

/** Los mismos datos que usa pdf-intake para decidir el 422, para poder afirmar
 *  con pruebas que un archivo es un escaneo y no suponerlo. */
async function inspect(buffer: Buffer): Promise<PdfFacts> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText({ pageJoiner: "" });
    return { pages: result.total, textChars: result.text.trim().length, bytes: buffer.length };
  } finally {
    await parser.destroy();
  }
}

function renderCatalog(catalog: { code: string; name: string }[]): string {
  return catalog.map((t) => `${t.code} | ${t.name}`).join("\n");
}

function money(usd: number): string {
  return `$${usd.toFixed(4)}`;
}

async function probe(path: string, catalog: { code: string; name: string }[], model: string) {
  const name = basename(path);
  const buffer = readFileSync(path);
  const facts = await inspect(buffer);

  console.log("\n" + "═".repeat(78));
  console.log(name);
  console.log("═".repeat(78));
  console.log(
    `  ${facts.pages} páginas · ${(facts.bytes / 1024 / 1024).toFixed(2)} MB · ` +
      `capa de texto: ${facts.textChars} caracteres ` +
      `(${facts.textChars < 50 ? "ESCANEADO → el flujo actual lo rechaza con 422" : "tiene texto"})`,
  );

  const documentBlock = {
    type: "document" as const,
    source: {
      type: "base64" as const,
      media_type: "application/pdf" as const,
      data: buffer.toString("base64"),
    },
  };

  const messages = [
    {
      role: "user" as const,
      content: [
        // El documento va ANTES del texto: es lo recomendado para que el
        // modelo tenga el material delante cuando lee la instrucción.
        documentBlock,
        {
          type: "text" as const,
          text: [
            "CATÁLOGO DE TIPOS DOCUMENTALES (code | nombre):",
            renderCatalog(catalog),
            "",
            "Clasifica el documento y extrae lo que puedas leer, siguiendo las reglas.",
          ].join("\n"),
        },
      ],
    },
  ];

  // Antes de gastar: cuántos tokens cuesta meter este PDF como imágenes.
  const counted = await getAnthropicClient().messages.countTokens({
    model,
    system: SYSTEM_PROMPT,
    messages,
  });
  console.log(`  tokens de entrada (PDF como documento nativo): ${counted.input_tokens.toLocaleString("es-CO")}`);

  // Y cuánto costaría el MISMO documento por la vía actual, si tuviera texto.
  // Para un escaneo esto es 0 y por eso el flujo actual no puede con él.
  if (facts.textChars >= 50) {
    const parser = new PDFParse({ data: buffer });
    const text = (await parser.getText({ pageJoiner: "" })).text.trim();
    await parser.destroy();
    const textOnly = await getAnthropicClient().messages.countTokens({
      model,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: `${renderCatalog(catalog)}\n\n<documento>\n${text}\n</documento>` }],
    });
    console.log(
      `  tokens de entrada (mismo PDF como TEXTO, vía actual): ${textOnly.input_tokens.toLocaleString("es-CO")}` +
        `  →  el documento nativo cuesta ${(counted.input_tokens / textOnly.input_tokens).toFixed(1)}× más`,
    );
  }

  const started = Date.now();
  const response = await getAnthropicClient().messages.create({
    model,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    // Mismo esfuerzo que /extraer: leer cifras de una imagen no es tarea fácil.
    output_config: { effort: "high" },
    messages,
  });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);

  const rate = PRICING[model];
  const usage = response.usage;
  const cost = rate
    ? (usage.input_tokens * rate.input + usage.output_tokens * rate.output) / 1_000_000
    : null;

  console.log(
    `\n  ── respuesta en ${seconds}s · stop_reason: ${response.stop_reason} ─────────────────`,
  );
  console.log(
    `  uso real: ${usage.input_tokens.toLocaleString("es-CO")} in + ` +
      `${usage.output_tokens.toLocaleString("es-CO")} out` +
      (cost === null ? "" : `  ·  coste ≈ ${money(cost)} USD`),
  );

  if (response.stop_reason === "refusal") {
    console.log("\n  EL MODELO DECLINÓ LEER ESTE DOCUMENTO.");
    console.log(`  detalle: ${JSON.stringify(response.stop_details)}`);
    return { name, facts, inputTokens: usage.input_tokens, outputTokens: usage.output_tokens, cost };
  }

  console.log("\n  ── salida cruda del modelo ─────────────────────────────────────────\n");
  for (const block of response.content) {
    if (block.type === "text") console.log(block.text);
  }

  return { name, facts, inputTokens: usage.input_tokens, outputTokens: usage.output_tokens, cost };
}

async function main() {
  const paths = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (paths.length === 0) {
    throw new Error("Pasa al menos un PDF: npx tsx apps/api/scripts/probe-scanned-pdf.ts <archivo.pdf>");
  }

  const model = getModel();
  const catalog = await prisma.documentType.findMany({
    select: { code: true, name: true },
    orderBy: { code: "asc" },
  });
  console.log(`Modelo: ${model} · catálogo: ${catalog.length} tipos documentales`);

  const results = [];
  for (const path of paths) {
    results.push(await probe(path, catalog, model));
  }

  console.log("\n" + "═".repeat(78));
  console.log("RESUMEN DE COSTE");
  console.log("═".repeat(78));
  let total = 0;
  for (const r of results) {
    total += r.cost ?? 0;
    console.log(
      `  ${r.name.padEnd(52).slice(0, 52)} ${String(r.facts.pages).padStart(3)} pág  ` +
        `${String(r.inputTokens).padStart(7)} in  ${String(r.outputTokens).padStart(6)} out  ` +
        `${r.cost === null ? "" : money(r.cost)}`,
    );
  }
  console.log(`  ${"TOTAL".padEnd(52)} ${" ".repeat(24)}${money(total)}`);
}

main()
  .catch((error) => {
    console.error(`\nError: ${error instanceof Error ? error.stack : error}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
