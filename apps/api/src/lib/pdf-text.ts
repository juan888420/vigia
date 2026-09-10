import { PDFParse } from "pdf-parse";

// Extracción de la capa de texto de un PDF. Nada más.
//
// SIN OCR, deliberadamente: los expedientes reales de esta oficina se generan
// en Word y se exportan a PDF, así que traen capa de texto. Un PDF escaneado
// aquí es la excepción, y la respuesta correcta ante él es decirlo —no
// adivinar con OCR y arrastrar el error a la clasificación.

export interface ExtractedText {
  text: string;
  /** Páginas del documento, para poder explicar un resultado vacío. */
  pages: number;
}

export async function extractPdfText(data: Buffer): Promise<ExtractedText> {
  const parser = new PDFParse({ data });
  try {
    // pageJoiner vacío: por defecto pdf-parse inserta "-- 1 of 10 --" al final
    // de cada página. Ese marcador lo pone la librería, no el documento, y en
    // un PDF escaneado es LO ÚNICO que sale — 167 caracteres de puro separador
    // que harían pasar el umbral de texto mínimo a un documento sin una sola
    // letra. Sin él, un escaneo mide 0 y se rechaza como debe.
    const result = await parser.getText({ pageJoiner: "" });
    return { text: result.text.trim(), pages: result.total };
  } finally {
    // pdfjs deja un worker vivo por documento: sin esto el proceso acumula uno
    // por cada PDF clasificado.
    await parser.destroy();
  }
}
