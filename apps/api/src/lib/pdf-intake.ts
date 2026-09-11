import type { FastifyRequest } from "fastify";
import { extractPdfText } from "./pdf-text";

// ─────────────────────────────────────────────────────────────────────────────
// Recepción de un PDF subido por multipart, hasta tener su texto en la mano.
//
// Es el tramo idéntico de /clasificar y /extraer: validar que venga un archivo,
// que sea un PDF de verdad, sacarle la capa de texto y rechazar el que no tiene
// ninguna. Vive aquí y no duplicado en cada ruta porque si los dos endpoints
// divergieran —un umbral distinto, una firma que uno comprueba y el otro no—
// el mismo documento podría pasar por uno y ser rechazado por el otro, y el
// usuario no tendría forma de saber por qué.
//
// Lo que este módulo NO hace: no mira el contrato, no llama a Claude y no
// responde la petición. Devuelve el resultado y deja que la ruta decida.
// ─────────────────────────────────────────────────────────────────────────────

/** 20 MB. Los PDFs del expediente más pesado analizado no llegan a 10.
 *  Debe coincidir con `limits.fileSize` del plugin multipart en index.ts: el
 *  plugin es quien corta, esto solo es el número que se le muestra al usuario. */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

/** Un documento sin capa de texto útil no se le manda al modelo: trabajarlo a
 *  partir de cuatro caracteres sueltos sería inventar. El umbral es bajo a
 *  propósito — no distingue "poco texto" de "ningún texto", solo descarta lo
 *  que no da ni para leer un encabezado. */
export const MIN_TEXT_LENGTH = 50;

/** Tope de texto enviado al modelo. Un PDF combinado puede traer cientos de
 *  páginas y lo que buscamos está en las primeras: mandarlo entero multiplica
 *  el costo sin mejorar el resultado. Cuando se recorta, la respuesta lo dice
 *  (`extraction.truncated`) — nunca en silencio. */
export const MAX_TEXT_LENGTH = 120_000;

export interface PdfIntake {
  file: { originalFileName: string; mimeType: string; fileSize: number };
  extraction: { characters: number; pages: number; truncated: boolean };
  /** El texto ya recortado a MAX_TEXT_LENGTH: lo que se le manda al modelo.
   *  `extraction.characters` sigue siendo la longitud real del documento. */
  text: string;
}

/** El error ya resuelto —status y cuerpo—, para que la ruta solo lo envíe. Se
 *  devuelve en vez de responder aquí dentro para que este módulo no dependa de
 *  `reply` y siga siendo comprobable sin levantar Fastify. */
export interface PdfIntakeFailure {
  status: number;
  body: Record<string, unknown>;
}

export type PdfIntakeResult =
  | { ok: true; intake: PdfIntake }
  | { ok: false; failure: PdfIntakeFailure };

function fail(status: number, body: Record<string, unknown>): PdfIntakeResult {
  return { ok: false, failure: { status, body } };
}

export async function intakePdf(request: FastifyRequest): Promise<PdfIntakeResult> {
  let file;
  try {
    file = await request.file();
  } catch (error) {
    if (error instanceof Error && error.message.includes("File too large")) {
      return fail(413, {
        error: `El archivo supera el límite de ${MAX_FILE_BYTES / 1024 / 1024} MB`,
      });
    }
    return fail(400, {
      error: "La petición debe ser multipart/form-data con un archivo PDF",
    });
  }

  if (!file) {
    return fail(400, { error: "Falta el archivo PDF" });
  }

  // El mimetype lo declara el cliente, así que no basta por sí solo: la
  // comprobación real es la firma %PDF- de abajo, sobre el contenido.
  const looksLikePdf =
    file.mimetype === "application/pdf" || file.filename.toLowerCase().endsWith(".pdf");
  if (!looksLikePdf) {
    return fail(400, { error: "El archivo debe ser un PDF", received: file.mimetype });
  }

  const buffer = await file.toBuffer();
  if (buffer.subarray(0, 5).toString("latin1") !== "%PDF-") {
    return fail(400, { error: "El archivo no es un PDF válido: no empieza por %PDF-" });
  }

  let extracted;
  try {
    extracted = await extractPdfText(buffer);
  } catch (error) {
    request.log.warn({ err: error }, "no se pudo leer el PDF");
    return fail(400, { error: "El PDF no se pudo leer o está dañado" });
  }

  if (extracted.text.length < MIN_TEXT_LENGTH) {
    // No se llama a Claude: sin texto no hay nada que leer y una respuesta suya
    // aquí sería invención.
    return fail(422, {
      error:
        "El PDF no tiene una capa de texto utilizable; probablemente es un escaneo sin OCR. Esta versión no procesa documentos escaneados.",
      extraction: { characters: extracted.text.length, pages: extracted.pages },
    });
  }

  const truncated = extracted.text.length > MAX_TEXT_LENGTH;

  return {
    ok: true,
    intake: {
      file: {
        originalFileName: file.filename,
        mimeType: file.mimetype,
        fileSize: buffer.length,
      },
      extraction: {
        characters: extracted.text.length,
        pages: extracted.pages,
        truncated,
      },
      text: truncated ? extracted.text.slice(0, MAX_TEXT_LENGTH) : extracted.text,
    },
  };
}
