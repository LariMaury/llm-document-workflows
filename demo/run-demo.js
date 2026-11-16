import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  approveHumanReview,
  createHumanReview,
  normalizeActivity,
  processDocumentBytes,
  processWithBackpressure,
  processWithRetry,
  SimulatedTransactionStore,
} from "../src/index.js";
import { createSyntheticDocx, createSyntheticPdf } from "./synthetic-documents.js";

const demoDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.dirname(demoDirectory);

export async function runDemo({ writeArtifacts = true } = {}) {
  const txt = new Uint8Array(await readFile(path.join(demoDirectory, "fixtures", "document.txt")));
  const documents = [
    { name: "synthetic.txt", bytes: txt },
    { name: "synthetic.docx", bytes: createSyntheticDocx() },
    { name: "synthetic.pdf", bytes: createSyntheticPdf() },
  ];
  const ingestionResults = [];
  for (const document of documents) {
    ingestionResults.push(await processDocumentBytes({
      ...document,
      declaredSize: document.bytes.length,
    }));
  }

  const simulatedLlmResponse = JSON.parse(await readFile(
    path.join(demoDirectory, "fixtures", "llm-response.json"),
    "utf8",
  ));
  const normalized = normalizeActivity(simulatedLlmResponse, {
    quantity: 2,
    allowedTypes: ["objetiva", "discursiva"],
  });
  const review = approveHumanReview(createHumanReview(normalized), {
    reviewer: "Pessoa revisora fictícia",
    note: "Conteúdo sintético conferido para a demonstração.",
  });
  const questions = normalized.questoes.map(question => ({
    ...question,
    valorMaximoCentavos: 100,
  }));
  const activity = {
    disciplina: "Ciências — demonstração",
    serie: "5º ano — demonstração",
    titulo: normalized.titulo,
    rascunho: false,
    valorTotalCentavos: 200,
    questoes: questions,
    aviso: normalized.aviso,
    humanReview: review,
  };
  const store = new SimulatedTransactionStore();
  const commit = await store.saveActivity(activity);
  const beforeFailure = store.snapshot();
  const rollback = await store.saveActivity(activity, { failAt: "after_questions" });
  const afterFailure = store.snapshot();

  const attempts = new Map();
  const retryEvents = [];
  const released = [];
  const asyncResults = await processWithBackpressure({
    totalItems: 5,
    windowSize: 2,
    prepare: async index => ({ index, syntheticPayload: `task-${index}` }),
    process: async item => processWithRetry(async () => {
      const attempt = (attempts.get(item.index) || 0) + 1;
      attempts.set(item.index, attempt);
      if (item.index === 2 && attempt === 1) {
        const error = new Error("Synthetic network timeout");
        error.status = 503;
        throw error;
      }
      return `${item.syntheticPayload}:done`;
    }, {
      sleep: async () => {},
      onRetry: event => retryEvents.push({ task: item.index, retry: event.retries, delay: event.delay }),
    }),
    release: async item => { released.push(item.index); },
  });

  const report = {
    schemaVersion: 1,
    executionMode: "local-synthetic",
    externalCalls: 0,
    ingestion: ingestionResults.map(result => ({
      fileName: result.fileName,
      format: result.format,
      characters: result.characters,
      truncated: result.truncated,
    })),
    llmSimulation: {
      normalizedQuestions: normalized.questoes.length,
      discardedQuestions: simulatedLlmResponse.questoes.length - normalized.questoes.length,
      reviewStatus: review.status,
    },
    transactionSimulation: {
      commit,
      rollback,
      rollbackPreservedState: JSON.stringify(beforeFailure) === JSON.stringify(afterFailure),
      persistedActivities: afterFailure.activities.length,
      persistedQuestions: afterFailure.questions.length,
    },
    asynchronousProcessing: {
      results: asyncResults,
      retryEvents,
      released: released.toSorted((left, right) => left - right),
    },
  };

  if (writeArtifacts) {
    const artifactsDirectory = path.join(projectDirectory, "artifacts");
    await mkdir(artifactsDirectory, { recursive: true });
    await writeFile(path.join(artifactsDirectory, "demo-report.json"), `${JSON.stringify(report, null, 2)}\n`);
    const markdown = `# Relatório da demonstração local\n\n`
      + `- Modo: \`${report.executionMode}\`\n`
      + `- Chamadas externas: **${report.externalCalls}**\n`
      + `- Formatos processados: ${report.ingestion.map(item => item.format.toUpperCase()).join(", ")}\n`
      + `- Questões normalizadas: ${report.llmSimulation.normalizedQuestions}\n`
      + `- Revisão humana: \`${report.llmSimulation.reviewStatus}\`\n`
      + `- Commit simulado: \`${report.transactionSimulation.commit.committed}\`\n`
      + `- Rollback preservou o estado: \`${report.transactionSimulation.rollbackPreservedState}\`\n`
      + `- Retries controlados: ${report.asynchronousProcessing.retryEvents.length}\n`;
    await writeFile(path.join(artifactsDirectory, "demo-report.md"), markdown);
  }
  return report;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = await runDemo();
  console.log(JSON.stringify(report, null, 2));
}
