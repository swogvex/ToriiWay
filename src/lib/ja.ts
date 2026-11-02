export interface TextSegment {
  text: string;
  ja: boolean;
}

// Kana, kanji, the long-vowel mark, iteration marks and Japanese punctuation.
const JAPANESE_RUN =
  /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}ー々〆〜・「」『』、。（）！？゛゜]+/gu;

/**
 * Splits plain text into Japanese and non-Japanese runs, so each Japanese run can be
 * wrapped in `lang="ja"` (correct fonts and screen reader voice).
 */
export function splitJapanese(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(JAPANESE_RUN)) {
    if (match.index > last) segments.push({ text: text.slice(last, match.index), ja: false });
    segments.push({ text: match[0], ja: true });
    last = match.index + match[0].length;
  }
  if (last < text.length) segments.push({ text: text.slice(last), ja: false });
  return segments;
}
