import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fakeBank } from '../jlpt/fixtures';
import { createRun } from '../jlpt/run';
import { memoryStore } from '../jlpt/store';
import type { EmailMessage } from './email';
import { cleanupHandler, EMAILS_PER_RUN, emailHandler } from './email-api';
import { handle } from './http';
import type { JlptDeps } from './jlpt-api';

const DAY = 24 * 60 * 60 * 1000;
const ID = '6f1c2f9e-3b5a-4d8e-9c1a-2b3c4d5e6f70';
let clock = Date.UTC(2026, 10, 3);
let sent: EmailMessage[] = [];
let deps: JlptDeps;

async function finishedRun(id = ID) {
  const run = createRun({ id, level: 'N5', seed: 1, isPublic: false, now: clock });
  await deps.store.createRun({
    ...run,
    name: 'Ana',
    status: 'finished',
    finishedAt: clock,
    scores: {
      level: 'N5',
      sections: [],
      total: 122,
      max: 180,
      passMark: 80,
      passed: true,
      grades: {},
    },
  });
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  clock = Date.UTC(2026, 10, 3);
  sent = [];
  deps = {
    store: memoryStore(),
    bank: fakeBank('N5'),
    site: new URL('https://toriiway.xyz'),
    now: () => clock,
    clientKey: async () => 'client-a',
    newId: () => crypto.randomUUID(),
    newSeed: () => 1,
    verifyHuman: async (token) => token === 'human',
    sendEmail: async (message) => {
      sent.push(message);
      return true;
    },
  };
});

const ask = (body: Record<string, unknown>, id = ID) =>
  handle(() =>
    emailHandler(
      new Request(`https://toriiway.xyz/api/jlpt/runs/${id}/email`, {
        method: 'POST',
        body: JSON.stringify({ email: 'ana@example.com', token: 'human', ...body }),
        headers: { 'content-type': 'application/json' },
      }),
      id,
      deps,
    ),
  );

describe('POST /api/jlpt/runs/[id]/email', () => {
  it('sends the result link of a finished run', async () => {
    await finishedRun();
    expect((await ask({})).status).toBe(202);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: 'ana@example.com' });
    expect(sent[0]?.text).toContain(`https://toriiway.xyz/jlpt/r/${ID}?utm_source=email`);
    expect(sent[0]?.text).toContain('Hi Ana,');
  });

  it('follows the language of the result page', async () => {
    await finishedRun();
    expect((await ask({ locale: 'es' })).status).toBe(202);
    expect(sent[0]?.text).toContain(`https://toriiway.xyz/es/jlpt/r/${ID}?utm_source=email`);
    expect(sent[0]?.text).toContain('Hola, Ana:');
    expect((await ask({ locale: 'fr' })).status).toBe(400);
  });

  it('refuses bad tokens, bad addresses, open and unknown runs', async () => {
    expect((await ask({})).status).toBe(404);
    const open = createRun({ id: ID, level: 'N5', seed: 1, isPublic: false, now: clock });
    await deps.store.createRun(open);
    expect((await ask({})).status).toBe(409);
    await deps.store.saveRun(
      {
        ...open,
        status: 'finished',
        scores: {
          level: 'N5',
          sections: [],
          total: 0,
          max: 180,
          passMark: 80,
          passed: false,
          grades: {},
        },
      },
      { status: 'section', section: 0 },
    );
    expect((await ask({ token: 'bot' })).status).toBe(403);
    expect((await ask({ email: 'not-an-email' })).status).toBe(400);
    expect(sent).toHaveLength(0);
  });

  it('allows three emails per run', async () => {
    await finishedRun();
    const statuses = [];
    for (let index = 0; index <= EMAILS_PER_RUN; index += 1) statuses.push((await ask({})).status);
    expect(statuses).toEqual([202, 202, 202, 429]);
  });

  it('answers 503 when the email could not be sent', async () => {
    await finishedRun();
    deps.sendEmail = async () => false;
    expect((await ask({})).status).toBe(503);
  });
});

describe('GET /api/cron/cleanup', () => {
  const cron = (auth?: string, secret: string | null = 'cron-secret') =>
    handle(() =>
      cleanupHandler(
        new Request('https://toriiway.xyz/api/cron/cleanup', {
          headers: auth ? { authorization: auth } : {},
        }),
        deps,
        secret ?? undefined,
      ),
    );

  it('needs the cron secret', async () => {
    expect((await cron()).status).toBe(401);
    expect((await cron('Bearer wrong')).status).toBe(401);
    expect((await cron('Bearer cron-secret', null)).status).toBe(503);
  });

  it('clears old emails, deletes expired runs and old rate limits', async () => {
    await finishedRun();
    await ask({});
    clock += 31 * DAY;
    expect(await (await cron('Bearer cron-secret')).json()).toEqual({
      emails: 1,
      runs: 0,
      limits: 2,
      reports: 0,
    });
    clock += 150 * DAY;
    expect(await (await cron('Bearer cron-secret')).json()).toEqual({
      emails: 0,
      runs: 1,
      limits: 0,
      reports: 0,
    });
    expect(await deps.store.getRun(ID)).toBeNull();
  });

  it('deletes resolved reports 90 days after they were sent, never open ones', async () => {
    const report = (id: string) => ({
      id,
      questionId: 'q1',
      runId: null,
      category: 'typo' as const,
      message: 'A typo in the second option.',
      createdAt: clock,
      status: 'open' as const,
    });
    await deps.store.createReport(report('00000000-0000-4000-8000-0000000000a1'));
    await deps.store.createReport(report('00000000-0000-4000-8000-0000000000a2'));
    await deps.store.resolveReport('00000000-0000-4000-8000-0000000000a1');
    clock += 89 * DAY;
    expect((await (await cron('Bearer cron-secret')).json()).reports).toBe(0);
    clock += 2 * DAY;
    expect((await (await cron('Bearer cron-secret')).json()).reports).toBe(1);
    expect((await deps.store.listReports(10)).map((stored) => stored.status)).toEqual(['open']);
  });
});
