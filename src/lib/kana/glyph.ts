/** KanjiVG draws every glyph in a 109 × 109 box. */
export const GLYPH_SIZE = 109;

/**
 * Horizontal step to the next glyph of a yōon. A small ゃ sits inside a full box, so a
 * whole box apart leaves a gap; this step keeps きゃ reading as one syllable.
 */
export const GLYPH_ADVANCE = 80;

export interface GlyphData {
  strokes: string[];
  numbers: [number, number][];
}

export interface GlyphLayout {
  /** viewBox width: the first box plus one advance per extra glyph (a yōon has two). */
  width: number;
  /** Strokes in writing order, each with the x offset of its glyph box. */
  strokes: { d: string; x: number }[];
  /** Stroke number positions, already offset, in the same order. */
  numbers: { x: number; y: number }[];
}

/**
 * Lays out the KanjiVG strokes of a kana, one or two glyphs (きゃ = き + small ゃ).
 * Returns undefined when any glyph has no data.
 */
export function glyphLayout(
  char: string,
  glyphs: Readonly<Record<string, GlyphData | undefined>>,
): GlyphLayout | undefined {
  const layout: GlyphLayout = { width: 0, strokes: [], numbers: [] };
  [...char].forEach((glyph, index) => {
    const data = glyphs[glyph];
    const x = index * GLYPH_ADVANCE;
    layout.width = x + GLYPH_SIZE;
    layout.strokes.push(...(data?.strokes ?? []).map((d) => ({ d, x })));
    layout.numbers.push(...(data?.numbers ?? []).map(([nx, ny]) => ({ x: nx + x, y: ny })));
  });
  return [...char].every((glyph) => glyphs[glyph]) ? layout : undefined;
}
