/**
 * Builds the Japanese display subset of Zen Kaku Gothic New into public/fonts/, and the
 * TTF subset the server uses for the JLPT report image (Satori reads TTF, not WOFF2)
 * into src/assets/og/. Run with `pnpm fonts:subset` after changing DISPLAY_KANJI or
 * OG_KANJI; commit the output.
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
// The 404 omikuji adds its box, stick, ranks, path cards and the 籤 corner glyph.
const DISPLAY_KANJI = '日本語鳥居打学試輪迷子一緒頑張家御神籤第番四〇大小中末吉凶';

// Full hiragana and katakana blocks (covers every kana table) plus display punctuation.
const KANA_RANGES: readonly [number, number][] = [
  [0x3041, 0x3096],
  [0x3099, 0x309f],
  [0x30a0, 0x30ff],
];
const PUNCTUATION = '、。・ー「」『』〜！？';

// Kanji drawn in the JLPT report image (src/lib/jlpt/og.ts).
const OG_KANJI = '日本語能力試験模擬合格不合格言語知識文字語彙文法読解聴解総合得点鳥居';
const OG_PUNCTUATION = '・（）〜';

const CACHE_DIR = join('node_modules', '.cache', 'fonts');
const OG_DIR = join('src', 'assets', 'og');
const OUT_DIR = join('public', 'fonts');

function withRanges(base: string, ranges: readonly [number, number][]): string {
  let text = base;
  for (const [start, end] of ranges) {
    for (let code = start; code <= end; code++) text += String.fromCodePoint(code);
  }
  return text;
}

const displayText = () => withRanges(DISPLAY_KANJI + PUNCTUATION, KANA_RANGES);
// Latin too, so names and numbers never fall back to a missing glyph.
const ogText = () =>
  withRanges(OG_KANJI + OG_PUNCTUATION + PUNCTUATION, [...KANA_RANGES, [0x20, 0x7e]]);

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
await mkdir(OG_DIR, { recursive: true });
for (const { file, sha256, out } of SOURCES) {
  const source = await loadSource(file, sha256);
  const subset = await subsetFont(source, text, { targetFormat: 'woff2' });
  await writeFile(join(OUT_DIR, out), subset);
  console.log(`${out}: ${(subset.length / 1024).toFixed(1)} KB`);
  const og = await subsetFont(source, ogText(), { targetFormat: 'sfnt' });
  const ogOut = out.replace('display', 'og').replace('.woff2', '.ttf');
  await writeFile(join(OG_DIR, ogOut), og);
  console.log(`${ogOut}: ${(og.length / 1024).toFixed(1)} KB`);
}
await writeFile(join(OUT_DIR, LICENSE.out), await loadSource(LICENSE.file, LICENSE.sha256));
