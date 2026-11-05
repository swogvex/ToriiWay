// Kana Rush leaderboard API (08-spec-game: "Public leaderboard", 13-security: "Kana Rush leaderboard").

import { z } from 'astro/zod';

import { DIFFICULTIES, GAME_SCRIPTS, MODES } from '../../game/config';
import { nameProblem, normalizeName } from '../game/leaderboard/names';
import { isBetter } from '../game/leaderboard/ranking';
import type { GameStore, ModerationAction } from '../game/leaderboard/store';
import type {
  BoardFilter,
  Combo,
  PublicScore,
  RankKey,
  ScoreRecord,
} from '../game/leaderboard/types';
import { type ItemLookup, RUN_TTL_MS, verifyRun } from '../game/leaderboard/verify';
import { assertSameOrigin, HttpError, json, readJson } from './http';
import { sameText } from './password';

export interface GameDeps {
  store: GameStore;
  site: URL;
  now: () => number;
  /** Route-independent key for the caller (hashed IP). */
  clientKey: () => Promise<string>;
  newId: () => string;
  newSeed: () => number;
  /** Checks a Turnstile token for this request. */
  verifyHuman: (token: string) => Promise<boolean>;
  /** Counts a hit in a fixed window; false once `limit` is exceeded (shared rate_limits table). */
  rateLimit: (key: string, limit: number, windowMs: number) => Promise<boolean>;
  /** Item texts a run of a combination can show. */
  items: ItemLookup;
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Limits per IP (13-security). */
export const LIMITS = {
  runs: { limit: 60, window: HOUR },
  submit: { limit: 10, window: HOUR },
  read: { limit: 120, window: MINUTE },
  remove: { limit: 20, window: HOUR },
  report: { limit: 5, window: HOUR },
} as const;

export const PAGE_SIZE = 50;
/** Deepest offset a cursor can reach; nobody pages through 10,000 rows. */
const MAX_OFFSET = 10_000;
/** Used runs are kept a day for replay checks; the unique run_id on scores covers later. */
const USED_RUN_TTL_MS = DAY;

const script = z.enum(GAME_SCRIPTS);
const difficulty = z.enum(DIFFICULTIES);
const mode = z.enum(MODES);
/** 256-bit browser token as hex (tw:v1:submitter). */
const submitterToken = z.string().regex(/^[0-9a-f]{64}$/);
const count = z.number().int().min(0).max(100_000);
const metric = z.number().min(0).max(1000);

const runBody = z.strictObject({ script, difficulty, mode });

const scoreBody = z.strictObject({
  runId: z.uuid(),
  name: z.string().max(32),
  submitter: submitterToken,
  turnstile: z.string().min(1).max(2048),
  script,
  difficulty,
  mode,
  status: z.enum(['cleared', 'failed']),
  duration: z
    .number()
    .positive()
    .max(RUN_TTL_MS / 1000),
  samples: z.array(z.tuple([count, count])).max(RUN_TTL_MS / 1000 + 1),
  correctKeys: count,
  wrongKeys: count,
  popped: count,
  missed: count,
  items: z.array(z.string().min(1).max(64)).max(500),
  wpm: metric,
  rawWpm: metric,
  accuracy: metric,
  consistency: metric,
});

const reportBody = z.strictObject({
  reason: z.enum(['name', 'score']),
  turnstile: z.string().min(1).max(2048),
});

const boardQuery = z.strictObject({
  script: script.optional(),
  difficulty: difficulty.optional(),
  mode: mode.optional(),
  sort: z.enum(['longest', 'shortest']).optional(),
  cursor: z
    .string()
    .regex(/^\d{1,5}$/)
    .optional(),
});

const rankQuery = z.strictObject({
  script,
  difficulty,
  mode,
  cleared: z.enum(['true', 'false']),
  wpm: z.coerce.number().min(0).max(1000),
  accuracy: z.coerce.number().min(0).max(100),
  duration: z.coerce
    .number()
    .int()
    .min(0)
    .max(RUN_TTL_MS / 1000),
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Bodies over the shared 32 KB limit: an hour of samples fits in 64 KB. */
export const SCORE_BODY_BYTES = 64 * 1024;

function parseQuery<T extends z.ZodType>(url: URL, schema: T): z.infer<T> {
  const parsed = schema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) throw new HttpError('bad-request', 400, parsed.error.message);
  return parsed.data;
}

async function limit(deps: GameDeps, route: keyof typeof LIMITS, extra = ''): Promise<void> {
  const { limit: max, window } = LIMITS[route];
  const key = `game-${route}:${await deps.clientKey()}${extra}`;
  if (!(await deps.rateLimit(key, max, window))) throw new HttpError('too-many-requests', 429);
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

const comboFilter = (combo: Combo): BoardFilter => ({ ...combo, sort: 'longest' });

/**
 * Entries at or ahead of `key` on its combination's board: the rank of a stored entry
 * (it counts itself), or one less than the rank a new run would take.
 */
async function rankInCombo(deps: GameDeps, combo: Combo, key: RankKey): Promise<number> {
  return deps.store.countAhead(comboFilter(combo), key);
}

function toPublic(score: ScoreRecord, rank: number): PublicScore {
  return {
    id: score.id,
    rank,
    name: score.name,
    script: score.script,
    difficulty: score.difficulty,
    mode: score.mode,
    cleared: score.cleared,
    durationS: score.durationS,
    wpm: score.wpm,
    rawWpm: score.rawWpm,
    accuracy: score.accuracy,
    consistency: score.consistency,
    popped: score.popped,
    missed: score.missed,
    series: score.series,
    errors: score.errors,
    createdAt: score.createdAt,
  };
}

/** POST /api/game/runs — a single-use run with a server seed, at the countdown. */
export async function createRunHandler(request: Request, deps: GameDeps): Promise<Response> {
  assertSameOrigin(request, deps.site);
  const body = await readJson(request, runBody);
  await limit(deps, 'runs');
  const run = {
    id: deps.newId(),
    seed: deps.newSeed(),
    ...body,
    serverStart: deps.now(),
    usedAt: null,
  };
  await deps.store.createRun(run);
  return json({ runId: run.id, seed: run.seed, serverStart: run.serverStart }, 201);
}

/** POST /api/game/scores — submit a finished run under a name this browser owns. */
export async function submitScoreHandler(request: Request, deps: GameDeps): Promise<Response> {
  assertSameOrigin(request, deps.site);
  const body = await readJson(request, scoreBody, SCORE_BODY_BYTES);
  await limit(deps, 'submit');
  if (!(await deps.verifyHuman(body.turnstile))) throw new HttpError('forbidden', 403, 'turnstile');

  if (nameProblem(body.name)) return json({ error: 'name-invalid' }, 422);
  const nameNormalized = normalizeName(body.name);
  const submitterHash = await sha256Hex(body.submitter);
  const owner = await deps.store.getName(nameNormalized);
  if (owner?.blocked) return json({ error: 'name-invalid' }, 422);
  if (owner && !sameText(owner.submitterHash, submitterHash)) {
    return json({ error: 'name-taken' }, 409);
  }

  const now = deps.now();
  const run = await deps.store.getRun(body.runId);
  const items = await deps.items(body, body.duration);
  const verified = verifyRun(body, run, now, items);
  if (!verified.ok) {
    console.warn(`[api] invalid-run: ${verified.reason}`);
    return json({ error: 'invalid-run' }, 422);
  }

  const combo: Combo = { script: body.script, difficulty: body.difficulty, mode: body.mode };
  const candidate = { ...verified.run, createdAt: now };
  const existing = await deps.store.getEntry(nameNormalized, combo);
  if (existing && !isBetter(candidate, existing, combo.mode)) {
    const rank = existing.status === 'visible' ? await rankInCombo(deps, combo, existing) : null;
    return json({ error: 'not-better', rank }, 409);
  }

  const claimed = await deps.store.claimName({
    nameNormalized,
    submitterHash,
    blocked: false,
    createdAt: now,
  });
  if (!sameText(claimed.submitterHash, submitterHash)) return json({ error: 'name-taken' }, 409);
  if (!(await deps.store.useRun(body.runId, now))) {
    console.warn('[api] invalid-run: run used concurrently');
    return json({ error: 'invalid-run' }, 422);
  }

  const saved = await deps.store.saveScore({
    id: deps.newId(),
    runId: body.runId,
    name: body.name,
    nameNormalized,
    submitterHash,
    ...combo,
    ...verified.run,
    // A better run does not undo moderation: hidden entries stay hidden, reports stay counted.
    status: existing?.status ?? 'visible',
    reports: existing?.reports ?? 0,
    createdAt: now,
  });
  const rank = saved.status === 'visible' ? await rankInCombo(deps, combo, saved) : null;
  return json({ id: saved.id, rank }, 201);
}

/** GET /api/game/leaderboard — 50 entries per page, cached 30 s at the edge. */
export async function leaderboardHandler(url: URL, deps: GameDeps): Promise<Response> {
  const query = parseQuery(url, boardQuery);
  await limit(deps, 'read');
  const offset = Number(query.cursor ?? 0);
  if (offset > MAX_OFFSET) throw new HttpError('bad-request', 400, 'cursor too deep');
  const filter: BoardFilter = {
    script: query.script ?? null,
    difficulty: query.difficulty ?? null,
    mode: query.mode ?? null,
    sort: query.mode === 'endless' ? (query.sort ?? 'longest') : 'longest',
  };
  const [rows, total] = await Promise.all([
    deps.store.listScores(filter, offset, PAGE_SIZE + 1),
    deps.store.countScores(filter),
  ]);
  const entries = rows.slice(0, PAGE_SIZE).map((row, index) => toPublic(row, offset + index + 1));
  const next = rows.length > PAGE_SIZE ? String(offset + PAGE_SIZE) : null;
  return new Response(JSON.stringify({ entries, next, total }), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=30',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

/** GET /api/game/leaderboard/rank — the place a run would take in its combination. */
export async function rankHandler(url: URL, deps: GameDeps): Promise<Response> {
  const query = parseQuery(url, rankQuery);
  await limit(deps, 'read');
  const combo: Combo = { script: query.script, difficulty: query.difficulty, mode: query.mode };
  const ahead = await rankInCombo(deps, combo, {
    cleared: query.cleared === 'true',
    wpm: query.wpm,
    accuracy: query.accuracy,
    durationS: query.duration,
    createdAt: deps.now(),
  });
  return json({ rank: ahead + 1 });
}

/** DELETE /api/game/scores/[id] — "Remove my run", proven by the browser's token. */
export async function deleteScoreHandler(
  request: Request,
  id: string,
  deps: GameDeps,
): Promise<Response> {
  assertSameOrigin(request, deps.site);
  await limit(deps, 'remove');
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!submitterToken.safeParse(token).success) throw new HttpError('forbidden', 401);
  if (!UUID.test(id)) throw new HttpError('not-found', 404);
  const score = await deps.store.getScore(id);
  if (!score) throw new HttpError('not-found', 404);
  if (!sameText(score.submitterHash, await sha256Hex(token))) {
    throw new HttpError('forbidden', 403, 'token mismatch');
  }
  await deps.store.deleteScore(id);
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}

/** POST /api/game/scores/[id]/report — offensive name or suspicious score. */
export async function reportScoreHandler(
  request: Request,
  id: string,
  deps: GameDeps,
): Promise<Response> {
  assertSameOrigin(request, deps.site);
  const body = await readJson(request, reportBody);
  if (!UUID.test(id)) throw new HttpError('not-found', 404);
  await limit(deps, 'report');
  if (!(await deps.verifyHuman(body.turnstile))) throw new HttpError('forbidden', 403, 'turnstile');
  const score = await deps.store.getScore(id);
  if (!score || score.status !== 'visible') throw new HttpError('not-found', 404);
  // One report per entry per IP and day, so a single person cannot hide an entry alone.
  const key = await deps.clientKey();
  if (!(await deps.rateLimit(`game-report-entry:${key}:${id}`, 1, DAY))) {
    return json({ ok: true }, 202);
  }
  await deps.store.addReport({
    id: deps.newId(),
    scoreId: id,
    reason: body.reason,
    status: 'open',
    createdAt: deps.now(),
  });
  return json({ ok: true }, 201);
}

const MODERATION_ACTIONS: readonly ModerationAction[] = ['hide', 'show', 'delete', 'block'];

/**
 * POST /api/admin/game-scores/[id] — plain form post from /admin/leaderboard (Basic auth in
 * the middleware, same origin here). Answers with a redirect back to the list.
 */
export async function adminScoreHandler(
  request: Request,
  id: string,
  deps: Pick<GameDeps, 'store' | 'site'>,
): Promise<Response> {
  assertSameOrigin(request, deps.site);
  if (!UUID.test(id)) throw new HttpError('not-found', 404);
  let action: string;
  try {
    action = String((await request.formData()).get('action') ?? '');
  } catch {
    throw new HttpError('bad-request', 400, 'form');
  }
  if (!MODERATION_ACTIONS.includes(action as ModerationAction)) {
    throw new HttpError('bad-request', 400, `action ${action}`);
  }
  if (!(await deps.store.moderate(id, action as ModerationAction))) {
    throw new HttpError('not-found', 404);
  }
  return new Response(null, {
    status: 303,
    headers: { Location: '/admin/leaderboard', 'Cache-Control': 'no-store' },
  });
}

/** Part of the daily cron: unused runs after their 2 h life, used runs a day after use. */
export async function gameCleanup(deps: Pick<GameDeps, 'store' | 'now'>) {
  const now = deps.now();
  return deps.store.cleanup(now - RUN_TTL_MS, now - USED_RUN_TTL_MS);
}
