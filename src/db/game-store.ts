import { neon } from '@neondatabase/serverless';
import {
  and,
  asc,
  type Column,
  count,
  desc,
  eq,
  gt,
  gte,
  isNotNull,
  isNull,
  lt,
  lte,
  or,
  type SQL,
  sql,
} from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-http';

import type { Difficulty, GameScript, Mode } from '../game/config';
import { type AdminEntry, AUTO_HIDE_REPORTS, type GameStore } from '../lib/game/leaderboard/store';
import type {
  BoardFilter,
  GameRunRecord,
  RankKey,
  ScoreRecord,
} from '../lib/game/leaderboard/types';
import { gameNames, gameReports, gameRuns, gameScores } from './schema';

type ScoreRow = typeof gameScores.$inferSelect;
type RunRow = typeof gameRuns.$inferSelect;

function toRun(row: RunRow): GameRunRecord {
  return {
    id: row.id,
    seed: row.seed,
    script: row.script as GameScript,
    difficulty: row.difficulty as Difficulty,
    mode: row.mode as Mode,
    serverStart: row.serverStart.getTime(),
    usedAt: row.usedAt ? row.usedAt.getTime() : null,
  };
}

function toScore(row: ScoreRow): ScoreRecord {
  return {
    ...row,
    script: row.script as GameScript,
    difficulty: row.difficulty as Difficulty,
    mode: row.mode as Mode,
    status: row.status as ScoreRecord['status'],
    createdAt: row.createdAt.getTime(),
  };
}

function toRow(score: ScoreRecord): ScoreRow {
  return { ...score, createdAt: new Date(score.createdAt) };
}

/** One step of a board's order: a column, its direction and the candidate's value. */
interface OrderKey {
  column: Column;
  direction: 'asc' | 'desc';
  value: (key: RankKey) => unknown;
}

/** The board order of `ranking.ts` as SQL keys (see boardOrder). */
function orderKeys(filter: BoardFilter): OrderKey[] {
  const wpm: OrderKey = { column: gameScores.wpm, direction: 'desc', value: (key) => key.wpm };
  const accuracy: OrderKey = {
    column: gameScores.accuracy,
    direction: 'desc',
    value: (key) => key.accuracy,
  };
  const oldest: OrderKey = {
    column: gameScores.createdAt,
    direction: 'asc',
    value: (key) => new Date(key.createdAt),
  };
  if (filter.mode === 'challenge') {
    const cleared: OrderKey = {
      column: gameScores.cleared,
      direction: 'desc',
      value: (key) => key.cleared,
    };
    return [cleared, wpm, accuracy, oldest];
  }
  if (filter.mode === 'endless') {
    const survival: OrderKey = {
      column: gameScores.durationS,
      direction: filter.sort === 'shortest' ? 'asc' : 'desc',
      value: (key) => key.durationS,
    };
    return [survival, wpm, oldest];
  }
  return [wpm, accuracy, oldest];
}

function boardWhere(filter: BoardFilter): SQL | undefined {
  return and(
    eq(gameScores.status, 'visible'),
    filter.script ? eq(gameScores.script, filter.script) : undefined,
    filter.difficulty ? eq(gameScores.difficulty, filter.difficulty) : undefined,
    filter.mode ? eq(gameScores.mode, filter.mode) : undefined,
  );
}

/**
 * Rows listed before `key`, ties included: a lexicographic comparison over the
 * order keys (a better first key, or an equal first key and a better second, …).
 */
function aheadOf(keys: readonly OrderKey[], key: RankKey): SQL | undefined {
  const better = (step: OrderKey) =>
    step.direction === 'desc' ? gt(step.column, step.value(key)) : lt(step.column, step.value(key));
  const branches = keys.map((step, index) => {
    const equal = keys.slice(0, index).map((before) => eq(before.column, before.value(key)));
    const last = index === keys.length - 1;
    const own = last
      ? step.direction === 'desc'
        ? gte(step.column, step.value(key))
        : lte(step.column, step.value(key))
      : better(step);
    return and(...equal, own);
  });
  return or(...branches);
}

export function drizzleGameStore(databaseUrl: string): GameStore {
  const db = drizzle(neon(databaseUrl));

  return {
    async createRun(run) {
      await db.insert(gameRuns).values({
        ...run,
        serverStart: new Date(run.serverStart),
        usedAt: run.usedAt === null ? null : new Date(run.usedAt),
      });
    },
    async getRun(id) {
      const [row] = await db.select().from(gameRuns).where(eq(gameRuns.id, id)).limit(1);
      return row ? toRun(row) : null;
    },
    async useRun(id, at) {
      const updated = await db
        .update(gameRuns)
        .set({ usedAt: new Date(at) })
        .where(and(eq(gameRuns.id, id), isNull(gameRuns.usedAt)))
        .returning({ id: gameRuns.id });
      return updated.length === 1;
    },
    async getName(nameNormalized) {
      const [row] = await db
        .select()
        .from(gameNames)
        .where(eq(gameNames.nameNormalized, nameNormalized))
        .limit(1);
      return row ? { ...row, createdAt: row.createdAt.getTime() } : null;
    },
    async claimName(name) {
      await db
        .insert(gameNames)
        .values({ ...name, createdAt: new Date(name.createdAt) })
        .onConflictDoNothing();
      const [row] = await db
        .select()
        .from(gameNames)
        .where(eq(gameNames.nameNormalized, name.nameNormalized))
        .limit(1);
      if (!row) throw new Error('name claim lost');
      return { ...row, createdAt: row.createdAt.getTime() };
    },
    async getEntry(nameNormalized, combo) {
      const [row] = await db
        .select()
        .from(gameScores)
        .where(
          and(
            eq(gameScores.nameNormalized, nameNormalized),
            eq(gameScores.script, combo.script),
            eq(gameScores.difficulty, combo.difficulty),
            eq(gameScores.mode, combo.mode),
          ),
        )
        .limit(1);
      return row ? toScore(row) : null;
    },
    async getScore(id) {
      const [row] = await db.select().from(gameScores).where(eq(gameScores.id, id)).limit(1);
      return row ? toScore(row) : null;
    },
    async saveScore(score) {
      // On a name + combination clash, replace everything except the entry's ID.
      const replace: Partial<ScoreRow> = toRow(score);
      delete replace.id;
      const [row] = await db
        .insert(gameScores)
        .values(toRow(score))
        .onConflictDoUpdate({
          target: [
            gameScores.nameNormalized,
            gameScores.script,
            gameScores.difficulty,
            gameScores.mode,
          ],
          set: replace,
        })
        .returning();
      if (!row) throw new Error('score not saved');
      return toScore(row);
    },
    async deleteScore(id) {
      const deleted = await db
        .delete(gameScores)
        .where(eq(gameScores.id, id))
        .returning({ id: gameScores.id });
      return deleted.length === 1;
    },
    async listScores(filter, offset, limit) {
      const order = orderKeys(filter).map((step) =>
        step.direction === 'desc' ? desc(step.column) : asc(step.column),
      );
      const rows = await db
        .select()
        .from(gameScores)
        .where(boardWhere(filter))
        .orderBy(...order, asc(gameScores.id))
        .limit(limit)
        .offset(offset);
      return rows.map(toScore);
    },
    async countScores(filter) {
      const [row] = await db.select({ value: count() }).from(gameScores).where(boardWhere(filter));
      return row?.value ?? 0;
    },
    async countAhead(filter, key) {
      const [row] = await db
        .select({ value: count() })
        .from(gameScores)
        .where(and(boardWhere(filter), aheadOf(orderKeys(filter), key)));
      return row?.value ?? 0;
    },
    async addReport(report) {
      await db.insert(gameReports).values({ ...report, createdAt: new Date(report.createdAt) });
      const open = db
        .select({ value: count() })
        .from(gameReports)
        .where(and(eq(gameReports.scoreId, report.scoreId), eq(gameReports.status, 'open')));
      await db
        .update(gameScores)
        .set({
          reports: sql`${gameScores.reports} + 1`,
          status: sql`case when (${open}) >= ${AUTO_HIDE_REPORTS} then 'hidden' else ${gameScores.status} end`,
        })
        .where(eq(gameScores.id, report.scoreId));
    },
    async cleanup(unusedBefore, usedBefore, reportsBefore) {
      const deleted = await db
        .delete(gameRuns)
        .where(
          or(
            and(isNull(gameRuns.usedAt), lt(gameRuns.serverStart, new Date(unusedBefore))),
            and(isNotNull(gameRuns.usedAt), lt(gameRuns.usedAt, new Date(usedBefore))),
          ),
        )
        .returning({ id: gameRuns.id });
      const resolved = await db
        .delete(gameReports)
        .where(
          and(
            eq(gameReports.status, 'resolved'),
            lt(gameReports.createdAt, new Date(reportsBefore)),
          ),
        )
        .returning({ id: gameReports.id });
      return { runs: deleted.length, reports: resolved.length };
    },
    async adminList(limit) {
      const openReports = sql<number>`(count(${gameReports.id}) filter (where ${gameReports.status} = 'open'))::int`;
      const rows = await db
        .select({
          score: gameScores,
          openReports,
          reasons: sql<
            string[]
          >`coalesce(array_agg(${gameReports.reason}) filter (where ${gameReports.status} = 'open'), '{}')`,
          nameBlocked: gameNames.blocked,
        })
        .from(gameScores)
        .innerJoin(gameNames, eq(gameNames.nameNormalized, gameScores.nameNormalized))
        .leftJoin(gameReports, eq(gameReports.scoreId, gameScores.id))
        .groupBy(gameScores.id, gameNames.blocked)
        .orderBy(
          desc(openReports),
          sql`${gameScores.status} = 'visible'`,
          desc(gameScores.createdAt),
        )
        .limit(limit);
      return rows.map((row) => ({
        ...toScore(row.score),
        openReports: row.openReports,
        reasons: row.reasons as AdminEntry['reasons'],
        nameBlocked: row.nameBlocked,
      }));
    },
    async moderate(id, action) {
      const [score] = await db
        .select({ nameNormalized: gameScores.nameNormalized })
        .from(gameScores)
        .where(eq(gameScores.id, id))
        .limit(1);
      if (!score) return false;
      if (action === 'delete') {
        // Reports go with it (foreign key cascade).
        await db.delete(gameScores).where(eq(gameScores.id, id));
        return true;
      }
      const resolveFor = (scoreIds: SQL) =>
        db
          .update(gameReports)
          .set({ status: 'resolved' })
          .where(and(eq(gameReports.status, 'open'), sql`${gameReports.scoreId} in ${scoreIds}`));
      if (action === 'block') {
        const sameName = eq(gameScores.nameNormalized, score.nameNormalized);
        await db
          .update(gameNames)
          .set({ blocked: true })
          .where(eq(gameNames.nameNormalized, score.nameNormalized));
        await db.update(gameScores).set({ status: 'hidden' }).where(sameName);
        await resolveFor(sql`(select ${gameScores.id} from ${gameScores} where ${sameName})`);
        return true;
      }
      await db
        .update(gameScores)
        .set({ status: action === 'hide' ? 'hidden' : 'visible' })
        .where(eq(gameScores.id, id));
      await resolveFor(sql`(${id}::uuid)`);
      return true;
    },
    async blockedNames() {
      const rows = await db
        .select({ name: gameNames.nameNormalized })
        .from(gameNames)
        .where(eq(gameNames.blocked, true))
        .orderBy(asc(gameNames.createdAt));
      return rows.map((row) => row.name);
    },
    async unblockName(nameNormalized) {
      const updated = await db
        .update(gameNames)
        .set({ blocked: false })
        .where(and(eq(gameNames.nameNormalized, nameNormalized), eq(gameNames.blocked, true)))
        .returning({ name: gameNames.nameNormalized });
      if (updated.length === 0) return false;
      await db
        .update(gameScores)
        .set({ status: 'visible' })
        .where(eq(gameScores.nameNormalized, nameNormalized));
      return true;
    },
  };
}
