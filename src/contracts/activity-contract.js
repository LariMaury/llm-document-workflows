/**
 * Recorte adaptado de `site/atividade-contrato.js`.
 * Mantém normalização monetária, BNCC, questões e payload transacional.
 */

const LETTERS = "ABCDE";
const MAX_CENTS = 999_999_999_999;
const DEFAULT_RESPONSE_LINES = 5;

export function centsFromValue(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  if (Number.isInteger(value) && typeof value === "number") {
    return value >= 0 && value <= MAX_CENTS ? value : null;
  }
  const text = String(value).trim().replace(/\s/g, "");
  const normalized = text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text;
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [integer, decimal = ""] = normalized.split(".");
  const cents = Number(integer) * 100 + Number(decimal.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents >= 0 && cents <= MAX_CENTS ? cents : null;
}

export function databaseDecimalFromCents(cents) {
  if (!Number.isInteger(cents) || cents < 0 || cents > MAX_CENTS) return null;
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

export function formatCents(cents) {
  if (!Number.isInteger(cents)) return "—";
  return (cents / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function distributeCents(totalCents, quantity) {
  if (!Number.isInteger(totalCents) || totalCents < 0
      || !Number.isInteger(quantity) || quantity < 1) return [];
  const base = Math.floor(totalCents / quantity);
  const remainder = totalCents % quantity;
  return Array.from({ length: quantity }, (_item, index) => base + (index < remainder ? 1 : 0));
}

export function normalizeBnccCode(value) {
  const code = String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return code.length >= 6 && code.length <= 20 ? code : null;
}

export function normalizeBnccSkills(value, legacy = "") {
  const source = Array.isArray(value) && value.length
    ? value
    : String(value || legacy || "").split(/[\s,;|]+/).filter(Boolean);
  const seen = new Set();
  const result = [];
  for (const item of source) {
    const code = normalizeBnccCode(typeof item === "object" ? item?.codigo : item);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    result.push({ codigo: code });
  }
  return result.slice(0, 20);
}

export function normalizeResponseLines(value, fallback = DEFAULT_RESPONSE_LINES) {
  const normalizedFallback = Math.max(1, Math.min(20, Math.floor(Number(fallback) || DEFAULT_RESPONSE_LINES)));
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= 20 ? parsed : normalizedFallback;
}

function editorAlternatives(question) {
  if (Array.isArray(question.alternativasLista)) return question.alternativasLista.map(String);
  if (!Array.isArray(question.alternativas)) return [];
  return question.alternativas.map(String);
}

export function normalizeQuestionForPersistence(question, order) {
  const type = question.tipo === "discursiva" ? "discursiva" : "objetiva";
  const skills = normalizeBnccSkills(
    question.habilidadesBncc ?? question.habilidades_bncc,
    question.habilidade,
  );
  const maximumCents = Number.isInteger(question.valorMaximoCentavos)
    ? question.valorMaximoCentavos
    : centsFromValue(question.valor_maximo);
  const base = {
    ordem: order,
    tipo: type,
    enunciado: String(question.enunciado || ""),
    alternativas: null,
    correta: null,
    habilidade: skills.map(item => item.codigo).join(", ")
      || String(question.habilidade || "").trim() || null,
    habilidades_bncc: skills.map(item => item.codigo),
    valor_maximo: databaseDecimalFromCents(maximumCents),
    imagem: null,
  };
  if (type === "discursiva") return base;
  return {
    ...base,
    alternativas: editorAlternatives(question),
    correta: LETTERS.includes(String(question.correta || "").toUpperCase())
      ? String(question.correta).toUpperCase()
      : null,
  };
}

export function buildSaveActivityArguments(activity) {
  const totalCents = Number.isInteger(activity.valorTotalCentavos)
    ? activity.valorTotalCentavos
    : centsFromValue(activity.valor_total);
  const activityPayload = {
    disciplina: String(activity.disciplina || "").trim(),
    serie: String(activity.serie || "").trim(),
    titulo: activity.titulo == null ? null : String(activity.titulo),
    rascunho: activity.rascunho === true,
    valor_total: databaseDecimalFromCents(totalCents),
    textos_base: Array.isArray(activity.textosBase) ? activity.textosBase : [],
    revisao_ia: {
      revisada_por_humano: activity.humanReview?.status === "approved",
      pessoa_revisora: activity.humanReview?.reviewer || null,
      aviso_normalizacao: activity.aviso || null,
    },
  };
  if (activity.rascunhoId) activityPayload.id = String(activity.rascunhoId);
  return {
    p_atividade: activityPayload,
    p_questoes: (activity.questoes || []).map((question, index) =>
      normalizeQuestionForPersistence(question, index + 1)),
  };
}

export function validateQuestionsForPersistence(questions) {
  const errors = [];
  for (const question of questions || []) {
    if (!String(question.enunciado || "").replace(/<[^>]*>/g, " ").trim()) {
      errors.push(`Questão ${question.ordem}: escreva o enunciado.`);
      continue;
    }
    if (question.tipo === "discursiva") continue;
    const alternatives = Array.isArray(question.alternativasLista)
      ? question.alternativasLista
      : question.alternativas;
    if (!Array.isArray(alternatives) || alternatives.length < 2 || alternatives.length > 5) {
      errors.push(`Questão ${question.ordem}: informe de 2 a 5 alternativas.`);
      continue;
    }
    const correctIndex = LETTERS.indexOf(String(question.correta || ""));
    if (correctIndex < 0 || correctIndex >= alternatives.length) {
      errors.push(`Questão ${question.ordem}: marque uma resposta correta válida.`);
    }
  }
  return errors;
}

export function validateActivityScoring(activity, { finalize = false } = {}) {
  const errors = [];
  const total = Number.isInteger(activity?.valorTotalCentavos)
    ? activity.valorTotalCentavos
    : centsFromValue(activity?.valor_total);
  const rawTotal = activity?.valor_total ?? activity?.valorTotalCentavos;
  const totalWasProvided = rawTotal !== null && rawTotal !== undefined && String(rawTotal).trim() !== "";
  if (totalWasProvided && (total === null || total <= 0)) {
    errors.push("Informe um valor total válido, maior que zero, com no máximo duas casas decimais.");
    return errors;
  }
  if (!finalize || total === null) return errors;
  const values = (activity.questoes || []).map(question =>
    Number.isInteger(question.valorMaximoCentavos)
      ? question.valorMaximoCentavos
      : centsFromValue(question.valor_maximo));
  const pending = values.filter(value => value === null || value <= 0).length;
  if (pending) {
    errors.push(`${pending} questão(ões) ainda precisam de um valor válido antes da finalização.`);
    return errors;
  }
  const sum = values.reduce((accumulator, value) => accumulator + value, 0);
  if (sum < total) errors.push(`Falta distribuir ${formatCents(total - sum)} ponto(s).`);
  if (sum > total) errors.push(`A distribuição excede o total em ${formatCents(sum - total)} ponto(s).`);
  return errors;
}

/** Composição criada para a demonstração; a RPC real continua sendo a autoridade em produção. */
export function validateActivityContract(activity, { finalize = true } = {}) {
  const payload = buildSaveActivityArguments(activity);
  const errors = [];
  if (!payload.p_atividade.disciplina) errors.push("Informe a disciplina.");
  if (!payload.p_atividade.serie) errors.push("Informe a série.");
  if (!payload.p_atividade.titulo?.trim()) errors.push("Informe o título.");
  if (!payload.p_questoes.length) errors.push("Adicione ao menos uma questão.");
  errors.push(...validateQuestionsForPersistence(payload.p_questoes));
  errors.push(...validateActivityScoring(activity, { finalize }));
  if (activity.humanReview?.status !== "approved") {
    errors.push("A atividade simulada precisa de revisão humana aprovada.");
  }
  return { valid: errors.length === 0, errors, payload };
}
