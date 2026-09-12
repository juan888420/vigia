import assert from "node:assert/strict";
import { test } from "node:test";
import { manualFormHref, manualFormInitialValues } from "./ai-document";
import { EMPTY_DOCUMENT_FORM, formatFileSize } from "./document-form";

// El puente entre la pantalla de IA y el formulario manual. Se prueba aquí y
// no en la UI porque lo que puede romperse es la traducción en los dos
// sentidos: qué se escribe en la URL y qué se cree de lo que llega por ella.

const FILE = {
  originalFileName: "ACTA DE INICIO CD-011-2025.pdf",
  mimeType: "application/pdf",
  fileSize: 1_289_432,
  contentHash: "a".repeat(64),
};

/** La URL vuelta el objeto que Next le pasa a la página. */
function paramsOf(href: string) {
  const { searchParams } = new URL(href, "http://localhost:3000");
  return Object.fromEntries(searchParams.entries());
}

test("sin tipo ni archivo el enlace no lleva querystring", () => {
  assert.equal(manualFormHref("c1"), "/contratos/c1/documentos/nuevo");
});

test("con solo el tipo sigue siendo el ?tipo= de antes", () => {
  assert.equal(manualFormHref("c1", "dt-7"), "/contratos/c1/documentos/nuevo?tipo=dt-7");
});

test("el archivo viaja completo y escapado", () => {
  const params = paramsOf(manualFormHref("c1", "dt-7", FILE));

  assert.deepEqual(params, {
    tipo: "dt-7",
    archivo: FILE.originalFileName,
    mime: FILE.mimeType,
    tamano: "1289432",
    hash: FILE.contentHash,
  });
});

test("ida y vuelta: lo que se prellena es lo que el API devolvió", () => {
  const values = manualFormInitialValues(paramsOf(manualFormHref("c1", "dt-7", FILE)));

  assert.deepEqual(values, {
    ...EMPTY_DOCUMENT_FORM,
    documentTypeId: "dt-7",
    originalFileName: FILE.originalFileName,
    mimeType: FILE.mimeType,
    fileSize: FILE.fileSize,
    contentHash: FILE.contentHash,
  });
});

test("storagePath nunca se prellena: no hay subida de archivos todavía", () => {
  const values = manualFormInitialValues(paramsOf(manualFormHref("c1", "dt-7", FILE)));
  assert.equal(values?.storagePath, "");
});

test("sin parámetros el formulario arranca vacío, como el registro manual", () => {
  assert.equal(manualFormInitialValues({}), undefined);
});

test("parámetros en blanco cuentan como ausentes", () => {
  assert.equal(manualFormInitialValues({ tipo: "  ", archivo: "", hash: " " }), undefined);
});

test("solo el tipo: el resto queda vacío, no a medias", () => {
  assert.deepEqual(manualFormInitialValues({ tipo: "dt-7" }), {
    ...EMPTY_DOCUMENT_FORM,
    documentTypeId: "dt-7",
  });
});

test("un tamaño que no es un entero de bytes se descarta", () => {
  for (const tamano of ["1,2 MB", "-5", "1e9", "12.5", ""]) {
    assert.equal(manualFormInitialValues({ archivo: "x.pdf", tamano })?.fileSize, null, tamano);
  }
});

test("un hash que no tiene forma de sha256 se descarta en vez de guardarse", () => {
  for (const hash of ["deadbeef", "z".repeat(64), `${"a".repeat(64)}b`]) {
    assert.equal(manualFormInitialValues({ archivo: "x.pdf", hash })?.contentHash, null, hash);
  }
});

test("un parámetro repetido se queda con el primero y no rompe la página", () => {
  const values = manualFormInitialValues({ tipo: ["dt-7", "dt-9"], archivo: ["a.pdf"] });

  assert.equal(values?.documentTypeId, "dt-7");
  assert.equal(values?.originalFileName, "a.pdf");
});

test("el tamaño se muestra legible, no en bytes crudos", () => {
  assert.equal(formatFileSize(0), "0 B");
  assert.equal(formatFileSize(900), "900 B");
  assert.equal(formatFileSize(2048), "2 KB");
  assert.equal(formatFileSize(1_289_432), "1,2 MB");
  assert.equal(formatFileSize(15 * 1024 * 1024), "15 MB");
});
