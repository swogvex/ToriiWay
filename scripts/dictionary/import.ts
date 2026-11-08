// Imports the dictionary into Postgres. Without --write it only downloads, checks and counts.
// Usage: pnpm dictionary:import [--write]   (--write needs DATABASE_URL)

import { Pool } from '@neondatabase/serverless';

import { assertPlausible, buildTables, replaceDictionary } from './load.ts';
import { download } from './sources.ts';

const data = await download();
const tables = buildTables(data);
assertPlausible(tables);

for (const [name, rows] of Object.entries(tables)) console.log(`${name}: ${rows.length}`);
for (const source of data.sources) console.log(`${source.name}: ${source.version}`);

if (!process.argv.includes('--write')) {
  console.log('Dry run: nothing written. Pass --write to replace the dictionary tables.');
  process.exit(0);
}

// The unpooled URL: one long transaction should not go through PgBouncer.
const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error('[dictionary] DATABASE_URL is not set');
  process.exit(1);
}

const pool = new Pool({ connectionString });
const client = await pool.connect();
try {
  await replaceDictionary(client, tables, data.sources, new Date());
  console.log('[dictionary] import committed');
} finally {
  client.release();
  await pool.end();
}
