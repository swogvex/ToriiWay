import { toHiragana, toKana } from 'wanakana';

/**
 * Result of checking the romaji typed so far against a bubble's reading.
 * `kana` is how many kana of the reading are already produced (for the fill);
 * `pending` is the romaji not yet converted ("k" before "ka").
 */
export type RomajiMatch =
  { status: 'miss' } | { status: 'partial'; kana: number; pending: string } | { status: 'done' };

const VOWELS = ['a', 'i', 'u', 'e', 'o'];
const LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('');

// Endings that complete any partial romaji unit: "", a vowel, or a letter + vowel
// ("t" + "te" → って, "x" + "tu" → っ, "n" + "" → ん).
const COMPLETIONS = ['', ...VOWELS, ...LETTERS.flatMap((letter) => VOWELS.map((v) => letter + v))];

const SPLIT = /^([^a-z']*)([a-z']*)$/;
const LATIN = /[a-z']/;

/**
 * The reading as the converter produces it: hiragana, keeping ー
 * (typed as "-"), so katakana targets compare like hiragana ones.
 */
export function typingForm(reading: string): string {
  return toHiragana(reading, { convertLongVowelMark: false });
}

/**
 * Checks lowercase romaji against a reading. Validation compares kana, never
 * romaji strings, so every spelling WanaKana accepts works (shi/si, tsu/tu, ja/zya/jya,
 * doubled consonants, n/nn/n'). A final ん completes with a single "n".
 */
export function matchRomaji(reading: string, typed: string): RomajiMatch {
  const target = typingForm(reading);
  if (typed === '') return { status: 'partial', kana: 0, pending: '' };

  // IME mode keeps a trailing "n" pending ("kan" stays か + n before "kana") but reads
  // "nn" as ん, so "kanna" would be かんあ; plain mode reads it as かんな. Accept either.
  const ime = matchConverted(target, toKana(typed, { IMEMode: true }));
  if (ime.status === 'done') return ime;
  const plain = matchConverted(target, toKana(typed));
  if (plain.status === 'done' || ime.status === 'miss') return plain;
  return ime;
}

function matchConverted(target: string, converted: string): RomajiMatch {
  const split = SPLIT.exec(converted);
  if (!split) return { status: 'miss' };
  const [, kana = '', pending = ''] = split;

  if (!target.startsWith(kana)) return { status: 'miss' };
  if (kana === target && pending === '') return { status: 'done' };
  if (pending === 'n' && kana + 'ん' === target) return { status: 'done' };
  if (pending === '' || canComplete(pending, target.slice(kana.length))) {
    return { status: 'partial', kana: kana.length, pending };
  }
  return { status: 'miss' };
}

/** True when some short continuation of `pending` produces the start of `rest`. */
function canComplete(pending: string, rest: string): boolean {
  if (rest === '') return false;
  return COMPLETIONS.some((ending) => {
    const kana = toKana(pending + ending);
    return kana !== '' && !LATIN.test(kana) && rest.startsWith(kana);
  });
}
