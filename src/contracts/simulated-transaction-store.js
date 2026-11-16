import { validateActivityContract } from "./activity-contract.js";

/**
 * Código exclusivo da demonstração. Não implementa PostgreSQL, Supabase ou RLS.
 * O estado só é substituído após todas as etapas, simulando commit/rollback.
 */
export class SimulatedTransactionStore {
  #state = { activities: [], questions: [] };
  #nextId = 1;

  snapshot() {
    return structuredClone(this.#state);
  }

  async saveActivity(activity, { failAt = null } = {}) {
    const contract = validateActivityContract(activity, { finalize: activity.rascunho !== true });
    if (!contract.valid) {
      return { committed: false, rolledBack: true, reason: "validation", errors: contract.errors };
    }

    const staged = this.snapshot();
    const id = `demo-activity-${String(this.#nextId).padStart(3, "0")}`;
    try {
      staged.activities.push({ id, ...contract.payload.p_atividade });
      if (failAt === "after_activity") throw new Error("Falha sintética após inserir a atividade.");
      for (const question of contract.payload.p_questoes) {
        staged.questions.push({ activityId: id, ...question });
      }
      if (failAt === "after_questions") throw new Error("Falha sintética após inserir as questões.");
      this.#state = staged;
      this.#nextId += 1;
      return { committed: true, rolledBack: false, id, questionCount: contract.payload.p_questoes.length };
    } catch (error) {
      return {
        committed: false,
        rolledBack: true,
        reason: "synthetic_failure",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
