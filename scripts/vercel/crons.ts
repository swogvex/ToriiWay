// Copies the crons from vercel.json into the Build Output API config that the Astro
// Vercel adapter writes. Vercel reads crons only from .vercel/output/config.json when a
// project ships a prebuilt output, and the adapter leaves them out. Runs after astro build.

import { readFile, writeFile } from 'node:fs/promises';

const OUTPUT = '.vercel/output/config.json';
const { crons } = JSON.parse(await readFile('vercel.json', 'utf8')) as { crons?: unknown[] };
const config = JSON.parse(await readFile(OUTPUT, 'utf8')) as Record<string, unknown>;
if (!crons?.length) throw new Error('vercel.json has no crons to copy.');
await writeFile(OUTPUT, JSON.stringify({ ...config, crons }));
console.log(`Added ${crons.length} cron(s) to ${OUTPUT}`);
