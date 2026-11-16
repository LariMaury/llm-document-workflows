import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSaveActivityArguments,
  centsFromValue,
  databaseDecimalFromCents,
  distributeCents,
  normalizeBnccSkills,
  validateActivityContract,
  validateActivityScoring,
  validateQuestionsForPersistence,
} from "../src/contracts/activity-contract.js";
import { SimulatedTransactionStore } from "../src/contracts/simulated-transaction-store.js";

function validActivity() {
  return {
    disciplina: "Ciências — demo",
    serie: "5º ano — demo",
    titulo: "Atividade sintética",
    rascunho: false,
    valorTotalCentavos: 200,
    humanReview: { status: "approved", reviewer: "Pessoa fictícia" },
    questoes: [
      {
        tipo: "objetiva",
        ordem: 1,
        enunciado: "Pergunta sintética?",
        alternativas: ["A", "B", "C"],
        correta: "A",
        habilidades_bncc: ["EF05CI02"],
        valorMaximoCentavos: 100,
      },
      {
        tipo: "discursiva",
        ordem: 2,
        enunciado: "Explique com dados fictícios.",
        valorMaximoCentavos: 100,
      },
    ],
  };
}

test("normalizes money without floating point arithmetic", () => {
  assert.equal(centsFromValue("1,25"), 125);
  assert.equal(centsFromValue("1.25"), 125);
  assert.equal(centsFromValue("1.234,50"), 123450);
  assert.equal(centsFromValue("1.234"), null);
  assert.equal(databaseDecimalFromCents(125), "1.25");
});

test("distributes indivisible cents deterministically", () => {
  assert.deepEqual(distributeCents(10, 3), [4, 3, 3]);
  assert.deepEqual(distributeCents(-1, 3), []);
});

test("normalizes BNCC codes and removes duplicates", () => {
  assert.deepEqual(normalizeBnccSkills(["ef05ci02", "EF05CI02", "bad"]), [{ codigo: "EF05CI02" }]);
});

test("builds the RPC-shaped payload without invoking PostgreSQL", () => {
  const payload = buildSaveActivityArguments(validActivity());
  assert.equal(payload.p_atividade.valor_total, "2.00");
  assert.equal(payload.p_atividade.revisao_ia.revisada_por_humano, true);
  assert.equal(payload.p_questoes.length, 2);
  assert.deepEqual(payload.p_questoes[0].habilidades_bncc, ["EF05CI02"]);
});

test("reports invalid alternatives and correct answer", () => {
  const errors = validateQuestionsForPersistence([
    { ordem: 1, tipo: "objetiva", enunciado: "Q1", alternativas: ["A"], correta: "A" },
    { ordem: 2, tipo: "objetiva", enunciado: "Q2", alternativas: ["A", "B"], correta: "E" },
  ]);
  assert.equal(errors.length, 2);
});

test("requires exact scoring before finalization", () => {
  const activity = validActivity();
  activity.questoes[1].valorMaximoCentavos = 50;
  assert.match(validateActivityScoring(activity, { finalize: true })[0], /Falta distribuir/);
  assert.deepEqual(validateActivityScoring(activity, { finalize: false }), []);
});

test("requires approved human review", () => {
  const activity = validActivity();
  activity.humanReview.status = "pending_review";
  const result = validateActivityContract(activity);
  assert.equal(result.valid, false);
  assert.match(result.errors.at(-1), /revisão humana/);
});

test("simulated store commits a valid aggregate", async () => {
  const store = new SimulatedTransactionStore();
  const result = await store.saveActivity(validActivity());
  assert.equal(result.committed, true);
  assert.equal(result.id, "demo-activity-001");
  assert.equal(store.snapshot().questions.length, 2);
});

test("simulated store rolls back all staged changes on failure", async () => {
  const store = new SimulatedTransactionStore();
  const before = store.snapshot();
  const result = await store.saveActivity(validActivity(), { failAt: "after_questions" });
  assert.equal(result.rolledBack, true);
  assert.deepEqual(store.snapshot(), before);
});

test("simulated store rejects invalid contracts without writing", async () => {
  const store = new SimulatedTransactionStore();
  const activity = validActivity();
  activity.humanReview.status = "pending_review";
  const result = await store.saveActivity(activity);
  assert.equal(result.reason, "validation");
  assert.equal(store.snapshot().activities.length, 0);
});
