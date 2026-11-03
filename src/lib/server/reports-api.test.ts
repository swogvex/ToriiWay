import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fakeBank } from '../jlpt/fixtures';
import { memoryStore } from '../jlpt/store';
import { handle } from './http';
import type { JlptDeps } from './jlpt-api';
import { reportHandler, REPORTS_PER_HOUR } from './reports-api';

let deps: JlptDeps;

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  deps = {
    store: memoryStore(),
    bank: fakeBank('N5'),
    site: new URL('https://toriiway.xyz'),
    now: () => Date.UTC(2026, 10, 3),
    clientKey: async () => 'client-a',
    newId: () => crypto.randomUUID(),
    newSeed: () => 1,
    verifyHuman: async (token) => token === 'human',
    sendEmail: async () => true,
  };
});

const report = (body: Record<string, unknown>, origin?: string) =>
  handle(() =>
    reportHandler(
      new Request('https://toriiway.xyz/api/reports', {
        method: 'POST',
        body: JSON.stringify({
          questionId: 'n5-voc-1-0001',
          runId: null,
          category: 'typo',
          message: '  The reading is wrong.  ',
          token: 'human',
          ...body,
        }),
        headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) },
      }),
      deps,
    ),
  );

describe('POST /api/reports', () => {
  it('stores a report for a known question', async () => {
    expect((await report({})).status).toBe(201);
    const [saved] = await deps.store.listReports(10);
    expect(saved).toMatchObject({
      questionId: 'n5-voc-1-0001',
      category: 'typo',
      message: 'The reading is wrong.',
      status: 'open',
    });
  });

  it('requires a valid Turnstile token, a known question and our origin', async () => {
    expect((await report({ token: 'bot' })).status).toBe(403);
    expect((await report({ questionId: 'n5-voc-1-9999' })).status).toBe(400);
    expect((await report({ message: 'x'.repeat(1001) })).status).toBe(400);
    expect((await report({}, 'https://evil.example')).status).toBe(403);
    expect(await deps.store.listReports(10)).toEqual([]);
  });

  it('allows five reports per hour per client', async () => {
    const statuses = [];
    for (let index = 0; index <= REPORTS_PER_HOUR; index += 1) {
      statuses.push((await report({})).status);
    }
    expect(statuses.at(-1)).toBe(429);
    expect(statuses.slice(0, REPORTS_PER_HOUR).every((status) => status === 201)).toBe(true);
  });

  it('lists open reports first and resolves them', async () => {
    await report({});
    const [first] = await deps.store.listReports(10);
    expect(await deps.store.resolveReport(first?.id ?? '')).toBe(true);
    expect((await deps.store.listReports(10))[0]?.status).toBe('resolved');
    expect(await deps.store.resolveReport(crypto.randomUUID())).toBe(false);
  });
});
