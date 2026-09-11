import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { PDFParse } from "pdf-parse";
import { getAnthropicClient, getModel } from "../src/lib/anthropic";
import { prisma } from "../src/lib/prisma";

// Complemento de probe-scanned-pdf.ts: separa lo que cuesta el ANDAMIAJE
// (system + catálogo, idéntico en las dos vías) de lo que cuesta el DOCUMENTO.
//
// Sin esta resta, comparar totales engaña: el catálogo de 30 tipos pesa lo
// mismo mandando texto que mandando imágenes, así que diluye la diferencia y
// hace parecer que las páginas como imagen salen más baratas de lo que son.
//
// No llama al modelo: solo cuenta tokens. Cuesta 0.

const SYSTEM = "Eres un clasificador de documentos de expedientes de contratación pública colombiana.";

async function count(model: string, content: unknown) {
  const result = await getAnthropicClient().messages.countTokens({
    model,
    system: SYSTEM,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    messages: [{ role: "user", content: content as any }],
  });
  return result.input_tokens;
}

async function main() {
  const model = getModel();
  const catalog = await prisma.documentType.findMany({
    select: { code: true, name: true },
    orderBy: { code: "asc" },
  });
  const catalogText = catalog.map((t) => `${t.code} | ${t.name}`).join("\n");

  const baseline = await count(model, catalogText);
  console.log(`modelo: ${model}`);
  console.log(`andamiaje (system + catálogo de ${catalog.length} tipos): ${baseline} tokens\n`);

  console.log(
    "archivo".padEnd(48) +
      "pág".padStart(5) +
      "img".padStart(9) +
      "txt".padStart(8) +
      "tok/pág".padStart(9) +
      "  img÷txt",
  );
  console.log("─".repeat(88));

  for (const path of process.argv.slice(2)) {
    const buffer = readFileSync(path);
    const parser = new PDFParse({ data: buffer });
    const parsed = await parser.getText({ pageJoiner: "" });
    await parser.destroy();
    const text = parsed.text.trim();

    const asDocument =
      (await count(model, [
        {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: buffer.toString("base64") },
        },
        { type: "text", text: catalogText },
      ])) - baseline;

    const asText = text.length >= 50 ? (await count(model, `${catalogText}\n\n${text}`)) - baseline : 0;

    console.log(
      basename(path).padEnd(48).slice(0, 48) +
        String(parsed.total).padStart(5) +
        String(asDocument).padStart(9) +
        String(asText).padStart(8) +
        String(Math.round(asDocument / parsed.total)).padStart(9) +
        (asText > 0 ? `  ${(asDocument / asText).toFixed(1)}×` : "  — (sin texto)"),
    );
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.stack : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
