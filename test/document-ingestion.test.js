import test from "node:test";
import assert from "node:assert/strict";
import {
  decodeBase64File,
  INGESTION_LIMITS,
  normalizeExtractedText,
  processDocumentBytes,
  sanitizeFileName,
  validateZip,
  withTimeout,
} from "../src/ingestion/secure-document-ingestion.js";
import { createSyntheticDocx, createSyntheticPdf } from "../demo/synthetic-documents.js";

test("sanitizes paths and decodes a bounded base64 payload", () => {
  assert.equal(sanitizeFileName("C:\\private\\synthetic.txt"), "synthetic.txt");
  assert.equal(new TextDecoder().decode(decodeBase64File(btoa("safe"))), "safe");
  assert.throws(() => decodeBase64File("%%%"), /inválido/);
});

test("processes a synthetic TXT document", async () => {
  const bytes = new TextEncoder().encode("Linha 1\n\n\n   Linha 2");
  const result = await processDocumentBytes({ name: "demo.txt", bytes, declaredSize: bytes.length });
  assert.equal(result.format, "txt");
  assert.equal(result.text, "Linha 1\n\nLinha 2");
  assert.equal(result.truncated, false);
});

test("processes a synthetic DOCX document", async () => {
  const bytes = createSyntheticDocx("DOCX sintético & seguro");
  const result = await processDocumentBytes({ name: "demo.docx", bytes, declaredSize: bytes.length });
  assert.equal(result.format, "docx");
  assert.match(result.text, /DOCX sintético & seguro/);
});

test("processes a synthetic PDF document", async () => {
  const bytes = createSyntheticPdf("Synthetic PDF content");
  const result = await processDocumentBytes({ name: "demo.pdf", bytes, declaredSize: bytes.length });
  assert.equal(result.format, "pdf");
  assert.match(result.text, /Synthetic PDF content/);
});

test("rejects unsupported, empty, oversized and incomplete inputs", async () => {
  await assert.rejects(
    processDocumentBytes({ name: "demo.exe", bytes: new Uint8Array([1]) }),
    /Formato não aceito/,
  );
  await assert.rejects(
    processDocumentBytes({ name: "demo.txt", bytes: new Uint8Array() }),
    /vazio/,
  );
  await assert.rejects(
    processDocumentBytes({ name: "demo.txt", bytes: new Uint8Array(INGESTION_LIMITS.maxFileBytes + 1) }),
    /maior que 5MB/,
  );
  await assert.rejects(
    processDocumentBytes({ name: "demo.txt", bytes: new Uint8Array([1, 2]), declaredSize: 3 }),
    /incompleto/,
  );
});

test("rejects a corrupted DOCX before decompression", () => {
  assert.throws(() => validateZip(new Uint8Array([1, 2, 3, 4])), /corrompido/);
});

test("limits normalized text deterministically", () => {
  const result = normalizeExtractedText("x".repeat(INGESTION_LIMITS.maxTextCharacters + 10));
  assert.equal(result.text.length, INGESTION_LIMITS.maxTextCharacters);
  assert.equal(result.truncated, true);
});

test("withTimeout rejects stalled local work", async () => {
  await assert.rejects(
    withTimeout(new Promise(() => {}), 5, "synthetic timeout"),
    /synthetic timeout/,
  );
});

test("rejects PDFs above the page limit and destroys the parser object", async () => {
  let destroyed = false;
  const bytes = new TextEncoder().encode("%PDF-synthetic");
  await assert.rejects(processDocumentBytes({ name: "too-long.pdf", bytes }, {
    getPdf: async () => ({ numPages: 201, destroy: async () => { destroyed = true; } }),
    readPdfText: async () => ({ text: "unused" }),
  }), /mais de 200 páginas/);
  assert.equal(destroyed, true);
});
