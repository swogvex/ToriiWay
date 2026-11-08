// Stroke paths from KanjiVG's combined XML, read with patterns because its markup is regular.

export interface StrokeRow {
  literal: string;
  strokes: string[];
}

/** KanjiVG draws on a 109 × 109 grid. */
export const STROKE_GRID = 109;
const NUMBER_OFFSET = 6;
const NUMBER_MARGIN = 6;

/** One row per kanji in `known`, strokes in writing order. */
export function parseKanjiVg(xml: string, known: ReadonlySet<string>): StrokeRow[] {
  const rows: StrokeRow[] = [];
  for (const [block, hex] of xml.matchAll(/<kanji id="kvg:kanji_([\da-f]+)">.*?<\/kanji>/gs)) {
    const literal = String.fromCodePoint(Number.parseInt(hex ?? '', 16));
    if (!known.has(literal)) continue;
    const strokes = [...block.matchAll(/<path id="[^"]*-s(\d+)"[^>]*\sd="([^"]+)"/g)]
      .sort((a, b) => Number(a[1]) - Number(b[1]))
      .map((match) => match[2] ?? '');
    if (strokes.length > 0) rows.push({ literal, strokes });
  }
  return rows;
}

const clamp = (value: number) =>
  Math.min(Math.max(value, NUMBER_MARGIN), STROKE_GRID - NUMBER_MARGIN);

/** The XML has no number positions, so each number sits just before its stroke starts. */
export function strokeNumbers(strokes: readonly string[]): { x: number; y: number }[] {
  return strokes.map((stroke) => {
    const [, x = '0', y = '0'] = /^M\s*([\d.]+)[\s,]+([\d.]+)/.exec(stroke) ?? [];
    return { x: clamp(Number(x) - NUMBER_OFFSET), y: clamp(Number(y) - 2) };
  });
}
