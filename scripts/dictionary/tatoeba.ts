// Reads Tatoeba's sentence and translation exports. They ship only as .bz2, which Node cannot
// decompress, so the system bzip2 does it (Git for Windows and Linux runners include it).

import { spawn, spawnSync } from 'node:child_process';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

import type { TatoebaCorpus } from '../../src/lib/dictionary/sentences.ts';

const CACHE_DIR = join('node_modules', '.cache', 'dictionary');
const BASE = 'https://downloads.tatoeba.org/exports/per_language';
const BZIP2_CANDIDATES = ['bzip2', 'C:\\Program Files\\Git\\usr\\bin\\bzip2.exe'];

function findBzip2(): string {
  const found = BZIP2_CANDIDATES.find((command) => !spawnSync(command, ['--version']).error);
  if (!found) throw new Error('bzip2 not found: install it or Git for Windows');
  return found;
}

/** Exports change daily, so the cache is per day. */
async function cachedFile(path: string, day: string): Promise<string> {
  const file = join(CACHE_DIR, `tatoeba-${day}-${path.replace('/', '-')}`);
  try {
    await stat(file);
  } catch {
    const response = await fetch(`${BASE}/${path}`);
    if (!response.ok) throw new Error(`Download failed for ${path}: ${response.status}`);
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(file, Buffer.from(await response.arrayBuffer()));
  }
  return file;
}

async function eachRow(
  bzip2: string,
  file: string,
  onRow: (fields: string[]) => void,
): Promise<void> {
  const child = spawn(bzip2, ['-dc', file], { stdio: ['ignore', 'pipe', 'inherit'] });
  const finished = new Promise<void>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`bzip2 exited with ${code} on ${file}`)),
    );
  });
  for await (const line of createInterface({ input: child.stdout })) onRow(line.split('\t'));
  await finished;
}

export async function loadTatoeba(day: string): Promise<TatoebaCorpus> {
  const bzip2 = findBzip2();
  const file = (path: string) => cachedFile(path, day);

  const links = async (path: string): Promise<Map<number, number[]>> => {
    const result = new Map<number, number[]>();
    await eachRow(bzip2, await file(path), ([from, to]) => {
      const key = Number(from);
      const list = result.get(key);
      if (list) list.push(Number(to));
      else result.set(key, [Number(to)]);
    });
    return result;
  };
  const texts = async (
    path: string,
    target: Map<number, string>,
    wanted?: ReadonlySet<number>,
  ): Promise<void> => {
    await eachRow(bzip2, await file(path), ([id, , text]) => {
      const key = Number(id);
      if (text && (!wanted || wanted.has(key))) target.set(key, text);
    });
  };

  const jpnEng = await links('jpn/jpn-eng_links.tsv.bz2');
  const jpnSpa = await links('jpn/jpn-spa_links.tsv.bz2');
  const engSpa = await links('eng/eng-spa_links.tsv.bz2');

  const english = new Set([...jpnEng.values()].flat());
  const spanish = new Set([
    ...[...jpnSpa.values()].flat(),
    ...[...english].flatMap((id) => engSpa.get(id) ?? []),
  ]);

  const japanese = new Map<number, string>();
  const text = new Map<number, string>();
  await texts('jpn/jpn_sentences.tsv.bz2', japanese);
  await texts('eng/eng_sentences.tsv.bz2', text, english);
  await texts('spa/spa_sentences.tsv.bz2', text, spanish);
  return { japanese, text, jpnEng, jpnSpa, engSpa };
}
