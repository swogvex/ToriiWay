import { beforeEach, describe, expect, it, vi } from 'vitest';

import { memoryStore } from '../jlpt/store';
import {
  COUNTS_PER_HOUR,
  counterHandler,
  type CounterDeps,
  memoryCounterStore,
  recentSince,
} from './counters';
import { handle } from './http';

const SITE = 'https://toriiway.xyz';
const NOW = Date.UTC(2026, 10, 5, 12);
let deps: CounterDeps;
let clock: number;
let client: string;

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  clock = NOW;
  client = 'ip-a';
  const limits = memoryStore();
  deps = {
    store: memoryCounterStore(),
    site: new URL(SITE),
    now: () => clock,
    clientKey: async () => client,
    rateLimit: (key, limit, windowMs) => limits.rateLimit(key, limit, windowMs, clock),
    allowed: async () => new Set(['library:genki', 'library:irodori']),
  };
});

const count = (key: string, origin = SITE) =>
  handle(() =>
    counterHandler(
      new Request(`${SITE}/api/counters`, {
        method: 'POST',
        body: JSON.stringify({ key }),
        headers: { 'content-type': 'application/json', origin },
      }),
      deps,
    ),
  );

const totals = () => deps.store.totals('library:', recentSince(clock));

describe('POST /api/counters', () => {
  it('counts allowed keys once per visitor, key and day', async () => {
    expect((await count('library:genki')).status).toBe(204);
    expect((await count('library:genki')).status).toBe(204);
    client = 'ip-b';
    await count('library:genki');
    await count('library:irodori');
    expect(await totals()).toEqual([
      { key: 'library:genki', total: 2, recent: 2 },
      { key: 'library:irodori', total: 1, recent: 1 },
    ]);
    // The next day the same visitor counts again.
    clock = NOW + 24 * 60 * 60 * 1000;
    await count('library:irodori');
    expect((await totals()).find((t) => t.key === 'library:irodori')?.total).toBe(2);
  });

  it('separates recent clicks from all-time totals', async () => {
    await count('library:genki');
    clock = NOW + 40 * 24 * 60 * 60 * 1000;
    client = 'ip-later';
    await count('library:genki');
    expect(await totals()).toEqual([{ key: 'library:genki', total: 2, recent: 1 }]);
  });

  it('rejects unknown keys and other origins, and quietly drops floods', async () => {
    expect((await count('library:no-such-book')).status).toBe(400);
    expect((await count('admin:anything')).status).toBe(400);
    expect((await count('library:genki', 'https://evil.example')).status).toBe(403);
    for (let i = 0; i < COUNTS_PER_HOUR + 5; i++) await count('library:genki');
    expect((await count('library:irodori')).status).toBe(204);
    expect((await totals()).find((t) => t.key === 'library:irodori')).toBeUndefined();
  });
});
