/**
 * Replaces the <text> wordmark in the horizontal logos with outlined <path>s,
 * so the logo renders identically without the fonts (e.g. inside <img>).
 * Run with `pnpm brand:outline` after `pnpm fonts:copy` and `pnpm fonts:subset`.
 * Idempotent: files without <text> are left untouched.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import opentype, { type Font } from 'opentype.js';
import subsetFont from 'subset-font';

const LOGOS = ['logo-horizontal-light.svg', 'logo-horizontal-dark.svg'];

const FONT_FILES: Record<string, string> = {
  'Schibsted Grotesk': 'schibsted-grotesk-latin-700-normal.woff2',
  'Zen Kaku Gothic New': 'zen-kaku-gothic-new-display-400.woff2',
};

const TEXT_ELEMENT = /<text\s([^>]*)>([^<]*)<\/text>/g;
const OUTLINE_NOTE = /\s*<!-- Wordmark uses <text>;[^>]*-->/;

function attr(attrs: string, name: string): string {
  const match = new RegExp(`${name}="([^"]*)"`).exec(attrs);
  if (!match?.[1]) throw new Error(`Missing ${name} in <text ${attrs}>`);
  return match[1];
}

async function loadFont(family: string, text: string): Promise<Font> {
  const file = FONT_FILES[family];
  if (!file) throw new Error(`No font file mapped for ${family}`);
  // opentype.js cannot read woff2; subset-font converts it to plain sfnt.
  const sfnt = await subsetFont(await readFile(join('public', 'fonts', file)), text, {
    targetFormat: 'sfnt',
  });
  return opentype.parse(new Uint8Array(sfnt).buffer);
}

async function outline(attrs: string, text: string): Promise<string> {
  const family = attr(attrs, 'font-family').split(',')[0]?.trim().replace(/'/g, '') ?? '';
  const font = await loadFont(family, text);
  const size = Number(attr(attrs, 'font-size'));
  const spacing = Number(/letter-spacing="([^"]*)"/.exec(attrs)?.[1] ?? 0);
  const scale = size / font.unitsPerEm;

  let x = Number(attr(attrs, 'x'));
  const y = Number(attr(attrs, 'y'));
  const glyphs = font.stringToGlyphs(text);
  const parts: string[] = [];
  glyphs.forEach((glyph, index) => {
    parts.push(glyph.getPath(x, y, size).toPathData({ decimalPlaces: 2, flipY: false }));
    const next = glyphs[index + 1];
    const kerning = next ? font.getKerningValue(glyph, next) : 0;
    x += ((glyph.advanceWidth ?? 0) + kerning) * scale + spacing;
  });
  return `<path fill="${attr(attrs, 'fill')}" d="${parts.join('')}"/>`;
}

for (const name of LOGOS) {
  const path = join('public', 'brand', name);
  const svg = await readFile(path, 'utf8');
  const matches = [...svg.matchAll(TEXT_ELEMENT)];
  if (matches.length === 0) {
    console.log(`${name}: already outlined`);
    continue;
  }
  let result = svg.replace(OUTLINE_NOTE, '');
  for (const [element, attrs = '', text = ''] of matches) {
    result = result.replace(element, await outline(attrs, text));
  }
  await writeFile(path, result);
  console.log(`${name}: outlined ${matches.length} text elements`);
}
