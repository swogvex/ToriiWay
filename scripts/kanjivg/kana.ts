/**
 * Extracts kana stroke-order data from KanjiVG into src/data/kanjivg/kana.json.
 * Run with `pnpm kanjivg:kana`; commit the output. The JSON is a derived work of
 * KanjiVG and stays under CC BY-SA 3.0 (its metadata carries the attribution).
 *
 * Sources are pinned to a commit; the combined SHA-256 of every downloaded SVG must
 * match, so a changed upstream file fails the run instead of slipping in.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const KANJIVG_COMMIT = '70a0b7ae0c18ceb5cb358274b029cce0234a43bc';
const SOURCE_BASE = `https://raw.githubusercontent.com/KanjiVG/kanjivg/${KANJIVG_COMMIT}/kanji`;
const COMBINED_SHA256 = '536241b6ac8cfd380965d3bae392ae70b5b243a854ac72e3c9b4a6a27a4ad5e4';

// Hiragana ぁ–ゖ and katakana ァ–ヺ plus ー. Code points KanjiVG lacks are skipped.
const RANGES: readonly [number, number][] = [
  [0x3041, 0x3096],
  [0x30a1, 0x30fa],
  [0x30fc, 0x30fc],
];

const CACHE_DIR = join('node_modules', '.cache', 'kanjivg');
const OUT_FILE = join('src', 'data', 'kanjivg', 'kana.json');

export interface Glyph {
  /** SVG path data, one entry per stroke in writing order (viewBox 0 0 109 109). */
  strokes: string[];
  /** Where KanjiVG places each stroke number, in the same order. */
  numbers: [number, number][];
}

async function loadSvg(hex: string): Promise<string | undefined> {
  const cached = join(CACHE_DIR, `${hex}.svg`);
  try {
    return await readFile(cached, 'utf8');
  } catch {
    const response = await fetch(`${SOURCE_BASE}/${hex}.svg`);
    if (response.status === 404) return undefined;
    if (!response.ok) throw new Error(`Download failed for ${hex}.svg: ${response.status}`);
    const svg = await response.text();
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(cached, svg);
    return svg;
  }
}

function parse(svg: string): Glyph {
  const strokes = [...svg.matchAll(/<path id="kvg:[\da-f]+-s(\d+)"[^>]*\sd="([^"]+)"/g)]
    .sort((a, b) => Number(a[1]) - Number(b[1]))
    .map((match) => match[2] ?? '');
  const numbers = [...svg.matchAll(/matrix\(1 0 0 1 ([\d.]+) ([\d.]+)\)">(\d+)</g)]
    .sort((a, b) => Number(a[3]) - Number(b[3]))
    .map((match): [number, number] => [Number(match[1]), Number(match[2])]);
  if (strokes.length === 0 || strokes.length !== numbers.length) {
    throw new Error(
      `Unexpected KanjiVG markup (${strokes.length} strokes, ${numbers.length} numbers)`,
    );
  }
  return { strokes, numbers };
}

const glyphs: Record<string, Glyph> = {};
const hash = createHash('sha256');
for (const [start, end] of RANGES) {
  for (let code = start; code <= end; code++) {
    const hex = code.toString(16).padStart(5, '0');
    const svg = await loadSvg(hex);
    if (!svg) continue;
    hash.update(svg);
    glyphs[String.fromCodePoint(code)] = parse(svg);
  }
}

const digest = hash.digest('hex');
if (digest !== COMBINED_SHA256) throw new Error(`Combined checksum mismatch: ${digest}`);

const output = {
  source: `https://github.com/KanjiVG/kanjivg/tree/${KANJIVG_COMMIT}`,
  license: 'CC BY-SA 3.0',
  attribution: 'Stroke order data from KanjiVG by Ulrich Apel',
  glyphs,
};
await mkdir(join('src', 'data', 'kanjivg'), { recursive: true });
await writeFile(OUT_FILE, `${JSON.stringify(output, null, 2)}\n`);
console.log(`${OUT_FILE}: ${Object.keys(glyphs).length} glyphs`);
