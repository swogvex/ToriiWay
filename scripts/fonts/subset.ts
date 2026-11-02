/**
 * Builds the Japanese display subset of Zen Kaku Gothic New into public/fonts/.
 * Run with `pnpm fonts:subset` after changing DISPLAY_KANJI; commit the output.
 *
 * Fontsource only ships this family as unicode-range chunks, so the source TTFs come
 * from the google/fonts repo, pinned to a commit and checked against SHA-256.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import subsetFont from 'subset-font';

const GOOGLE_FONTS_COMMIT = 'ba225958c40ae6268a256861d80355a84b26e535';
const SOURCE_BASE = `https://raw.githubusercontent.com/google/fonts/${GOOGLE_FONTS_COMMIT}/ofl/zenkakugothicnew`;

const SOURCES = [
  {
    file: 'ZenKakuGothicNew-Regular.ttf',
    sha256: 'b840cd07a67d89cacca44249ae49aa99ee7640eb5ce623be8d8983d6aabac801',
    out: 'zen-kaku-gothic-new-display-400.woff2',
  },
  {
    file: 'ZenKakuGothicNew-Bold.ttf',
    sha256: '0081cedabc4921982fcd061f845a005664ac7fb642af2dd34b4007bc63ccd235',
    out: 'zen-kaku-gothic-new-display-700.woff2',
  },
] as const;

// OFL 1.1 asks for the license to travel with the font files.
const LICENSE = {
  file: 'OFL.txt',
  sha256: '0fac78a235c98d640cb06332eb5362c211d86fa03c011df438c35005d22ad2c7',
  out: 'zen-kaku-gothic-new-OFL.txt',
} as const;

// Kanji shown as big glyphs or display headings. Dictionary glyphs use system fonts.
const DISPLAY_KANJI = '日本語鳥居打学試輪迷子一緒頑張';

// Full hiragana and katakana blocks (covers every kana table) plus display punctuation.
const KANA_RANGES: readonly [number, number][] = [
  [0x3041, 0x3096],
  [0x3099, 0x309f],
  [0x30a0, 0x30ff],
];
const PUNCTUATION = '、。・ー「」『』〜！？';

const CACHE_DIR = join('node_modules', '.cache', 'fonts');
const OUT_DIR = join('public', 'fonts');

function displayText(): string {
  let text = DISPLAY_KANJI + PUNCTUATION;
  for (const [start, end] of KANA_RANGES) {
    for (let code = start; code <= end; code++) text += String.fromCodePoint(code);
  }
  return text;
}

async function loadSource(file: string, sha256: string): Promise<Buffer> {
  const cached = join(CACHE_DIR, file);
  let buffer: Buffer;
  try {
    buffer = await readFile(cached);
  } catch {
    const response = await fetch(`${SOURCE_BASE}/${file}`);
    if (!response.ok) throw new Error(`Download failed for ${file}: ${response.status}`);
    buffer = Buffer.from(await response.arrayBuffer());
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(cached, buffer);
  }
  const actual = createHash('sha256').update(buffer).digest('hex');
  if (actual !== sha256) throw new Error(`Checksum mismatch for ${file}: ${actual}`);
  return buffer;
}

const text = displayText();
await mkdir(OUT_DIR, { recursive: true });
for (const { file, sha256, out } of SOURCES) {
  const subset = await subsetFont(await loadSource(file, sha256), text, { targetFormat: 'woff2' });
  await writeFile(join(OUT_DIR, out), subset);
  console.log(`${out}: ${(subset.length / 1024).toFixed(1)} KB`);
}
await writeFile(join(OUT_DIR, LICENSE.out), await loadSource(LICENSE.file, LICENSE.sha256));
