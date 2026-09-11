import { createHash } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { extractPdfText } from "./pdf-text";

// ─────────────────────────────────────────────────────────────────────────────
// Recepción de un PDF subido por multipart, hasta tener su contenido en la
// mano y listo para el modelo.
//
// Es el tramo idéntico de /clasificar y /extraer: validar que venga un archivo,
// que sea un PDF de verdad, y decidir CÓMO se le entrega al modelo. Vive aquí
// y no duplicado en cada ruta porque si los dos endpoints divergieran —un
// umbral distinto, una firma que uno comprueba y el otro no— el mismo
// documento podría pasar por uno y ser rechazado por el otro, y el usuario no
// tendría forma de saber por qué.
//
// LAS DOS VÍAS, y por qué la elección no es negociable:
//
//   TEXT_LAYER   El PDF trae capa de texto → se manda el TEXTO.
//   PAGE_IMAGES  No la trae (escaneo)      → se manda el PDF NATIVO y el
//                                            modelo ve las páginas.
//
// La regla es "texto si lo hay" y no "imagen siempre", aunque la imagen
// funcione para los dos casos. Motivo medido, no estético: al recibir un PDF
// nativo la API manda la imagen Y el texto extraído, así que un documento con
// capa de texto pagaría dos veces por el mismo contenido — 2.993 tokens/página
// contra 1.397 del texto solo, en el Otrosí 1 real. Para un escaneo no hay tal
// disyuntiva: el texto vale 0 caracteres y la imagen es la única vía.
//
// Antes esto devolvía 422 y no había segunda vía. El cambio se apoya en una
// prueba concreta (ver apps/api/scripts/probe-*.ts): con el mismo esquema
// estricto, leyendo páginas rasterizadas sin capa de texto, el modelo siguió
// dejando `daysDelta` en null 3 de 3 veces y explicando por qué. Es decir, la
// disciplina que sostiene todo el flujo no depende de que el contenido llegue
// como texto.
//
// Lo que este módulo NO hace: no mira el contrato, no llama a Claude y no
// responde la petición. Devuelve el resultado y deja que la ruta decida.
// ─────────────────────────────────────────────────────────────────────────────

/** 20 MB. Los PDFs del expediente más pesado analizado no llegan a 10.
 *  Debe coincidir con `limits.fileSize` del plugin multipart en index.ts: el
 *  plugin es quien corta, esto solo es el número que se le muestra al usuario. */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

/** Frontera entre las dos vías. Por debajo de esto la capa de texto no da ni
 *  para leer un encabezado, así que el documento se manda como imágenes. El
 *  umbral es bajo a propósito: no distingue "poco texto" de "ningún texto",
 *  solo reconoce lo que no sirve como texto.
 *
 *  Ya no es un criterio de rechazo, es un criterio de ENRUTADO. */
export const MIN_TEXT_LENGTH = 50;

/** Tope de texto enviado al modelo. Un PDF combinado puede traer cientos de
 *  páginas y lo que buscamos está en las primeras: mandarlo entero multiplica
 *  el costo sin mejorar el resultado. Cuando se recorta, la respuesta lo dice
 *  (`extraction.truncated`) — nunca en silencio. */
export const MAX_TEXT_LENGTH = 120_000;

/**
 * Tope de páginas para la vía de imagen.
 *
 * El texto se puede recortar a MAX_TEXT_LENGTH y seguir siendo útil —lo que se
 * busca está en las primeras páginas—. Un PDF no: recortarlo exigiría
 * reescribirlo, y mandar media clasificación sin avisar es peor que no
 * mandarla. Así que aquí se rechaza en vez de truncar.
 *
 * El número sale de igualar el gasto de las dos vías, no de una preferencia:
 * MAX_TEXT_LENGTH son ~30.000 tokens, y una página escaneada mide ~1.560
 * tokens (medido sobre tres expedientes reales, con una constancia
 * sorprendente: 1.562 / 1.560 / 1.560). 30.000 / 1.560 ≈ 19 páginas; 25 deja
 * margen y cubre de sobra el documento más largo de los expedientes
 * analizados, el Otrosí 2 con 10.
 *
 * Un PDF por encima de esto casi nunca es UN documento: es una carpeta entera
 * escaneada de corrido, y clasificarla como una sola cosa sería un error de
 * todas formas.
 */
export const MAX_DOCUMENT_PAGES = 25;

/** De dónde sale lo que ve el modelo. Viaja en la respuesta de /clasificar y
 *  /extraer: quien revisa una propuesta tiene derecho a saber si salió de un
 *  texto o de una imagen, porque no se leen con la misma fiabilidad. */
export type ContentSource = "TEXT_LAYER" | "PAGE_IMAGES";

interface PdfIntakeBase {
  file: {
    originalFileName: string;
    mimeType: string;
    fileSize: number;
    /** SHA-256 del archivo en hexadecimal. Se calcula aquí y viaja en la
     *  respuesta de /clasificar y /extraer porque el destino de este valor es
     *  `ContractDocument.contentHash`, y quien confirma la propuesta es el
     *  cliente: sin esto tendría que rehashear el PDF en el navegador para
     *  mandarlo a /confirmar, con el riesgo de que el suyo y el del servidor
     *  no coincidan. El buffer ya está en memoria —hizo falta para comprobar
     *  la firma %PDF-—, así que no se lee el archivo dos veces. */
    contentHash: string;
  };
  extraction: {
    characters: number;
    pages: number;
    truncated: boolean;
    source: ContentSource;
  };
}

/**
 * Unión discriminada y no un objeto con dos campos opcionales: obliga a la
 * ruta a ramificar sobre `source` antes de tocar el contenido. Con campos
 * nullables sería posible olvidarse de una vía y compilar igual, que es
 * exactamente cómo se cuela un `text` vacío en un prompt.
 */
export type PdfIntake = PdfIntakeBase &
  (
    | {
        source: "TEXT_LAYER";
        /** Ya recortado a MAX_TEXT_LENGTH. `extraction.characters` sigue
         *  siendo la longitud real del documento. */
        text: string;
      }
    | {
        source: "PAGE_IMAGES";
        /** El PDF entero en base64, tal cual se le pasa al bloque `document`
         *  de la API. Sin rasterizar a PNG: el PDF nativo cuesta menos por
         *  página y la API ya renderiza las páginas por su cuenta. */
        documentBase64: string;
      }
  );

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

  const fileMeta = {
    originalFileName: file.filename,
    mimeType: file.mimetype,
    fileSize: buffer.length,
    contentHash: createHash("sha256").update(buffer).digest("hex"),
  };

  // ── Vía de imagen: el PDF no trae texto utilizable ─────────────────────────
  // Antes esto era un 422 y el documento no se procesaba. Ahora se le manda el
  // PDF al modelo, que ve las páginas renderizadas.
  if (extracted.text.length < MIN_TEXT_LENGTH) {
    if (extracted.pages > MAX_DOCUMENT_PAGES) {
      // 413 y no 422: el problema es el tamaño de lo que se envió, no que el
      // contenido sea inservible. La distinción importa aguas arriba — el
      // cliente enseña pantallas distintas para "no se puede leer" y para "es
      // demasiado grande", y la segunda tiene solución (partir el archivo).
      return fail(413, {
        error:
          `El documento está escaneado y tiene ${extracted.pages} páginas, por encima del límite de ${MAX_DOCUMENT_PAGES} ` +
          "para lectura por imagen. Un PDF escaneado tan largo suele ser una carpeta completa y no un solo documento: " +
          "sepáralo por documento, o regístralo a mano.",
        extraction: { characters: extracted.text.length, pages: extracted.pages },
      });
    }

    return {
      ok: true,
      intake: {
        file: fileMeta,
        extraction: {
          characters: extracted.text.length,
          pages: extracted.pages,
          // No hay recorte posible en esta vía: o va el PDF entero o no va.
          truncated: false,
          source: "PAGE_IMAGES",
        },
        source: "PAGE_IMAGES",
        documentBase64: buffer.toString("base64"),
      },
    };
  }

  // ── Vía de texto: la de siempre, sin cambios ──────────────────────────────
  const truncated = extracted.text.length > MAX_TEXT_LENGTH;

  return {
    ok: true,
    intake: {
      file: fileMeta,
      extraction: {
        characters: extracted.text.length,
        pages: extracted.pages,
        truncated,
        source: "TEXT_LAYER",
      },
      source: "TEXT_LAYER",
      text: truncated ? extracted.text.slice(0, MAX_TEXT_LENGTH) : extracted.text,
    },
  };
}

/**
 * El `content` del mensaje de usuario, ya montado para la vía que toque.
 *
 * Existe para que /clasificar y /extraer no repitan el bloque `document`: si
 * una de las dos lo montara distinto —otro media_type, el PDF después del
 * texto en vez de antes— tendríamos dos comportamientos con un solo nombre.
 *
 * `prompt` es lo que la ruta quiera decirle al modelo. En la vía de texto es
 * todo el mensaje; en la de imagen va DESPUÉS del documento, que es el orden
 * recomendado: el modelo tiene el material delante cuando lee la instrucción.
 */
export function buildUserContent(intake: PdfIntake, prompt: string) {
  if (intake.source === "TEXT_LAYER") return prompt;

  return [
    {
      type: "document" as const,
      source: {
        type: "base64" as const,
        media_type: "application/pdf" as const,
        data: intake.documentBase64,
      },
    },
    { type: "text" as const, text: prompt },
  ];
}

/** La frase que le dice al modelo qué está viendo. Sale de aquí y no de cada
 *  ruta para que las dos encuadren igual la vía de imagen: es el texto con el
 *  que se validó el comportamiento en las pruebas. */
export function sourceNotice(intake: PdfIntake): string {
  return intake.source === "PAGE_IMAGES"
    ? "El documento se te entrega como PDF escaneado: lo ves como imágenes de página, no como texto. Puede haber ruido de escaneo, perforaciones, sellos y firmas manuscritas. Si un dato no se puede leer por la calidad de la imagen, dilo en vez de adivinarlo."
    : "";
}
