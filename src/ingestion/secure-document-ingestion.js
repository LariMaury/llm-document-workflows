import { strFromU8, unzipSync } from "fflate";
import { extractText, getDocumentProxy } from "unpdf";

/**
 * Adaptado de `processar-material-atividade/index.ts`.
 * Autenticação, CORS, Supabase e persistência foram removidos do recorte local.
 */
export const INGESTION_LIMITS = Object.freeze({
  maxFileBytes: 5 * 1024 * 1024,
  maxTextCharacters: 500_000,
  maxPdfPages: 200,
  maxZipUncompressedBytes: 25 * 1024 * 1024,
  maxZipEntries: 1000,
});

function readU16(bytes, position) {
  return bytes[position] | (bytes[position + 1] << 8);
}

function readU32(bytes, position) {
  return (bytes[position] | (bytes[position + 1] << 8) | (bytes[position + 2] << 16)
    | (bytes[position + 3] << 24)) >>> 0;
}

export function sanitizeFileName(value) {
  return String(value ?? "").split(/[\\/]/).pop()?.trim().slice(0, 180) || "";
}

export function decodeBase64File(value) {
  const base64 = String(value ?? "").replace(/^data:[^,]+,/, "").trim();
  const maxEncoded = Math.ceil(INGESTION_LIMITS.maxFileBytes * 4 / 3) + 8;
  if (!base64 || base64.length > maxEncoded || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
    throw new Error("O arquivo enviado é inválido ou maior que 5MB.");
  }
  let binary;
  try {
    binary = atob(base64);
  } catch {
    throw new Error("Não foi possível decodificar o arquivo enviado.");
  }
  if (!binary.length || binary.length > INGESTION_LIMITS.maxFileBytes) {
    throw new Error(binary.length ? "O arquivo é maior que 5MB." : "O arquivo está vazio.");
  }
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

export function normalizeExtractedText(text) {
  const clean = String(text).replace(/\u0000/g, " ").replace(/[ \t]{2,}/g, " ")
    .replace(/\n[ \t]+/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return {
    text: clean.slice(0, INGESTION_LIMITS.maxTextCharacters),
    truncated: clean.length > INGESTION_LIMITS.maxTextCharacters,
  };
}

export function extractTxt(bytes) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

export function validateZip(bytes) {
  let eocd = -1;
  for (let index = bytes.length - 22; index >= Math.max(0, bytes.length - 65_557); index--) {
    if (readU32(bytes, index) === 0x06054b50) { eocd = index; break; }
  }
  if (eocd < 0) throw new Error("Este DOCX está corrompido ou não é um documento válido.");
  const entries = readU16(bytes, eocd + 10);
  const centralStart = readU32(bytes, eocd + 16);
  if (!entries || entries > INGESTION_LIMITS.maxZipEntries) {
    throw new Error("Este DOCX possui uma estrutura inválida ou complexa demais.");
  }
  let position = centralStart;
  let total = 0;
  for (let index = 0; index < entries; index++) {
    if (position + 46 > bytes.length || readU32(bytes, position) !== 0x02014b50) {
      throw new Error("Este DOCX está corrompido ou não é um documento válido.");
    }
    const size = readU32(bytes, position + 24);
    if (size === 0xffffffff) throw new Error("DOCX no formato ZIP64 não é aceito nesta versão.");
    total += size;
    if (total > INGESTION_LIMITS.maxZipUncompressedBytes) {
      throw new Error("O conteúdo descompactado deste DOCX é grande demais.");
    }
    position += 46 + readU16(bytes, position + 28)
      + readU16(bytes, position + 30) + readU16(bytes, position + 32);
  }
}

function decodeXmlEntities(text) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, decimal) => String.fromCodePoint(parseInt(decimal, 10)))
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

function wordXmlText(xml) {
  return decodeXmlEntities(xml
    .replace(/<w:tab\b[^>]*\/>/gi, "\t")
    .replace(/<w:br\b[^>]*\/>/gi, "\n")
    .replace(/<\/w:p>/gi, "\n")
    .replace(/<\/w:tr>/gi, "\n")
    .replace(/<[^>]+>/g, ""));
}

export function extractDocx(bytes) {
  validateZip(bytes);
  let files;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error("Não foi possível abrir este DOCX; ele pode estar corrompido.");
  }
  const document = files["word/document.xml"];
  if (!document || !files["[Content_Types].xml"]) {
    throw new Error("Este arquivo não contém um documento DOCX válido.");
  }
  const parts = [wordXmlText(strFromU8(document))];
  for (const name of Object.keys(files).sort()) {
    if (/^word\/(footnotes|endnotes)\.xml$/i.test(name)) {
      parts.push(wordXmlText(strFromU8(files[name])));
    }
  }
  return parts.join("\n\n");
}

export async function withTimeout(promise, milliseconds, message = "A operação excedeu o tempo limite.") {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function extractPdf(bytes, {
  getPdf = getDocumentProxy,
  readPdfText = extractText,
  openTimeoutMs = 20_000,
  extractTimeoutMs = 25_000,
} = {}) {
  if (String.fromCharCode(...bytes.slice(0, 5)) !== "%PDF-") {
    throw new Error("Este arquivo não parece ser um PDF válido.");
  }
  const pdf = await withTimeout(
    getPdf(bytes, { maxImageSize: 16_777_216 }),
    openTimeoutMs,
    "O PDF demorou demais para ser aberto.",
  );
  try {
    if (pdf.numPages > INGESTION_LIMITS.maxPdfPages) {
      throw new Error(`O PDF possui mais de ${INGESTION_LIMITS.maxPdfPages} páginas.`);
    }
    const result = await withTimeout(
      readPdfText(pdf, { mergePages: true }),
      extractTimeoutMs,
      "O PDF demorou demais para ser processado.",
    );
    return Array.isArray(result.text) ? result.text.join("\n\n") : result.text;
  } finally {
    try { await pdf.destroy?.(); } catch { /* objeto local já será descartado */ }
  }
}

export async function processDocumentBytes({ name, bytes, declaredSize = 0 }, adapters = {}) {
  const safeName = sanitizeFileName(name);
  const extension = `.${(safeName.split(".").pop() || "").toLowerCase()}`;
  if (![".txt", ".docx", ".pdf"].includes(extension)) {
    throw new Error("Formato não aceito. Use TXT, DOCX ou PDF.");
  }
  if (!(bytes instanceof Uint8Array) || !bytes.length) throw new Error("O arquivo está vazio.");
  if (bytes.length > INGESTION_LIMITS.maxFileBytes) throw new Error("O arquivo é maior que 5MB.");
  if (declaredSize && Math.round(Number(declaredSize)) !== bytes.length) {
    throw new Error("O arquivo chegou incompleto.");
  }

  let raw = "";
  if (extension === ".txt") raw = extractTxt(bytes);
  else if (extension === ".docx") raw = extractDocx(bytes);
  else raw = await extractPdf(bytes, adapters);
  const normalized = normalizeExtractedText(raw);
  if (!normalized.text) throw new Error("Não foi encontrado texto legível neste arquivo.");
  return {
    processed: true,
    fileName: safeName,
    format: extension.slice(1),
    text: normalized.text,
    characters: normalized.text.length,
    truncated: normalized.truncated,
  };
}

export async function processBase64Document({ name, base64, declaredSize = 0 }, adapters = {}) {
  const bytes = decodeBase64File(base64);
  return processDocumentBytes({ name, bytes, declaredSize }, adapters);
}
