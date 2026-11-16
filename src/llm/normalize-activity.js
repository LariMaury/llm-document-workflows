/**
 * Adaptado de `normalizarAtividade` e funções auxiliares de
 * `site/supabase/functions/gerar-atividade-ia/index.ts`.
 *
 * O prompt, a autenticação e a chamada ao provedor não fazem parte deste recorte.
 */

const QUESTION_TYPES = new Set(["objetiva", "vf", "discursiva", "lacunas", "colunas"]);

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function limitedText(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function extractJson(text) {
  if (typeof text !== "string") throw new TypeError("A resposta simulada deve ser texto.");
  const clean = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  return JSON.parse(clean);
}

export function normalizeBnccCodes(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const codes = [];
  for (const item of value) {
    const code = limitedText(item, 20).toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!/^[A-Z0-9]{6,20}$/.test(code) || seen.has(code)) continue;
    seen.add(code);
    codes.push(code);
    if (codes.length >= 5) break;
  }
  return codes;
}

/**
 * Normaliza uma resposta estruturada simulada. Retorna `null` quando nenhum
 * conteúdo aproveitável pode ser submetido à revisão humana.
 */
export function normalizeActivity(value, {
  quantity,
  allowedTypes,
  distribution = null,
} = {}) {
  const limit = Math.max(1, Math.floor(Number(quantity) || 0));
  const permitted = new Set(
    (Array.isArray(allowedTypes) ? allowedTypes : [])
      .map(type => String(type).toLowerCase())
      .filter(type => QUESTION_TYPES.has(type)),
  );
  if (!permitted.size) throw new TypeError("Informe ao menos um tipo de questão permitido.");
  if (!isRecord(value) || !Array.isArray(value.questoes)) return null;

  const questions = [];
  const countByType = {};
  const fitsDistribution = type => !distribution
    || (countByType[type] || 0) < (Number(distribution[type]) || 0);
  const count = type => { countByType[type] = (countByType[type] || 0) + 1; };

  for (const item of value.questoes) {
    if (questions.length >= limit) break;
    if (!isRecord(item)) continue;
    const reportedType = limitedText(item.tipo, 20).toLowerCase();
    const statement = limitedText(item.enunciado, 4000);
    const explanation = limitedText(item.explicacao_gabarito, 2000);
    const bnccCodes = normalizeBnccCodes(item.habilidades_bncc);
    if (!statement) continue;

    if (reportedType === "objetiva" || reportedType === "vf") {
      const alternatives = Array.isArray(item.alternativas)
        ? item.alternativas.map(alternative => limitedText(alternative, 1000)).filter(Boolean).slice(0, 5)
        : [];
      const isTrueFalse = reportedType === "vf" || alternatives.length === 2;
      if (isTrueFalse) {
        if (!permitted.has("vf") || alternatives.length !== 2) continue;
      } else if (!permitted.has("objetiva") || alternatives.length < 3) {
        continue;
      }
      const normalizedType = isTrueFalse ? "vf" : "objetiva";
      if (!fitsDistribution(normalizedType)) continue;
      const correct = limitedText(item.correta, 1).toUpperCase();
      const correctIndex = "ABCDE".indexOf(correct);
      if (correctIndex < 0 || correctIndex >= alternatives.length) continue;
      questions.push({
        tipo: normalizedType,
        enunciado: statement,
        alternativas: alternatives,
        correta: correct,
        explicacao_gabarito: explanation,
        habilidades_bncc: bnccCodes,
      });
      count(normalizedType);
      continue;
    }

    if (["discursiva", "lacunas", "colunas"].includes(reportedType)
        && permitted.has(reportedType) && fitsDistribution(reportedType)) {
      questions.push({
        tipo: reportedType,
        enunciado: statement,
        explicacao_gabarito: explanation,
        habilidades_bncc: bnccCodes,
      });
      count(reportedType);
    }
  }

  if (!questions.length) return null;
  const title = limitedText(value.titulo, 200) || "Atividade gerada com IA";
  const baseText = limitedText(value.texto_base, 12_000) || null;
  let warning = limitedText(value.aviso, 500) || null;
  if (questions.length < limit) {
    const detail = `Foram geradas ${questions.length} de ${limit} questões válidas. Revise antes de usar.`;
    warning = warning ? `${warning} ${detail}`.slice(0, 500) : detail;
  }
  return { titulo: title, texto_base: baseText, aviso: warning, questoes: questions };
}

/** Código criado para a demonstração: torna a revisão humana uma barreira explícita. */
export function createHumanReview(activity) {
  if (!activity || !Array.isArray(activity.questoes) || !activity.questoes.length) {
    throw new TypeError("A revisão exige uma atividade normalizada.");
  }
  return {
    status: "pending_review",
    activity: structuredClone(activity),
    reviewer: null,
    note: null,
  };
}

/** Código criado para a demonstração: nenhuma persistência é liberada sem aprovação. */
export function approveHumanReview(review, { reviewer, note = "" } = {}) {
  if (!review || review.status !== "pending_review") {
    throw new Error("Somente uma revisão pendente pode ser aprovada.");
  }
  const reviewerName = limitedText(reviewer, 120);
  if (!reviewerName) throw new TypeError("Identifique a pessoa revisora.");
  return {
    ...structuredClone(review),
    status: "approved",
    reviewer: reviewerName,
    note: limitedText(note, 500) || null,
  };
}
