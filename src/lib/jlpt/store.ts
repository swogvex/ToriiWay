// Persistence behind an interface: Postgres (Drizzle) in production, memory in tests and e2e.

import type { AnswerRow, RunRecord, RunStatus } from './run';

export type Rating = 'easy' | 'right' | 'hard';

export interface RunStore {
  createRun(run: RunRecord): Promise<void>;
  getRun(id: string): Promise<RunRecord | null>;
  /**
   * Saves `run` only if the stored run is still at `from` (status and section), so two
   * requests cannot both apply a transition. Returns false when it lost the race.
   */
  saveRun(run: RunRecord, from: { status: RunStatus; section: number }): Promise<boolean>;
  /** Inserts answer rows; rows that already exist are kept as they are. */
  insertAnswers(runId: string, rows: readonly AnswerRow[]): Promise<void>;
  getAnswers(runId: string): Promise<AnswerRow[]>;
  saveFeedback(runId: string, section: number, rating: Rating): Promise<void>;
  /** Counts a hit in the current fixed window; false once `limit` is exceeded. */
  rateLimit(key: string, limit: number, windowMs: number, now: number): Promise<boolean>;
}

export function memoryStore(): RunStore {
  const runs = new Map<string, RunRecord>();
  const answers = new Map<string, Map<string, AnswerRow>>();
  const feedback = new Map<string, Rating>();
  const hits = new Map<string, number>();

  return {
    async createRun(run) {
      runs.set(run.id, structuredClone(run));
    },
    async getRun(id) {
      const run = runs.get(id);
      return run ? structuredClone(run) : null;
    },
    async saveRun(run, from) {
      const stored = runs.get(run.id);
      if (!stored || stored.status !== from.status || stored.section !== from.section) return false;
      runs.set(run.id, structuredClone(run));
      return true;
    },
    async insertAnswers(runId, rows) {
      const stored = answers.get(runId) ?? new Map<string, AnswerRow>();
      for (const row of rows) {
        if (!stored.has(row.questionId)) stored.set(row.questionId, { ...row });
      }
      answers.set(runId, stored);
    },
    async getAnswers(runId) {
      return [...(answers.get(runId)?.values() ?? [])];
    },
    async saveFeedback(runId, section, rating) {
      feedback.set(`${runId}/${section}`, rating);
    },
    async rateLimit(key, limit, windowMs, now) {
      const bucket = `${key}/${Math.floor(now / windowMs)}`;
      const count = (hits.get(bucket) ?? 0) + 1;
      hits.set(bucket, count);
      return count <= limit;
    },
  };
}
