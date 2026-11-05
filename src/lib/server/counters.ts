// Anonymous aggregate counters (11-spec-library: "Counting"): POST /api/counters with an
// allow-listed key such as `library:genki`. Only a count per key and UTC day is stored;
// nothing about the visitor.

import { z } from 'astro/zod';

import { assertSameOrigin, HttpError, readJson } from './http';

export interface CounterTotal {
  key: string;
  /** All time. */
  total: number;
  /** The last 30 days, today included. */
  recent: number;
}

export interface CounterStore {
  /** Adds one to `key` on `day` (YYYY-MM-DD). */
  increment(key: string, day: string): Promise<void>;
  /** Totals for keys starting with `prefix`, most clicked first; `since` is the first recent day. */
  totals(prefix: string, since: string): Promise<CounterTotal[]>;
}

export interface CounterDeps {
  store: CounterStore;
  site: URL;
  now: () => number;
  clientKey: () => Promise<string>;
  rateLimit: (key: string, limit: number, windowMs: number) => Promise<boolean>;
  /** Keys that may be counted (one per library book). */
  allowed: () => Promise<ReadonlySet<string>>;
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
/** Counter posts per IP per hour; past it they are dropped silently. */
export const COUNTS_PER_HOUR = 60;

const body = z.strictObject({ key: z.string().min(1).max(100) });

/** UTC day of an epoch time, YYYY-MM-DD. */
export const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * POST /api/counters. Always 204 for allowed keys, so a beacon never retries or shows an
 * error; the same IP counts once per key and day, so reloading cannot inflate a number.
 */
export async function counterHandler(request: Request, deps: CounterDeps): Promise<Response> {
  assertSameOrigin(request, deps.site);
  const { key } = await readJson(request, body);
  if (!(await deps.allowed()).has(key)) throw new HttpError('bad-request', 400, `key ${key}`);
  const ip = await deps.clientKey();
  const now = deps.now();
  const fresh =
    (await deps.rateLimit(`counter:${ip}`, COUNTS_PER_HOUR, HOUR)) &&
    (await deps.rateLimit(`counter:${ip}:${key}`, 1, DAY));
  if (fresh) await deps.store.increment(key, dayOf(now));
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}

export function memoryCounterStore(): CounterStore {
  const rows = new Map<string, number>();
  return {
    async increment(key, day) {
      const id = `${key}\u0000${day}`;
      rows.set(id, (rows.get(id) ?? 0) + 1);
    },
    async totals(prefix, since) {
      const totals = new Map<string, CounterTotal>();
      for (const [id, value] of rows) {
        const [key = '', day = ''] = id.split('\u0000');
        if (!key.startsWith(prefix)) continue;
        const entry = totals.get(key) ?? { key, total: 0, recent: 0 };
        entry.total += value;
        if (day >= since) entry.recent += value;
        totals.set(key, entry);
      }
      return [...totals.values()].sort((a, b) => b.total - a.total || a.key.localeCompare(b.key));
    },
  };
}

/** First day of the "last 30 days" window. */
export const recentSince = (now: number) => dayOf(now - 29 * DAY);
