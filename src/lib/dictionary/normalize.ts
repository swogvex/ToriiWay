// Text normalisation shared by the dictionary importer and, later, the search query.
// Both sides must produce the same form, so it lives in one place.

/** Longest term stored for search; the search API rejects longer queries too. */
export const MAX_TERM_LENGTH = 64;

/** Katakana to hiragana by code point; ー and other marks are left alone. */
export function toHiraganaOnly(text: string): string {
  return text.replace(/[ァ-ヶ]/g, (char) =>
    String.fromCodePoint((char.codePointAt(0) ?? 0) - 0x60),
  );
}

/** Lowercases, drops Latin accents and tidies spaces: "Número  Uno" → "numero uno". */
export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The searchable part of a gloss: no parenthetical notes and no infinitive "to".
 * Returns null when nothing usable remains or the gloss is an explanation, not a term.
 */
export function glossTerm(gloss: string): string | null {
  const term = normalizeText(gloss.replace(/\([^)]*\)/g, ' ')).replace(/^to /, '');
  return term.length > 0 && term.length <= MAX_TERM_LENGTH ? term : null;
}

/** Kanjidic marks affixes and okurigana: "-ひと.つ" gives "ひとつ" and the stem "ひと". */
export function readingTerms(reading: string): string[] {
  const clean = toHiraganaOnly(reading.replace(/-/g, ''));
  const [stem = ''] = clean.split('.');
  return [...new Set([clean.replace('.', ''), stem])].filter(Boolean);
}

/** Every kanji (CJK ideograph) in the given forms, without repeats. */
export function kanjiChars(forms: readonly string[]): string[] {
  return [...new Set(forms.flatMap((form) => form.match(/\p{Script=Han}/gu) ?? []))];
}
