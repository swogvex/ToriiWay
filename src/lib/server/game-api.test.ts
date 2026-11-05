import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fakeClaim, ITEMS, NOW } from '../game/leaderboard/fixtures';
import { AUTO_HIDE_REPORTS, memoryGameStore } from '../game/leaderboard/store';
import type { RunClaim } from '../game/leaderboard/verify';
import {
  adminScoreHandler,
  createRunHandler,
  deleteScoreHandler,
  gameCleanup,
  type GameDeps,
  LIMITS,
  leaderboardHandler,
  PAGE_SIZE,
  rankHandler,
  reportScoreHandler,
  submitScoreHandler,
} from './game-api';
import { handle } from './http';
import { memoryStore } from '../jlpt/store';

const SITE = 'https://toriiway.xyz';
const ALICE = 'a'.repeat(64);
const BOB = 'b'.repeat(64);

let deps: GameDeps;
let clock: number;
let client: string;
let ids: number;

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  clock = NOW - 160_000;
  client = 'client-a';
  ids = 0;
  const limits = memoryStore();
  deps = {
    store: memoryGameStore(),
    site: new URL(SITE),
    now: () => clock,
    clientKey: async () => client,
    newId: () => `00000000-0000-4000-8000-${String(++ids).padStart(12, '0')}`,
    newSeed: () => 42,
    verifyHuman: async (token) => token === 'human',
    rateLimit: (key, limit, windowMs) => limits.rateLimit(key, limit, windowMs, clock),
    items: async () => ITEMS,
  };
});

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`${SITE}${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...headers },
  });

async function startRun(combo: Partial<RunClaim> = {}): Promise<string> {
  const response = await handle(() =>
    createRunHandler(
      post('/api/game/runs', {
        script: combo.script ?? 'hiragana',
        difficulty: combo.difficulty ?? 'normal',
        mode: combo.mode ?? 'challenge',
      }),
      deps,
    ),
  );
  expect(response.status).toBe(201);
  return ((await response.json()) as { runId: string }).runId;
}

/** Starts a run just long enough ago for its duration, then submits it now. */
async function play(
  name: string,
  submitter: string,
  over: Partial<RunClaim> = {},
  extra: Record<string, unknown> = {},
) {
  clock = NOW - ((over.duration ?? 150) + 10) * 1000;
  const runId = await startRun(over);
  clock = NOW;
  const response = await handle(() =>
    submitScoreHandler(
      post('/api/game/scores', {
        ...fakeClaim(over),
        runId,
        name,
        submitter,
        turnstile: 'human',
        ...extra,
      }),
      deps,
    ),
  );
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

/** A slower or faster honest run: `keys` correct keys per second for 150 s. */
function pace(keys: number): Partial<RunClaim> {
  const samples = Array.from({ length: 150 }, () => [keys, 0] as const);
  const wpm = (keys * 60) / 5;
  return {
    samples,
    correctKeys: keys * 150,
    wrongKeys: 0,
    wpm,
    rawWpm: wpm,
    accuracy: 100,
    consistency: 100,
  };
}

async function board(query = '') {
  const response = await handle(() =>
    leaderboardHandler(new URL(`${SITE}/api/game/leaderboard${query}`), deps),
  );
  return {
    response,
    body: (await response.json()) as {
      entries: { id: string; name: string; rank: number; wpm: number }[];
      next: string | null;
      total: number;
    },
  };
}

describe('POST /api/game/runs', () => {
  it('hands out a single-use run with a server seed and start', async () => {
    const response = await handle(() =>
      createRunHandler(
        post('/api/game/runs', { script: 'kanji', difficulty: 'hard', mode: 'endless' }),
        deps,
      ),
    );
    expect(response.status).toBe(201);
    const body = (await response.json()) as { runId: string; seed: number; serverStart: number };
    expect(body).toMatchObject({ seed: 42, serverStart: clock });
    expect(await deps.store.getRun(body.runId)).toMatchObject({ mode: 'endless', usedAt: null });
  });

  it('validates the body, the origin and the rate limit', async () => {
    const bad = await handle(() =>
      createRunHandler(
        post('/api/game/runs', { script: 'latin', difficulty: 'normal', mode: 'challenge' }),
        deps,
      ),
    );
    expect(bad.status).toBe(400);
    const foreign = await handle(() =>
      createRunHandler(
        post(
          '/api/game/runs',
          { script: 'hiragana', difficulty: 'normal', mode: 'challenge' },
          { origin: 'https://evil.example' },
        ),
        deps,
      ),
    );
    expect(foreign.status).toBe(403);
    for (let i = 0; i < LIMITS.runs.limit; i++) await startRun();
    const limited = await handle(() =>
      createRunHandler(
        post('/api/game/runs', { script: 'hiragana', difficulty: 'normal', mode: 'challenge' }),
        deps,
      ),
    );
    expect(limited.status).toBe(429);
  });
});

describe('POST /api/game/scores', () => {
  it('puts an honest run on the board with its rank', async () => {
    const result = await play('Kenji', ALICE);
    expect(result).toMatchObject({ status: 201, body: { rank: 1 } });
    const { body } = await board();
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0]).toMatchObject({ name: 'Kenji', rank: 1, wpm: 36 });
    // Nothing that identifies a browser is public.
    expect(JSON.stringify(body)).not.toMatch(/submitter|runId|nameNormalized/);
  });

  it('keeps one entry per name and combination: a worse run does not replace a better one', async () => {
    expect((await play('Kenji', ALICE, pace(4))).status).toBe(201);
    const worse = await play('Kenji', ALICE, pace(3));
    expect(worse).toMatchObject({ status: 409, body: { error: 'not-better', rank: 1 } });
    const { body } = await board();
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0]?.wpm).toBe(48);
  });

  it('replaces the entry in place when the same player beats it', async () => {
    const first = await play('Kenji', ALICE, pace(3));
    const second = await play('kenji', ALICE, pace(5));
    expect(second.status).toBe(201);
    expect(second.body.id).toBe(first.body.id);
    const { body } = await board();
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0]).toMatchObject({ name: 'kenji', wpm: 60 });
  });

  it('gives the same name a separate entry in each combination', async () => {
    await play('Kenji', ALICE);
    await play('Kenji', ALICE, { difficulty: 'hard', ...hardClear() });
    const { body } = await board();
    expect(body.entries.map((entry) => entry.name)).toEqual(['Kenji', 'Kenji']);
    const normalOnly = await board('?difficulty=normal');
    expect(normalOnly.body.entries).toHaveLength(1);
  });

  it('never merges two people who type the same name: the second one is told it is taken', async () => {
    expect((await play('Kenji', ALICE)).status).toBe(201);
    const bob = await play('KENJI', BOB, pace(9));
    expect(bob).toMatchObject({ status: 409, body: { error: 'name-taken' } });
    const { body } = await board();
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0]?.wpm).toBe(36);
    // Bob's run was not spent: he can submit it under another name.
    expect((await play('Kenji2', BOB)).status).toBe(201);
  });

  it('rejects invalid and offensive names before checking the run', async () => {
    expect((await play('ab', ALICE)).body).toEqual({ error: 'name-invalid' });
    expect((await play('sh1t_head', ALICE)).body).toEqual({ error: 'name-invalid' });
  });

  it('answers every tampered run with the same invalid-run', async () => {
    expect((await play('Kenji', ALICE, { wpm: 99 })).body).toEqual({ error: 'invalid-run' });
    expect((await play('Kenji', ALICE, { items: ['ラーメン'] })).body).toEqual({
      error: 'invalid-run',
    });
  });

  it('accepts each run only once', async () => {
    clock = NOW - 160_000;
    const runId = await startRun();
    clock = NOW;
    const submit = (name: string) =>
      handle(() =>
        submitScoreHandler(
          post('/api/game/scores', {
            ...fakeClaim(),
            runId,
            name,
            submitter: ALICE,
            turnstile: 'human',
          }),
          deps,
        ),
      );
    expect((await submit('Kenji')).status).toBe(201);
    const replay = await submit('Kenji_two');
    expect(replay.status).toBe(422);
  });

  it('requires a human and a well-formed submitter token', async () => {
    expect((await play('Kenji', ALICE, {}, { turnstile: 'bot' })).status).toBe(403);
    expect((await play('Kenji', 'not-a-token')).status).toBe(400);
  });

  it('keeps a hidden entry hidden when its owner submits a better run', async () => {
    const first = await play('Kenji', ALICE, pace(3));
    for (let i = 0; i < AUTO_HIDE_REPORTS; i++) {
      client = `reporter-${i}`;
      await report(String(first.body.id));
    }
    client = 'client-a';
    const better = await play('Kenji', ALICE, pace(5));
    expect(better).toMatchObject({ status: 201, body: { rank: null } });
    expect((await board()).body.entries).toHaveLength(0);
  });
});

function hardClear(): Partial<RunClaim> {
  const samples = Array.from({ length: 180 }, () => [3, 0] as const);
  return {
    duration: 180,
    samples,
    correctKeys: 540,
    wrongKeys: 0,
    missed: 0,
    wpm: 36,
    rawWpm: 36,
    accuracy: 100,
    consistency: 100,
  };
}

describe('GET /api/game/leaderboard', () => {
  it('orders, filters and pages, cached 30 s at the edge', async () => {
    for (let i = 0; i < PAGE_SIZE + 2; i++) {
      // Different people: one IP may only submit 10 runs an hour.
      client = `player-${i}`;
      await play(`player_${i}`, (i % 10).toString(16).repeat(64), pace(1 + (i % 7)));
    }
    const first = await board('?script=hiragana&mode=challenge');
    expect(first.response.headers.get('cache-control')).toContain('s-maxage=30');
    expect(first.body.entries).toHaveLength(PAGE_SIZE);
    expect(first.body.next).toBe(String(PAGE_SIZE));
    expect(first.body.total).toBe(PAGE_SIZE + 2);
    const wpms = first.body.entries.map((entry) => entry.wpm);
    expect(wpms).toEqual([...wpms].sort((a, b) => b - a));
    const second = await board(`?script=hiragana&mode=challenge&cursor=${first.body.next}`);
    expect(second.body.entries.map((entry) => entry.rank)).toEqual([51, 52]);
    expect(second.body.next).toBeNull();
    expect((await board('?script=katakana')).body.entries).toHaveLength(0);
  });

  it('rejects unknown filters', async () => {
    expect((await board('?script=latin')).response.status).toBe(400);
    expect((await board('?page=2')).response.status).toBe(400);
  });
});

describe('GET /api/game/leaderboard/rank', () => {
  it('tells the place a run would take in its combination', async () => {
    await play('fast', ALICE, pace(5));
    await play('slow', BOB, pace(2));
    const rank = async (wpm: number) => {
      const response = await handle(() =>
        rankHandler(
          new URL(
            `${SITE}/api/game/leaderboard/rank?script=hiragana&difficulty=normal&mode=challenge&cleared=true&wpm=${wpm}&accuracy=100&duration=150`,
          ),
          deps,
        ),
      );
      return ((await response.json()) as { rank: number }).rank;
    };
    expect(await rank(70)).toBe(1);
    expect(await rank(30)).toBe(2);
    expect(await rank(60)).toBe(2);
    expect(await rank(10)).toBe(3);
  });
});

describe('DELETE /api/game/scores/[id]', () => {
  const remove = (id: string, token: string) =>
    handle(() =>
      deleteScoreHandler(
        new Request(`${SITE}/api/game/scores/${id}`, {
          method: 'DELETE',
          headers: { authorization: `Bearer ${token}` },
        }),
        id,
        deps,
      ),
    );

  it('removes an entry only for the browser that owns it', async () => {
    const { body } = await play('Kenji', ALICE);
    const id = String(body.id);
    expect((await remove(id, BOB)).status).toBe(403);
    expect((await remove(id, 'nope')).status).toBe(401);
    expect((await remove(id, ALICE)).status).toBe(204);
    expect((await board()).body.entries).toHaveLength(0);
    expect((await remove(id, ALICE)).status).toBe(404);
  });
});

function report(id: string, reason = 'name') {
  return handle(() =>
    reportScoreHandler(
      post(`/api/game/scores/${id}/report`, { reason, turnstile: 'human' }),
      id,
      deps,
    ),
  );
}

describe('POST /api/game/scores/[id]/report', () => {
  it('hides an entry after enough reports from different people', async () => {
    const { body } = await play('Kenji', ALICE);
    const id = String(body.id);
    for (let i = 0; i < AUTO_HIDE_REPORTS - 1; i++) {
      client = `reporter-${i}`;
      expect((await report(id)).status).toBe(201);
    }
    expect((await board()).body.entries).toHaveLength(1);
    client = 'reporter-last';
    await report(id, 'score');
    expect((await board()).body.entries).toHaveLength(0);
    expect((await report(id)).status).toBe(404);
  });

  it('counts one report per person and entry, so one person cannot hide an entry', async () => {
    const { body } = await play('Kenji', ALICE);
    const id = String(body.id);
    for (let i = 0; i < 4; i++) expect((await report(id)).status).toBeLessThan(300);
    expect((await deps.store.getScore(id))?.reports).toBe(1);
    expect((await board()).body.entries).toHaveLength(1);
  });
});

describe('gameCleanup', () => {
  it('drops unused runs after 2 h and used runs after a day', async () => {
    clock = NOW;
    const unused = await startRun();
    await play('Kenji', ALICE);
    clock = NOW + 3 * 60 * 60 * 1000;
    expect(await gameCleanup(deps)).toEqual({ runs: 1 });
    expect(await deps.store.getRun(unused)).toBeNull();
    clock = NOW + 25 * 60 * 60 * 1000;
    expect(await gameCleanup(deps)).toEqual({ runs: 1 });
    // The entry stays after its run is gone.
    expect((await board()).body.entries).toHaveLength(1);
  });
});

describe('POST /api/admin/game-scores/[id]', () => {
  const moderate = (id: string, action: string, origin = SITE) =>
    handle(() =>
      adminScoreHandler(
        new Request(`${SITE}/api/admin/game-scores/${id}`, {
          method: 'POST',
          body: new URLSearchParams({ action }),
          headers: { origin },
        }),
        id,
        deps,
      ),
    );

  it('lists reported entries first and hides, shows and deletes them', async () => {
    const quiet = String((await play('Quiet', BOB)).body.id);
    const loud = String(
      (await play('Loud', ALICE, { difficulty: 'hard', ...hardClear() })).body.id,
    );
    client = 'reporter';
    await report(loud, 'score');
    const [first, second] = await deps.store.adminList(10);
    expect(first).toMatchObject({ id: loud, openReports: 1, reasons: ['score'] });
    expect(second?.id).toBe(quiet);

    const hidden = await moderate(loud, 'hide');
    expect(hidden.status).toBe(303);
    expect(hidden.headers.get('location')).toBe('/admin/leaderboard');
    expect((await board()).body.entries.map((entry) => entry.name)).toEqual(['Quiet']);
    // Reviewing resolves the open reports.
    expect((await deps.store.adminList(10)).find((e) => e.id === loud)?.openReports).toBe(0);

    await moderate(loud, 'show');
    expect((await board()).body.entries).toHaveLength(2);
    await moderate(quiet, 'delete');
    expect(await deps.store.getScore(quiet)).toBeNull();
  });

  it('blocking a name hides all its entries and stops new submissions with it', async () => {
    const id = String((await play('Kenji', ALICE)).body.id);
    await play('Kenji', ALICE, { difficulty: 'hard', ...hardClear() });
    await moderate(id, 'block');
    expect((await board()).body.entries).toHaveLength(0);
    expect((await deps.store.adminList(10)).every((entry) => entry.nameBlocked)).toBe(true);
    expect((await play('kenji', ALICE, pace(6))).body).toEqual({ error: 'name-invalid' });
  });

  it('rejects other origins, unknown actions and unknown entries', async () => {
    const id = String((await play('Kenji', ALICE)).body.id);
    expect((await moderate(id, 'hide', 'https://evil.example')).status).toBe(403);
    expect((await moderate(id, 'nuke')).status).toBe(400);
    expect((await moderate('00000000-0000-4000-8000-999999999999', 'hide')).status).toBe(404);
  });
});
