// Leaderboard persistence behind an interface: Postgres (Drizzle) in production, memory in tests and e2e.

import { boardOrder } from './ranking';
import type {
  BoardFilter,
  Combo,
  GameNameRecord,
  GameReport,
  GameRunRecord,
  RankKey,
  ScoreRecord,
} from './types';

/** Open reports that hide an entry until it is reviewed (13-security). */
export const AUTO_HIDE_REPORTS = 3;

export interface GameCleanupResult {
  runs: number;
}

export interface GameStore {
  createRun(run: GameRunRecord): Promise<void>;
  getRun(id: string): Promise<GameRunRecord | null>;
  /** Marks a run as used; false when it was already used (lost a race). */
  useRun(id: string, at: number): Promise<boolean>;
  getName(nameNormalized: string): Promise<GameNameRecord | null>;
  /** Claims a free name; returns whoever owns it afterwards. */
  claimName(name: GameNameRecord): Promise<GameNameRecord>;
  /** The entry of a name in a combination, if any. */
  getEntry(nameNormalized: string, combo: Combo): Promise<ScoreRecord | null>;
  getScore(id: string): Promise<ScoreRecord | null>;
  /** Inserts the entry, or replaces the one with the same name and combination (keeping its ID). */
  saveScore(score: ScoreRecord): Promise<ScoreRecord>;
  deleteScore(id: string): Promise<boolean>;
  /** Visible entries for a board, in board order. */
  listScores(filter: BoardFilter, offset: number, limit: number): Promise<ScoreRecord[]>;
  /** Visible entries on a board. */
  countScores(filter: BoardFilter): Promise<number>;
  /** Visible entries listed before `key` on a board (ties included, see rankAmong). */
  countAhead(filter: BoardFilter, key: RankKey): Promise<number>;
  /** Saves a report and counts it on the entry; hides the entry at AUTO_HIDE_REPORTS open reports. */
  addReport(report: GameReport): Promise<void>;
  /** Deletes unused runs created before `unusedBefore` and used runs used before `usedBefore`. */
  cleanup(unusedBefore: number, usedBefore: number): Promise<GameCleanupResult>;
}

export function matchesFilter(score: Combo, filter: BoardFilter): boolean {
  return (
    (filter.script === null || score.script === filter.script) &&
    (filter.difficulty === null || score.difficulty === filter.difficulty) &&
    (filter.mode === null || score.mode === filter.mode)
  );
}

const sameCombo = (a: Combo, b: Combo) =>
  a.script === b.script && a.difficulty === b.difficulty && a.mode === b.mode;

export function memoryGameStore(): GameStore {
  const runs = new Map<string, GameRunRecord>();
  const names = new Map<string, GameNameRecord>();
  const scores = new Map<string, ScoreRecord>();
  const reports = new Map<string, GameReport>();

  const visible = (filter: BoardFilter) =>
    [...scores.values()].filter(
      (score) => score.status === 'visible' && matchesFilter(score, filter),
    );

  return {
    async createRun(run) {
      runs.set(run.id, { ...run });
    },
    async getRun(id) {
      const run = runs.get(id);
      return run ? { ...run } : null;
    },
    async useRun(id, at) {
      const run = runs.get(id);
      if (!run || run.usedAt !== null) return false;
      run.usedAt = at;
      return true;
    },
    async getName(nameNormalized) {
      const name = names.get(nameNormalized);
      return name ? { ...name } : null;
    },
    async claimName(name) {
      const owner = names.get(name.nameNormalized) ?? { ...name };
      names.set(name.nameNormalized, owner);
      return { ...owner };
    },
    async getEntry(nameNormalized, combo) {
      const entry = [...scores.values()].find(
        (score) => score.nameNormalized === nameNormalized && sameCombo(score, combo),
      );
      return entry ? structuredClone(entry) : null;
    },
    async getScore(id) {
      const score = scores.get(id);
      return score ? structuredClone(score) : null;
    },
    async saveScore(score) {
      const existing = [...scores.values()].find(
        (stored) => stored.nameNormalized === score.nameNormalized && sameCombo(stored, score),
      );
      const saved = { ...structuredClone(score), id: existing?.id ?? score.id };
      scores.set(saved.id, saved);
      return structuredClone(saved);
    },
    async deleteScore(id) {
      for (const [reportId, report] of reports) {
        if (report.scoreId === id) reports.delete(reportId);
      }
      return scores.delete(id);
    },
    async listScores(filter, offset, limit) {
      return visible(filter)
        .sort(boardOrder(filter.mode, filter.sort))
        .slice(offset, offset + limit)
        .map((score) => structuredClone(score));
    },
    async countScores(filter) {
      return visible(filter).length;
    },
    async countAhead(filter, key) {
      const compare = boardOrder(filter.mode, filter.sort);
      return visible(filter).filter((score) => compare(score, key) <= 0).length;
    },
    async addReport(report) {
      const score = scores.get(report.scoreId);
      if (!score) return;
      reports.set(report.id, { ...report });
      score.reports += 1;
      const open = [...reports.values()].filter(
        (stored) => stored.scoreId === score.id && stored.status === 'open',
      ).length;
      if (open >= AUTO_HIDE_REPORTS) score.status = 'hidden';
    },
    async cleanup(unusedBefore, usedBefore) {
      let deleted = 0;
      for (const [id, run] of runs) {
        const stale =
          run.usedAt === null ? run.serverStart < unusedBefore : run.usedAt < usedBefore;
        if (stale) {
          runs.delete(id);
          deleted += 1;
        }
      }
      return { runs: deleted };
    },
  };
}
