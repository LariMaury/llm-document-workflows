import test from "node:test";
import assert from "node:assert/strict";
import { runDemo } from "../demo/run-demo.js";

test("complete local pipeline is deterministic and uses no external calls", async () => {
  const first = await runDemo({ writeArtifacts: false });
  const second = await runDemo({ writeArtifacts: false });
  assert.deepEqual(second, first);
  assert.equal(first.externalCalls, 0);
  assert.deepEqual(first.ingestion.map(item => item.format), ["txt", "docx", "pdf"]);
  assert.equal(first.llmSimulation.reviewStatus, "approved");
  assert.equal(first.transactionSimulation.commit.committed, true);
  assert.equal(first.transactionSimulation.rollback.rolledBack, true);
  assert.equal(first.transactionSimulation.rollbackPreservedState, true);
  assert.equal(first.asynchronousProcessing.retryEvents.length, 1);
  assert.deepEqual(first.asynchronousProcessing.released, [0, 1, 2, 3, 4]);
});
