import { toHiragana, toKana, toRomaji } from 'wanakana';

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

const VOWEL_KANA: Readonly<Record<string, string>> = {
  a: 'あ',
  i: 'い',
  u: 'う',
  e: 'え',
  o: 'お',
};

/** Replaces each ー with the vowel of the kana before it: らーめん → らあめん. */
function expandLongVowels(kana: string): string {
  let previous = '';
  let result = '';
  for (const char of kana) {
    const vowel = char === 'ー' ? VOWEL_KANA[toRomaji(previous).slice(-1)] : undefined;
    result += vowel ?? char;
    previous = vowel ?? char;
  }
  return result;
}

/**
 * Checks lowercase romaji against a reading. Validation compares kana, never
 * romaji strings, so every spelling WanaKana accepts works (shi/si, tsu/tu, ja/zya/jya,
 * doubled consonants, n/nn/n'). A final ん completes with a single "n".
 * A ー in the reading accepts "-" or the vowel it lengthens (ra-men, raamen).
 */
export function matchRomaji(reading: string, typed: string): RomajiMatch {
  const longVowels = reading.includes('ー');
  const normalize = (kana: string) => (longVowels ? expandLongVowels(kana) : kana);
  const target = normalize(typingForm(reading));
  if (typed === '') return { status: 'partial', kana: 0, pending: '' };

  // IME mode keeps a trailing "n" pending ("kan" stays か + n before "kana") but reads
  // "nn" as ん, so "kanna" would be かんあ; plain mode reads it as かんな. Accept either.
  const ime = matchConverted(target, normalize(toKana(typed, { IMEMode: true })));
  if (ime.status === 'done') return ime;
  const plain = matchConverted(target, normalize(toKana(typed)));
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

/**
 * Kana WanaKana's toRomaji spells in a way the converter would not accept back
 * ("ティ" → "tei"), with the romaji to type instead. Keys are hiragana.
 */
const EXTENDED: Readonly<Record<string, string>> = {
  てぃ: 'thi',
  でぃ: 'dhi',
  でゅ: 'dhu',
  とぅ: 'twu',
  どぅ: 'dwu',
  ふぁ: 'fa',
  ふぃ: 'fi',
  ふぇ: 'fe',
  ふぉ: 'fo',
  うぃ: 'wi',
  うぇ: 'we',
  うぉ: 'who',
  ゔぁ: 'va',
  ゔぃ: 'vi',
  ゔぇ: 've',
  ゔぉ: 'vo',
  ゔ: 'vu',
  つぁ: 'tsa',
};

/**
 * The romaji shown as a hint (under a bubble, in the results): what the player can
 * type to complete the reading. ー repeats the vowel before it ("raamen").
 */
export function romajiHint(reading: string): string {
  const kana = typingForm(reading);
  let out = '';
  let plain = '';
  const flush = () => {
    if (plain) out += toRomaji(plain);
    plain = '';
  };
  for (let index = 0; index < kana.length; index++) {
    const pair = kana.slice(index, index + 2);
    const char = kana.charAt(index);
    const extended = EXTENDED[pair] ?? EXTENDED[char];
    if (extended) {
      // っ before an extended kana doubles its first consonant ("ッフィ" → "ffi").
      const doubled = plain.endsWith('っ');
      if (doubled) plain = plain.slice(0, -1);
      flush();
      out += (doubled ? extended.charAt(0) : '') + extended;
      if (EXTENDED[pair]) index += 1;
    } else if (char === 'ー') {
      flush();
      const last = out.slice(-1);
      out += VOWELS.includes(last) ? last : '-';
    } else {
      plain += char;
    }
  }
  flush();
  return out;
}

/** True when the hint is plain romaji and typing it completes the reading. */
export function typeable(reading: string): boolean {
  const hint = romajiHint(reading);
  return /^[a-z'-]+$/.test(hint) && matchRomaji(reading, hint).status === 'done';
}
