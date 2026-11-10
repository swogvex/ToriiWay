import { neon } from '@neondatabase/serverless';
import { and, desc, eq, isNotNull, lt, lte, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-http';

import type { RunRecord } from '../lib/jlpt/run';
import type { Report, RunStore } from '../lib/jlpt/store';
import type { JlptLevel } from '../lib/jlpt/types';
import { jlptAnswers, jlptFeedback, jlptRuns, rateLimits, reports } from './schema';

type RunRow = typeof jlptRuns.$inferSelect;

const ms = (date: Date | null) => (date ? date.getTime() : null);
const date = (value: number | null) => (value === null ? null : new Date(value));

function toRecord(row: RunRow): RunRecord {
  return {
    id: row.id,
    level: row.level as JlptLevel,
    seed: row.seed,
    status: row.status as RunRecord['status'],
    section: row.section,
    sectionStartsAt: row.sectionStartsAt.getTime(),
    deadline: row.deadline.getTime(),
    breakStartedAt: ms(row.breakStartedAt),
    results: row.results,
    isPublic: row.isPublic,
    name: row.name,
    nickname: row.nickname,
    createdAt: row.createdAt.getTime(),
    finishedAt: ms(row.finishedAt),
    expiresAt: row.expiresAt.getTime(),
    scores: row.scores ?? null,
  };
}

/** Every column that a transition can change. */
/** Every column that a transition can change (the email columns have their own writer). */
function runValues(
  run: RunRecord,
): Omit<RunRow, 'id' | 'nickname' | 'name' | 'email' | 'emailSentAt'> {
  return {
    level: run.level,
    seed: run.seed,
    status: run.status,
    section: run.section,
    sectionStartsAt: new Date(run.sectionStartsAt),
    deadline: new Date(run.deadline),
    breakStartedAt: date(run.breakStartedAt),
    results: run.results,
    isPublic: run.isPublic,
    createdAt: new Date(run.createdAt),
    finishedAt: date(run.finishedAt),
    expiresAt: new Date(run.expiresAt),
    scores: run.scores,
    passed: run.scores?.passed ?? null,
  };
}

function toRow(run: RunRecord): RunRow {
  return {
    id: run.id,
    nickname: run.nickname,
    name: run.name,
    email: null,
    emailSentAt: null,
    ...runValues(run),
  };
}

export function drizzleStore(databaseUrl: string): RunStore {
  const db = drizzle(neon(databaseUrl));

  return {
    async createRun(run) {
      await db.insert(jlptRuns).values(toRow(run));
    },
    async getRun(id) {
      const [row] = await db.select().from(jlptRuns).where(eq(jlptRuns.id, id)).limit(1);
      return row ? toRecord(row) : null;
    },
    async saveRun(run, from) {
      const updated = await db
        .update(jlptRuns)
        .set(runValues(run))
        .where(
          and(
            eq(jlptRuns.id, run.id),
            eq(jlptRuns.status, from.status),
            eq(jlptRuns.section, from.section),
          ),
        )
        .returning({ id: jlptRuns.id });
      return updated.length === 1;
    },
    async insertAnswers(runId, rows) {
      if (rows.length === 0) return;
      await db
        .insert(jlptAnswers)
        .values(rows.map((row) => ({ runId, ...row })))
        .onConflictDoNothing();
    },
    async getAnswers(runId) {
      return db
        .select({
          section: jlptAnswers.section,
          questionId: jlptAnswers.questionId,
          choice: jlptAnswers.choice,
          correct: jlptAnswers.correct,
        })
        .from(jlptAnswers)
        .where(eq(jlptAnswers.runId, runId));
    },
    async saveFeedback(runId, section, rating) {
      await db
        .insert(jlptFeedback)
        .values({ runId, section, rating })
        .onConflictDoUpdate({
          target: [jlptFeedback.runId, jlptFeedback.section],
          set: { rating },
        });
    },
    async setName(runId, name) {
      const updated = await db
        .update(jlptRuns)
        .set({ name })
        .where(and(eq(jlptRuns.id, runId), eq(jlptRuns.status, 'finished')))
        .returning({ id: jlptRuns.id });
      return updated.length === 1;
    },
    async setEmail(runId, email, sentAt) {
      await db
        .update(jlptRuns)
        .set({ email, emailSentAt: new Date(sentAt) })
        .where(eq(jlptRuns.id, runId));
    },
    async cleanup(now, emailsBefore, limitsBefore, reportsBefore) {
      const emails = await db
        .update(jlptRuns)
        .set({ email: null })
        .where(and(isNotNull(jlptRuns.email), lt(jlptRuns.emailSentAt, new Date(emailsBefore))))
        .returning({ id: jlptRuns.id });
      const runs = await db
        .delete(jlptRuns)
        .where(lte(jlptRuns.expiresAt, new Date(now)))
        .returning({ id: jlptRuns.id });
      const limits = await db
        .delete(rateLimits)
        .where(lt(rateLimits.windowStart, new Date(limitsBefore)))
        .returning({ key: rateLimits.key });
      const resolved = await db
        .delete(reports)
        .where(and(eq(reports.status, 'resolved'), lt(reports.createdAt, new Date(reportsBefore))))
        .returning({ id: reports.id });
      return {
        emails: emails.length,
        runs: runs.length,
        limits: limits.length,
        reports: resolved.length,
      };
    },
    async createReport(report) {
      await db.insert(reports).values({ ...report, createdAt: new Date(report.createdAt) });
    },
    async listReports(limit) {
      const rows = await db
        .select()
        .from(reports)
        .orderBy(sql`${reports.status} = 'resolved'`, desc(reports.createdAt))
        .limit(limit);
      return rows.map((row) => ({
        ...row,
        category: row.category as Report['category'],
        status: row.status as Report['status'],
        createdAt: row.createdAt.getTime(),
      }));
    },
    async resolveReport(id) {
      const updated = await db
        .update(reports)
        .set({ status: 'resolved' })
        .where(eq(reports.id, id))
        .returning({ id: reports.id });
      return updated.length === 1;
    },
    async recentPublic(limit) {
      const rows = await db
        .select({
          nickname: jlptRuns.nickname,
          level: jlptRuns.level,
          passed: jlptRuns.passed,
          finishedAt: jlptRuns.finishedAt,
        })
        .from(jlptRuns)
        .where(
          and(
            eq(jlptRuns.isPublic, true),
            eq(jlptRuns.status, 'finished'),
            isNotNull(jlptRuns.nickname),
          ),
        )
        .orderBy(desc(jlptRuns.finishedAt))
        .limit(limit);
      return rows.map((row) => ({
        nickname: row.nickname ?? '',
        level: row.level as JlptLevel,
        passed: row.passed ?? false,
        finishedAt: row.finishedAt?.getTime() ?? 0,
      }));
    },
    async percentile(level, total) {
      const finished = and(eq(jlptRuns.level, level), eq(jlptRuns.status, 'finished'));
      const [row] = await db
        .select({
          runs: sql<number>`count(*)::int`,
          below: sql<number>`count(*) filter (where (${jlptRuns.scores}->>'total')::int < ${total})::int`,
        })
        .from(jlptRuns)
        .where(finished);
      return { runs: row?.runs ?? 0, below: row?.below ?? 0 };
    },
    async peekLimit(key, windowMs, now) {
      const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
      const [row] = await db
        .select({ count: rateLimits.count })
        .from(rateLimits)
        .where(and(eq(rateLimits.key, key), eq(rateLimits.windowStart, windowStart)))
        .limit(1);
      return row?.count ?? 0;
    },
    async rateLimit(key, limit, windowMs, now) {
      const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
      const [row] = await db
        .insert(rateLimits)
        .values({ key, windowStart, count: 1 })
        .onConflictDoUpdate({
          target: [rateLimits.key, rateLimits.windowStart],
          set: { count: sql`${rateLimits.count} + 1` },
        })
        .returning({ count: rateLimits.count });
      return (row?.count ?? 1) <= limit;
    },
  };
}
