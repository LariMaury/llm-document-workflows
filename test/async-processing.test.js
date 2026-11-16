import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyProcessingError,
  isTransientProcessingError,
  processQueueWithConcurrency,
  processWithBackpressure,
  processWithRetry,
  retryDelayMs,
} from "../src/async/resilient-processing.js";

test("queue preserves result order while limiting concurrency", async () => {
  let active = 0;
  let maximumActive = 0;
  const results = await processQueueWithConcurrency([4, 3, 2, 1], async value => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise(resolve => setTimeout(resolve, value));
    active -= 1;
    return value * 2;
  }, 2);
  assert.deepEqual(results, [8, 6, 4, 2]);
  assert.equal(maximumActive, 2);
});

test("queue clamps concurrency to four workers", async () => {
  let active = 0;
  let maximumActive = 0;
  await processQueueWithConcurrency(Array.from({ length: 8 }, (_, index) => index), async value => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise(resolve => setTimeout(resolve, 2));
    active -= 1;
    return value;
  }, 99);
  assert.equal(maximumActive, 4);
});

test("backpressure prepares the next window only after releasing the current one", async () => {
  const events = [];
  const results = await processWithBackpressure({
    totalItems: 5,
    windowSize: 2,
    prepare: async index => { events.push(`prepare:${index}`); return { index }; },
    beforeWindow: async (_window, start) => { events.push(`window:${start}`); },
    process: async item => { events.push(`process:${item.index}`); return item.index * 10; },
    release: async item => { events.push(`release:${item.index}`); },
  });
  assert.deepEqual(results, [0, 10, 20, 30, 40]);
  assert.ok(events.indexOf("release:1") < events.indexOf("prepare:2"));
  assert.ok(events.indexOf("release:3") < events.indexOf("prepare:4"));
});

test("backpressure releases prepared items when window registration fails", async () => {
  const released = [];
  await assert.rejects(processWithBackpressure({
    totalItems: 2,
    windowSize: 2,
    prepare: async index => ({ index }),
    beforeWindow: async () => { throw new Error("synthetic registration failure"); },
    process: async item => item,
    release: async item => { released.push(item.index); },
  }), /registration failure/);
  assert.deepEqual(released.sort(), [0, 1]);
});

test("backpressure supports cooperative cancellation between windows", async () => {
  let processed = 0;
  const released = [];
  const results = await processWithBackpressure({
    totalItems: 6,
    windowSize: 2,
    prepare: async index => ({ index }),
    process: async item => { processed += 1; return item.index; },
    release: async item => { released.push(item.index); },
    shouldStop: () => processed >= 2,
  });
  assert.equal(processed, 2);
  assert.deepEqual(released.sort(), [0, 1]);
  assert.equal(results[2], undefined);
});

test("classifies transient and permanent errors", () => {
  assert.equal(classifyProcessingError({ status: 429 }), "provider_limit");
  assert.equal(classifyProcessingError(new Error("network offline")), "network");
  assert.equal(isTransientProcessingError({ status: 503 }), true);
  assert.equal(isTransientProcessingError(new Error("invalid input")), false);
});

test("retry delay uses bounded exponential backoff", () => {
  assert.equal(retryDelayMs(1), 600);
  assert.equal(retryDelayMs(2), 1200);
  assert.equal(retryDelayMs(10), 4000);
});

test("processWithRetry retries only transient failures", async () => {
  let attempts = 0;
  const delays = [];
  const result = await processWithRetry(async () => {
    attempts += 1;
    if (attempts < 3) {
      const error = new Error("temporary outage");
      error.status = 503;
      throw error;
    }
    return "done";
  }, {
    maxRetries: 3,
    sleep: async delay => { delays.push(delay); },
  });
  assert.deepEqual(result, { value: "done", retries: 2 });
  assert.deepEqual(delays, [600, 1200]);

  await assert.rejects(processWithRetry(async () => {
    throw new Error("invalid input");
  }, { sleep: async () => {} }), /invalid input/);
});

test("processWithRetry stops at the configured retry limit", async () => {
  let attempts = 0;
  await assert.rejects(processWithRetry(async () => {
    attempts += 1;
    const error = new Error("network unavailable");
    error.status = 503;
    throw error;
  }, { maxRetries: 1, sleep: async () => {} }), /network unavailable/);
  assert.equal(attempts, 2);
});
