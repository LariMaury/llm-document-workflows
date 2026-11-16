import test from "node:test";
import assert from "node:assert/strict";
import {
  approveHumanReview,
  createHumanReview,
  extractJson,
  normalizeActivity,
  normalizeBnccCodes,
} from "../src/llm/normalize-activity.js";

test("extractJson accepts pure and fenced JSON", () => {
  assert.deepEqual(extractJson('{"ok":true}'), { ok: true });
  assert.deepEqual(extractJson('```json\n{"ok":true}\n```'), { ok: true });
});

test("normalizeBnccCodes sanitizes, deduplicates and limits codes", () => {
  assert.deepEqual(
    normalizeBnccCodes([" ef05ci02 ", "EF05CI02", "x", "EF01AB01", "EF02AB02", "EF03AB03", "EF04AB04", "EF05AB05"]),
    ["EF05CI02", "EF01AB01", "EF02AB02", "EF03AB03", "EF04AB04"],
  );
});

test("normalizeActivity accepts a valid objective question", () => {
  const normalized = normalizeActivity({
    titulo: "  Demo  ",
    questoes: [{
      tipo: "objetiva",
      enunciado: "  Pergunta? ",
      alternativas: ["A1", "A2", "A3"],
      correta: "b",
      explicacao_gabarito: "Explicação",
      habilidades_bncc: ["EF05CI02"],
    }],
  }, { quantity: 1, allowedTypes: ["objetiva"] });
  assert.equal(normalized.titulo, "Demo");
  assert.equal(normalized.questoes[0].correta, "B");
  assert.deepEqual(normalized.questoes[0].habilidades_bncc, ["EF05CI02"]);
});

test("normalizeActivity filters malformed questions and reports partial output", () => {
  const normalized = normalizeActivity({
    questoes: [
      { tipo: "objetiva", enunciado: "Válida", alternativas: ["A", "B", "C"], correta: "A" },
      { tipo: "objetiva", enunciado: "Inválida", alternativas: ["A"], correta: "E" },
    ],
  }, { quantity: 2, allowedTypes: ["objetiva"] });
  assert.equal(normalized.questoes.length, 1);
  assert.match(normalized.aviso, /1 de 2 questões válidas/);
});

test("normalizeActivity obeys distribution by type", () => {
  const normalized = normalizeActivity({
    questoes: [
      { tipo: "discursiva", enunciado: "D1" },
      { tipo: "discursiva", enunciado: "D2" },
      { tipo: "objetiva", enunciado: "O1", alternativas: ["A", "B", "C"], correta: "A" },
    ],
  }, {
    quantity: 3,
    allowedTypes: ["discursiva", "objetiva"],
    distribution: { discursiva: 1, objetiva: 1 },
  });
  assert.deepEqual(normalized.questoes.map(question => question.tipo), ["discursiva", "objetiva"]);
});

test("normalizeActivity rejects unusable structures", () => {
  assert.equal(normalizeActivity({}, { quantity: 1, allowedTypes: ["objetiva"] }), null);
  assert.equal(normalizeActivity({ questoes: [{ tipo: "objetiva" }] }, {
    quantity: 1,
    allowedTypes: ["objetiva"],
  }), null);
  assert.throws(() => normalizeActivity({ questoes: [] }, { quantity: 1, allowedTypes: [] }), TypeError);
});

test("human review is an explicit approval gate", () => {
  const activity = { titulo: "Demo", questoes: [{ tipo: "discursiva", enunciado: "Explique." }] };
  const review = createHumanReview(activity);
  assert.equal(review.status, "pending_review");
  const approved = approveHumanReview(review, { reviewer: "Revisora fictícia" });
  assert.equal(approved.status, "approved");
  assert.equal(approved.reviewer, "Revisora fictícia");
  assert.throws(() => approveHumanReview(approved, { reviewer: "Outra" }), /pendente/);
});
