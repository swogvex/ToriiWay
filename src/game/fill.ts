import type { GameItem } from './run';

/** Spaces and punctuation shown in a bubble but not typed (same set as the content schema). */
const UNTYPED = /[\s、。！？・「」]/u;

/**
 * How many characters of the bubble text to fill once `kana` kana of the
 * reading are typed. Kana text fills kana by kana, skipping spaces and
 * punctuation; kanji text (surface ≠ reading) fills in proportion.
 */
export function filledChars(item: GameItem, kana: number): number {
  const chars = [...item.text];
  const typed = chars.filter((char) => !UNTYPED.test(char));
  if (typed.join('') !== item.reading) {
    return Math.floor((chars.length * Math.min(kana, item.reading.length)) / item.reading.length);
  }
  if (kana >= typed.length) return chars.length;
  let count = 0;
  let filled = 0;
  for (const char of chars) {
    if (count >= kana) break;
    filled += 1;
    if (!UNTYPED.test(char)) count += 1;
  }
  return filled;
}
