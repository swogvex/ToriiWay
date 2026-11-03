// Applies pending Drizzle migrations (drizzle/) before a production build on Vercel.
// Previews share the production database, so they never migrate: a migration from an
// unmerged branch must not reach it. Run locally with DATABASE_URL set and --force.

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { migrate } from 'drizzle-orm/neon-http/migrator';

const force = process.argv.includes('--force');
if (process.env.VERCEL_ENV !== 'production' && !force) {
  console.log(`[db] skipping migrations (VERCEL_ENV=${process.env.VERCEL_ENV ?? 'unset'})`);
  process.exit(0);
}

// The unpooled URL avoids PgBouncer, which DDL statements do not need.
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) {
  console.error('[db] DATABASE_URL is not set');
  process.exit(1);
}

await migrate(drizzle(neon(url)), { migrationsFolder: 'drizzle' });
console.log('[db] migrations applied');
