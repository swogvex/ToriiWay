// Persistence behind an interface: Postgres (Drizzle) in production, memory in tests and e2e.

import type { AnswerRow, RunRecord, RunStatus } from './run';
import type { JlptLevel } from './types';

export type Rating = 'easy' | 'right' | 'hard';

export type ReportCategory = 'typo' | 'answer' | 'audio' | 'other';

export interface Report {
  id: string;
  questionId: string;
  runId: string | null;
  category: ReportCategory;
  message: string;
  /** Epoch milliseconds. */
  createdAt: number;
  status: 'open' | 'resolved';
}

export interface CleanupResult {
  emails: number;
  runs: number;
  limits: number;
  reports: number;
}

export interface RecentRun {
  nickname: string;
  level: JlptLevel;
  passed: boolean;
  /** Epoch milliseconds. */
  finishedAt: number;
}

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
  /** Sets the report name of a finished run. False when the run is not finished. */
  setName(runId: string, name: string | null): Promise<boolean>;
  createReport(report: Report): Promise<void>;
  /** Open reports first, newest first. */
  listReports(limit: number): Promise<Report[]>;
  /** Marks a report as resolved; false when it does not exist. */
  resolveReport(id: string): Promise<boolean>;
  /** Records the results email of a run and when it was sent. */
  setEmail(runId: string, email: string, sentAt: number): Promise<void>;
  /**
   * Clears emails sent before `emailsBefore`, deletes runs expired before `now`, old rate
   * limits, and resolved reports sent before `reportsBefore`.
   */
  cleanup(
    now: number,
    emailsBefore: number,
    limitsBefore: number,
    reportsBefore: number,
  ): Promise<CleanupResult>;
  /** Latest finished runs that opted in to the public list. */
  recentPublic(limit: number): Promise<RecentRun[]>;
  /** Finished runs of a level, and how many of them scored below `total`. */
  percentile(level: JlptLevel, total: number): Promise<{ runs: number; below: number }>;
  /** Hits counted so far in the current window, without adding one. */
  peekLimit(key: string, windowMs: number, now: number): Promise<number>;
  /** Counts a hit in the current fixed window; false once `limit` is exceeded. */
  rateLimit(key: string, limit: number, windowMs: number, now: number): Promise<boolean>;
}

export function memoryStore(): RunStore {
  const runs = new Map<string, RunRecord>();
  const answers = new Map<string, Map<string, AnswerRow>>();
  const feedback = new Map<string, Rating>();
  /** Rate-limit buckets: hit count and the start of their window. */
  const hits = new Map<string, { count: number; start: number }>();
  const reports = new Map<string, Report>();
  const emails = new Map<string, { email: string; sentAt: number }>();

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
    async setName(runId, name) {
      const run = runs.get(runId);
      if (!run || run.status !== 'finished') return false;
      run.name = name;
      return true;
    },
    async setEmail(runId, email, sentAt) {
      emails.set(runId, { email, sentAt });
    },
    async cleanup(now, emailsBefore, limitsBefore, reportsBefore) {
      let cleared = 0;
      for (const [runId, entry] of emails) {
        if (entry.sentAt < emailsBefore) {
          emails.delete(runId);
          cleared += 1;
        }
      }
      let deleted = 0;
      for (const [runId, run] of runs) {
        if (run.expiresAt <= now) {
          runs.delete(runId);
          answers.delete(runId);
          emails.delete(runId);
          deleted += 1;
        }
      }
      let limits = 0;
      for (const [bucket, entry] of hits) {
        if (entry.start < limitsBefore) {
          hits.delete(bucket);
          limits += 1;
        }
      }
      let resolved = 0;
      for (const [id, report] of reports) {
        if (report.status === 'resolved' && report.createdAt < reportsBefore) {
          reports.delete(id);
          resolved += 1;
        }
      }
      return { emails: cleared, runs: deleted, limits, reports: resolved };
    },
    async createReport(report) {
      reports.set(report.id, { ...report });
    },
    async listReports(limit) {
      return [...reports.values()]
        .sort((a, b) =>
          a.status === b.status ? b.createdAt - a.createdAt : a.status === 'open' ? -1 : 1,
        )
        .slice(0, limit);
    },
    async resolveReport(id) {
      const report = reports.get(id);
      if (!report) return false;
      report.status = 'resolved';
      return true;
    },
    async recentPublic(limit) {
      return [...runs.values()]
        .filter((run) => run.isPublic && run.status === 'finished' && run.nickname && run.scores)
        .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0))
        .slice(0, limit)
        .map((run) => ({
          nickname: run.nickname ?? '',
          level: run.level,
          passed: run.scores?.passed ?? false,
          finishedAt: run.finishedAt ?? 0,
        }));
    },
    async percentile(level, total) {
      const finished = [...runs.values()].filter(
        (run) => run.level === level && run.status === 'finished' && run.scores,
      );
      return {
        runs: finished.length,
        below: finished.filter((run) => (run.scores?.total ?? 0) < total).length,
      };
    },
    async peekLimit(key, windowMs, now) {
      return hits.get(`${key}/${Math.floor(now / windowMs)}`)?.count ?? 0;
    },
    async rateLimit(key, limit, windowMs, now) {
      const bucket = `${key}/${Math.floor(now / windowMs)}`;
      const count = (hits.get(bucket)?.count ?? 0) + 1;
      hits.set(bucket, { count, start: Math.floor(now / windowMs) * windowMs });
      return count <= limit;
    },
  };
}
