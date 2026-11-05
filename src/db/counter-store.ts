import { neon } from '@neondatabase/serverless';
import { desc, like, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-http';

import type { CounterStore } from '../lib/server/counters';
import { counters } from './schema';

export function drizzleCounterStore(databaseUrl: string): CounterStore {
  const db = drizzle(neon(databaseUrl));

  return {
    async increment(key, day) {
      await db
        .insert(counters)
        .values({ key, day, value: 1 })
        .onConflictDoUpdate({
          target: [counters.key, counters.day],
          set: { value: sql`${counters.value} + 1` },
        });
    },
    async totals(prefix, since) {
      // Prefixes are code constants ("library:"), never user input; escape LIKE anyway.
      const pattern = `${prefix.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
      const total = sql<number>`sum(${counters.value})::int`;
      const rows = await db
        .select({
          key: counters.key,
          total,
          recent: sql<number>`(coalesce(sum(${counters.value}) filter (where ${counters.day} >= ${since}), 0))::int`,
        })
        .from(counters)
        .where(like(counters.key, pattern))
        .groupBy(counters.key)
        .orderBy(desc(total), counters.key);
      return rows;
    },
  };
}
