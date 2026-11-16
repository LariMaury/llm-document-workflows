/**
 * Fila e backpressure adaptados de `site/folha-respostas-contrato.js`.
 * Classificação e atraso de retry adaptados de `site/leitor-robustez-contrato.js`.
 */

export async function processQueueWithConcurrency(items, process, concurrency = 3) {
  const list = Array.isArray(items) ? items : [];
  const limit = Math.max(1, Math.min(4, Math.floor(Number(concurrency) || 3)));
  const results = new Array(list.length);
  let next = 0;
  async function worker() {
    while (next < list.length) {
      const index = next++;
      results[index] = await process(list[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, worker));
  return results;
}

export async function processWithBackpressure({
  totalItems = 0,
  prepare,
  beforeWindow = null,
  process,
  release = null,
  windowSize = 3,
  shouldStop = null,
  onPreparationError = null,
  onProcessingError = null,
} = {}) {
  const total = Math.max(0, Math.floor(Number(totalItems) || 0));
  if (typeof prepare !== "function" || typeof process !== "function") {
    throw new TypeError("O fluxo exige funções de preparação e processamento.");
  }
  const limit = Math.max(1, Math.min(4, Math.floor(Number(windowSize) || 1)));
  const results = new Array(total);
  for (let start = 0; start < total; start += limit) {
    if (typeof shouldStop === "function" && shouldStop()) break;
    const end = Math.min(total, start + limit);
    const window = [];
    const sourceIndexes = [];
    const released = new Set();
    let interrupted = false;
    try {
      for (let index = start; index < end; index++) {
        if (typeof shouldStop === "function" && shouldStop()) {
          interrupted = true;
          break;
        }
        try {
          window.push(await prepare(index));
          sourceIndexes.push(index);
        } catch (error) {
          if (typeof onPreparationError !== "function") throw error;
          results[index] = await onPreparationError(error, index);
        }
      }
      if (!interrupted && typeof shouldStop === "function" && shouldStop()) interrupted = true;
      if (!interrupted && window.length && typeof beforeWindow === "function") {
        await beforeWindow(window, start);
      }
      if (!interrupted && typeof shouldStop === "function" && shouldStop()) interrupted = true;
      if (!interrupted) {
        const processed = await processQueueWithConcurrency(window, async (item, windowIndex) => {
          const sourceIndex = sourceIndexes[windowIndex];
          try {
            if (typeof shouldStop === "function" && shouldStop()) return undefined;
            try {
              return await process(item, sourceIndex);
            } catch (error) {
              if (typeof onProcessingError !== "function") throw error;
              return await onProcessingError(error, item, sourceIndex);
            }
          } finally {
            if (typeof release === "function") await release(item, sourceIndex);
            released.add(windowIndex);
          }
        }, limit);
        processed.forEach((result, windowIndex) => {
          results[sourceIndexes[windowIndex]] = result;
        });
      }
    } finally {
      if (typeof release === "function") {
        for (let windowIndex = 0; windowIndex < window.length; windowIndex++) {
          if (!released.has(windowIndex)) await release(window[windowIndex], sourceIndexes[windowIndex]);
        }
      }
    }
    if (interrupted || (typeof shouldStop === "function" && shouldStop())) break;
  }
  return results;
}

export function classifyProcessingError(error) {
  const status = Number(error?.status || error?.statusCode || 0);
  const text = String(error?.message || error || "").toLocaleLowerCase("pt-BR");
  if (status === 429 || /429|rate.?limit|limite.*(uso|taxa)/.test(text)) return "provider_limit";
  if (/timeout|tempo.*esgot|aborted|deadline/.test(text)) return "provider_timeout";
  if (/network|failed to fetch|fetch failed|conex[aã]o|internet|offline/.test(text)) return "network";
  if (status >= 500 || /5\d\d|indispon[ií]vel|service unavailable|bad gateway/.test(text)) {
    return "provider_timeout";
  }
  return "unexpected";
}

export function isTransientProcessingError(error) {
  const status = Number(error?.status || error?.statusCode || 0);
  const category = classifyProcessingError(error);
  return ["network", "provider_timeout", "provider_limit"].includes(category)
    || status === 429 || status >= 500;
}

export function retryDelayMs(attempt) {
  return Math.min(4000, 600 * (2 ** Math.max(0, Number(attempt) - 1)));
}

/** Orquestração criada para demonstrar a política isolada de retry. */
export async function processWithRetry(task, {
  maxRetries = 2,
  sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
  onRetry = null,
} = {}) {
  let retries = 0;
  while (true) {
    try {
      return { value: await task(retries), retries };
    } catch (error) {
      if (!isTransientProcessingError(error) || retries >= maxRetries) throw error;
      retries += 1;
      const delay = retryDelayMs(retries);
      if (typeof onRetry === "function") await onRetry({ retries, delay, error });
      await sleep(delay);
    }
  }
}
