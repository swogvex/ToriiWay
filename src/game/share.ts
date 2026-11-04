// The 1200×630 share card, drawn in the browser. Nothing is uploaded: the PNG only
// leaves the page through Download or the clipboard.

export const CARD = { width: 1200, height: 630, pad: 60 } as const;

export interface CardPalette {
  bg: string;
  ink: string;
  muted: string;
  line: string;
}

export interface CardFonts {
  ui: string;
  mono: string;
  ja: string;
}

export interface CardData {
  /** "ToriiWay · Kana Rush". */
  title: string;
  date: string;
  /** "SWOGVEX · HIRAGANA NORMAL · CLEARED" (already joined, without the name when empty). */
  kicker: string;
  wpm: number;
  /** Stat pairs on the bottom row, e.g. ["acc", "94%"]. */
  stats: readonly (readonly [string, string])[];
  wpmLabel: string;
  /** Big background glyph: あ, ア or 字. */
  glyph: string;
}

/** Waits for the faces the card uses, so the first draw is not in a fallback font. */
export async function loadCardFonts(fonts: CardFonts, glyph: string): Promise<void> {
  await Promise.allSettled([
    document.fonts.load(`700 40px ${fonts.ui}`),
    document.fonts.load(`400 28px ${fonts.mono}`),
    document.fonts.load(`700 28px ${fonts.mono}`),
    document.fonts.load(`700 600px ${fonts.ja}`, glyph),
  ]);
}

function spaced(ctx: CanvasRenderingContext2D, value: string): void {
  // letterSpacing is missing in older engines; the card still reads fine without it.
  if ('letterSpacing' in ctx) ctx.letterSpacing = value;
}

export function drawCard(
  canvas: HTMLCanvasElement,
  data: CardData,
  palette: CardPalette,
  fonts: CardFonts,
  logo: HTMLImageElement | null,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { width, height, pad } = CARD;
  canvas.width = width;
  canvas.height = height;

  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, width, height);

  // Watermark glyph, cut by the bottom edge.
  ctx.fillStyle = palette.line;
  ctx.font = `700 600px ${fonts.ja}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(data.glyph, width - 20, height + 90);

  // Header: logo, title, date.
  const logoSize = 52;
  if (logo?.complete && logo.naturalWidth > 0) ctx.drawImage(logo, pad, pad, logoSize, logoSize);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = palette.ink;
  ctx.font = `700 32px ${fonts.ui}`;
  ctx.fillText(data.title, pad + logoSize + 20, pad + logoSize / 2);
  ctx.textAlign = 'right';
  ctx.fillStyle = palette.muted;
  ctx.font = `400 24px ${fonts.mono}`;
  ctx.fillText(data.date, width - pad, pad + logoSize / 2);

  // Kicker and the big WPM.
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  spaced(ctx, '2px');
  ctx.font = `400 26px ${fonts.mono}`;
  ctx.fillText(data.kicker.toUpperCase(), pad, 240);
  spaced(ctx, '0px');
  ctx.fillStyle = palette.ink;
  ctx.font = `400 200px ${fonts.mono}`;
  const big = String(data.wpm);
  ctx.fillText(big, pad - 8, 430);
  const bigWidth = ctx.measureText(big).width;
  ctx.fillStyle = palette.muted;
  ctx.font = `400 56px ${fonts.mono}`;
  ctx.fillText(data.wpmLabel, pad + bigWidth + 24, 430);

  // Bottom row: label muted, value bold.
  let x = pad;
  for (const [label, value] of data.stats) {
    ctx.fillStyle = palette.muted;
    ctx.font = `400 28px ${fonts.mono}`;
    ctx.fillText(label, x, height - pad);
    x += ctx.measureText(label).width + 14;
    ctx.fillStyle = palette.ink;
    ctx.font = `700 28px ${fonts.mono}`;
    ctx.fillText(value, x, height - pad);
    x += ctx.measureText(value).width + 44;
  }
}

export function cardBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

/** True where an image can be put on the clipboard. */
export function canCopyImage(): boolean {
  return typeof ClipboardItem !== 'undefined' && typeof navigator.clipboard?.write === 'function';
}
