// Downloads the newest upstream dictionary data into a local cache.
// Every source is plain JSON, so the importer needs no XML parser.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

import type {
  JmdictWord,
  KanjidicCharacter,
  OpenJlptVocab,
} from '../../src/lib/dictionary/import-map.ts';

import type { TatoebaCorpus } from '../../src/lib/dictionary/sentences.ts';
import { loadTatoeba } from './tatoeba.ts';

const CACHE_DIR = join('node_modules', '.cache', 'dictionary');
const SIMPLIFIED = 'scriptin/jmdict-simplified';
const OPEN_JLPT = 'evanclan/OpenJLPT';
const KANJIVG = 'KanjiVG/kanjivg';
const LEVELS = ['n1', 'n2', 'n3', 'n4', 'n5'] as const;

export interface SourceInfo {
  name: string;
  version: string;
  license: string;
  url: string;
}

export interface OpenJlptKanji {
  character: string;
  level: string;
}

export interface Downloaded {
  words: JmdictWord[];
  characters: KanjidicCharacter[];
  vocab: OpenJlptVocab[];
  jlptKanji: OpenJlptKanji[];
  corpus: TatoebaCorpus;
  kanjiVgXml: string;
  sources: SourceInfo[];
}

interface Asset {
  name: string;
  browser_download_url: string;
}

async function github<T>(path: string): Promise<T> {
  const response = await fetch(`https://api.github.com/repos/${path}`, {
    headers: { accept: 'application/vnd.github+json' },
  });
  if (!response.ok) throw new Error(`GitHub ${path}: ${response.status}`);
  return (await response.json()) as T;
}

async function cached(name: string, url: string): Promise<Buffer> {
  const file = join(CACHE_DIR, name);
  try {
    return await readFile(file);
  } catch {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Download failed for ${url}: ${response.status}`);
    const body = Buffer.from(await response.arrayBuffer());
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(file, body);
    return body;
  }
}

/** Reads the first .json member of a gzipped tar. */
export function jsonFromTgz(archive: Buffer): string {
  const tar = gunzipSync(archive, { maxOutputLength: 2 ** 30 });
  for (let offset = 0; offset + 512 <= tar.length;) {
    const name = tar.toString('utf8', offset, offset + 100).replace(/\0.*$/s, '');
    if (!name) break;
    const size = parseInt(tar.toString('ascii', offset + 124, offset + 136).trim(), 8);
    if (name.endsWith('.json')) return tar.toString('utf8', offset + 512, offset + 512 + size);
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  throw new Error('No JSON file in the archive');
}

export async function download(): Promise<Downloaded> {
  const day = new Date().toISOString().slice(0, 10);
  const release = await github<{
    tag_name: string;
    assets: Asset[];
  }>(`${SIMPLIFIED}/releases/latest`);
  const asset = async (prefix: string): Promise<string> => {
    const found = release.assets.find(
      (item) => item.name.startsWith(`${prefix}-`) && item.name.endsWith('.json.tgz'),
    );
    if (!found) throw new Error(`Release ${release.tag_name} has no ${prefix} archive`);
    return jsonFromTgz(await cached(found.name, found.browser_download_url));
  };
  const jmdict = JSON.parse(await asset('jmdict-all')) as {
    dictDate: string;
    words: JmdictWord[];
  };
  const kanjidic = JSON.parse(await asset('kanjidic2-all')) as {
    databaseVersion: string;
    characters: KanjidicCharacter[];
  };

  const { sha } = await github<{ sha: string }>(`${OPEN_JLPT}/commits/main`);
  const openJlpt = async <T>(kind: 'vocab' | 'kanji'): Promise<T[]> => {
    const files = await Promise.all(
      LEVELS.map((level) =>
        cached(
          `openjlpt-${sha}-${kind}-${level}.json`,
          `https://raw.githubusercontent.com/${OPEN_JLPT}/${sha}/data/json/${kind}/${level}.json`,
        ),
      ),
    );
    return files.flatMap((file) => JSON.parse(file.toString('utf8')) as T[]);
  };

  const strokes = await github<{ tag_name: string; assets: Asset[] }>(`${KANJIVG}/releases/latest`);
  const kanjiVg = async (): Promise<string> => {
    const found = strokes.assets.find((item) => /^kanjivg-\d+\.xml\.gz$/.test(item.name));
    if (!found) throw new Error(`KanjiVG ${strokes.tag_name} has no XML archive`);
    return gunzipSync(await cached(found.name, found.browser_download_url)).toString('utf8');
  };

  return {
    words: jmdict.words,
    characters: kanjidic.characters,
    vocab: await openJlpt<OpenJlptVocab>('vocab'),
    jlptKanji: await openJlpt<OpenJlptKanji>('kanji'),
    corpus: await loadTatoeba(day),
    kanjiVgXml: await kanjiVg(),
    sources: [
      {
        name: 'JMdict',
        version: jmdict.dictDate,
        license: 'CC BY-SA 4.0',
        url: 'https://www.edrdg.org/jmdict/j_jmdict.html',
      },
      {
        name: 'KANJIDIC2',
        version: kanjidic.databaseVersion,
        license: 'CC BY-SA 4.0',
        url: 'https://www.edrdg.org/wiki/KANJIDIC_Project.html',
      },
      {
        name: 'OpenJLPT',
        version: sha,
        license: 'CC BY-SA 4.0',
        url: `https://github.com/${OPEN_JLPT}`,
      },
      {
        name: 'KanjiVG',
        version: strokes.tag_name,
        license: 'CC BY-SA 3.0',
        url: 'https://kanjivg.tagaini.net',
      },
      {
        name: 'Tatoeba',
        version: day,
        license: 'CC BY 2.0 FR',
        url: 'https://tatoeba.org',
      },
    ],
  };
}
