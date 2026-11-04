import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fakeBank } from '../jlpt/fixtures';
import { TIMING } from '../jlpt/levels';
import { memoryStore } from '../jlpt/store';
import { handle } from './http';
import {
  continueHandler,
  createRunHandler,
  feedbackHandler,
  getRunHandler,
  nameHandler,
  recentHandler,
  paperHandler,
  RUNS_PER_HOUR,
  submitHandler,
  type JlptDeps,
} from './jlpt-api';

const SECOND = 1000;
const emptyScores = {
  level: 'N5' as const,
  sections: [],
  total: 0,
  max: 180,
  passMark: 80,
  passed: false,
  grades: {},
};
const ID = '6f1c2f9e-3b5a-4d8e-9c1a-2b3c4d5e6f70';
let clock = Date.UTC(2026, 10, 3, 9);
let deps: JlptDeps;

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  clock = Date.UTC(2026, 10, 3, 9);
  let ids = 0;
  deps = {
    store: memoryStore(),
    bank: fakeBank('N5'),
    site: new URL('https://toriiway.xyz'),
    now: () => clock,
    clientKey: async () => 'client-a',
    newId: () => (ids++ === 0 ? ID : crypto.randomUUID()),
    newSeed: () => 1234,
    verifyHuman: async (token) => token === 'human',
    sendEmail: async () => true,
  };
});

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`https://toriiway.xyz${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...headers },
  });
}

const call = (run: () => Promise<Response>) => handle(run);

interface PaperBody {
  section: number;
  mondai: { spokenChoices: boolean; questions: Record<string, unknown>[] }[];
}

async function answerSection(choice: number) {
  const paper = (await (await call(() => paperHandler(ID, deps))).json()) as PaperBody;
  const answers = paper.mondai.flatMap((mondai) =>
    mondai.questions.map((question) => ({ id: question['id'] as string, choice, at: clock })),
  );
  return call(() =>
    submitHandler(
      post(`/api/jlpt/runs/${ID}/submit`, { section: paper.section, answers }),
      ID,
      deps,
    ),
  );
}

describe('JLPT API', () => {
  it('runs a full N5 simulation and scores it on the server', async () => {
    const created = await call(() =>
      createRunHandler(post('/api/jlpt/runs', { level: 'N5', public: false }), deps),
    );
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({ id: ID, status: 'section', section: 0 });

    const paper = (await (await call(() => paperHandler(ID, deps))).json()) as PaperBody;
    const question = paper.mondai[0]?.questions[0] ?? {};
    expect(Object.keys(question).sort()).toEqual([
      'audio',
      'choices',
      'id',
      'passage',
      'stem',
      'tts',
    ]);

    for (const section of [0, 1, 2]) {
      clock += 5 * 60 * SECOND;
      const submitted = await answerSection(1);
      expect(submitted.status).toBe(200);
      const state = (await submitted.json()) as { status: string; scores: unknown };
      if (section < 2) {
        expect(state.status).toBe('break');
        clock += TIMING.breakMin * SECOND;
        const next = await call(() =>
          continueHandler(
            post(`/api/jlpt/runs/${ID}/continue`, { section: section + 1 }),
            ID,
            deps,
          ),
        );
        expect(next.status).toBe(200);
      } else {
        expect(state).toMatchObject({ status: 'finished', scores: { total: 180, passed: true } });
      }
    }
    const stored = await deps.store.getRun(ID);
    expect(stored?.scores).toMatchObject({ total: 180, passed: true });
  });

  it('never accepts a finalized section again', async () => {
    await call(() =>
      createRunHandler(post('/api/jlpt/runs', { level: 'N5', public: false }), deps),
    );
    await answerSection(1);
    const again = await call(() =>
      submitHandler(post(`/api/jlpt/runs/${ID}/submit`, { section: 0, answers: [] }), ID, deps),
    );
    expect(again.status).toBe(409);
    expect(await call(() => paperHandler(ID, deps))).toHaveProperty('status', 409);
  });

  it('accepts feedback only for finished sections', async () => {
    await call(() =>
      createRunHandler(post('/api/jlpt/runs', { level: 'N5', public: false }), deps),
    );
    const early = await call(() =>
      feedbackHandler(
        post(`/api/jlpt/runs/${ID}/feedback`, { section: 0, rating: 'hard' }),
        ID,
        deps,
      ),
    );
    expect(early.status).toBe(409);
    await answerSection(2);
    const ok = await call(() =>
      feedbackHandler(
        post(`/api/jlpt/runs/${ID}/feedback`, { section: 0, rating: 'hard' }),
        ID,
        deps,
      ),
    );
    expect(ok.status).toBe(204);
  });

  it('saves a cleaned report name once the run is finished', async () => {
    await call(() =>
      createRunHandler(post('/api/jlpt/runs', { level: 'N5', public: false }), deps),
    );
    const early = await call(() =>
      nameHandler(post(`/api/jlpt/runs/${ID}/name`, { name: 'Ana' }), ID, deps),
    );
    expect(early.status).toBe(409);
    for (const section of [0, 1, 2]) {
      await answerSection(1);
      if (section < 2) {
        clock += TIMING.breakMin * SECOND;
        await call(() =>
          continueHandler(
            post(`/api/jlpt/runs/${ID}/continue`, { section: section + 1 }),
            ID,
            deps,
          ),
        );
      }
    }
    const saved = await call(() =>
      nameHandler(post(`/api/jlpt/runs/${ID}/name`, { name: '  Ana María ' }), ID, deps),
    );
    expect(saved.status).toBe(204);
    expect((await deps.store.getRun(ID))?.name).toBe('Ana María');
  });

  it('lists only finished public runs, newest first, without names', async () => {
    const finish = async (isPublic: boolean) => {
      const id = crypto.randomUUID();
      deps.newId = () => id;
      await call(() =>
        createRunHandler(post('/api/jlpt/runs', { level: 'N5', public: isPublic }), deps),
      );
      const run = await deps.store.getRun(id);
      if (!run) throw new Error('no run');
      await deps.store.saveRun(
        { ...run, status: 'finished', finishedAt: clock, scores: { ...emptyScores, passed: true } },
        { status: run.status, section: run.section },
      );
      clock += 1000;
      return id;
    };
    await finish(true);
    await finish(false);
    const last = await finish(true);
    const open = crypto.randomUUID();
    deps.newId = () => open;
    await call(() => createRunHandler(post('/api/jlpt/runs', { level: 'N5', public: true }), deps));

    const response = await recentHandler(deps);
    expect(response.headers.get('cache-control')).toContain('max-age=60');
    const body = (await response.json()) as Record<string, unknown>[];
    expect(body).toHaveLength(2);
    expect(body[0]).toEqual({
      date: '2026-11-03',
      nickname: (await deps.store.getRun(last))?.nickname,
      level: 'N5',
      passed: true,
    });
    expect(Object.keys(body[0] ?? {}).sort()).toEqual(['date', 'level', 'nickname', 'passed']);
  });

  it('rate-limits new runs per client', async () => {
    const statuses: number[] = [];
    for (let index = 0; index <= RUNS_PER_HOUR; index += 1) {
      const response = await call(() =>
        createRunHandler(post('/api/jlpt/runs', { level: 'N5', public: true }), deps),
      );
      statuses.push(response.status);
    }
    expect(statuses.slice(0, RUNS_PER_HOUR).every((status) => status === 201)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
  });

  it('rejects bad input, other origins, unknown runs and levels without a bank', async () => {
    const bad = await call(() => createRunHandler(post('/api/jlpt/runs', { level: 'N9' }), deps));
    expect(bad.status).toBe(400);
    const cross = await call(() =>
      createRunHandler(
        post('/api/jlpt/runs', { level: 'N5', public: false }, { origin: 'https://evil.example' }),
        deps,
      ),
    );
    expect(cross.status).toBe(403);
    expect((await call(() => getRunHandler('not-a-uuid', deps))).status).toBe(404);
    expect((await call(() => getRunHandler(crypto.randomUUID(), deps))).status).toBe(404);
    const noBank = await call(() =>
      createRunHandler(post('/api/jlpt/runs', { level: 'N4', public: false }), deps),
    );
    expect(noBank.status).toBe(503);
    const noN1Bank = await call(() =>
      createRunHandler(post('/api/jlpt/runs', { level: 'N1', public: false }), deps),
    );
    expect(noN1Bank.status).toBe(503);
  });

  it('answers 410 once a run has expired', async () => {
    await call(() =>
      createRunHandler(post('/api/jlpt/runs', { level: 'N5', public: false }), deps),
    );
    clock += 181 * 24 * 60 * 60 * SECOND;
    expect((await call(() => getRunHandler(ID, deps))).status).toBe(410);
  });
});
