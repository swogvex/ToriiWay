import { z } from 'astro/zod';

import kanjivg from '../../data/kanjivg/kana.json';
import { romajiHint, typeable } from '../../game/romaji';
import { findMondai, idPrefix, JLPT_LEVELS, SECTION_CODE } from '../jlpt/levels';
import type { JlptLevel, SectionId } from '../jlpt/types';

// Spanish is optional until the Spanish milestone; missing values fall back to English.
export const localizedText = z.strictObject({
  en: z.string().min(1),
  es: z.string().min(1).optional(),
});

const kebabId = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use kebab-case');
const jlptLevel = z.enum(['kana', 'N5', 'N4', 'N3', 'N2', 'N1']);
const script = z.enum(['hiragana', 'katakana', 'kanji']);

export const guideSchema = z.strictObject({
  title: z.string().min(1).max(60),
  description: z.string().min(1).max(160),
  section: z.enum(['learn', 'about', 'legal']),
  order: z.number().int().nonnegative(),
  updated: z.coerce.date(),
  /**
   * Plain-text opening paragraphs, shown before the body and beside the kana chart.
   * Japanese runs are tagged lang="ja" automatically.
   */
  intro: z.array(z.string().min(1)).max(4).optional(),
});

const kanaExample = z.strictObject({
  word: z.string().min(1),
  reading: z.string().min(1),
  en: z.string().min(1),
  es: z.string().min(1).optional(),
});

// Consonant rows of the chart; `vowel` is the a–o row, yōon rows use the a/u/o columns.
const kanaRow = z.enum([
  'vowel',
  'k',
  's',
  't',
  'n',
  'h',
  'm',
  'y',
  'r',
  'w',
  'g',
  'z',
  'd',
  'b',
  'p',
  'ky',
  'sh',
  'ch',
  'ny',
  'hy',
  'my',
  'ry',
  'gy',
  'j',
  'by',
  'py',
]);

export const kanaSchema = z
  .strictObject({
    char: z.string().min(1).max(2),
    romaji: z.string().regex(/^[a-z]+$/, 'Use lowercase Hepburn romaji'),
    /** Every romaji spelling accepted in practice, the main one included. */
    variants: z.array(z.string().regex(/^[a-z]+$/)).min(1),
    row: kanaRow,
    vowel: z.enum(['a', 'i', 'u', 'e', 'o', 'n']),
    group: z.enum(['gojuon', 'dakuten', 'handakuten', 'yoon']),
    strokes: z.number().int().positive(),
    /** Original wording; required for the basic 46, optional elsewhere. */
    mnemonic: localizedText.optional(),
    examples: z.array(kanaExample).max(2).default([]),
    /** A recorded file (path under public/ or https URL); wins over browser TTS. */
    audio: z
      .string()
      .regex(/^(?:https:\/\/|\/)\S+$/, 'Use a /path or an https URL')
      .optional(),
  })
  .superRefine((kana, ctx) => {
    if (!kana.variants.includes(kana.romaji)) {
      ctx.addIssue({ code: 'custom', message: 'variants must include romaji', path: ['variants'] });
    }
    if (kana.group === 'gojuon' && !kana.mnemonic) {
      ctx.addIssue({ code: 'custom', message: 'basic kana need a mnemonic', path: ['mnemonic'] });
    }
    if (kana.group === 'gojuon' && kana.examples.length === 0) {
      ctx.addIssue({ code: 'custom', message: 'basic kana need an example', path: ['examples'] });
    }
    kana.examples.forEach((example, index) => {
      if (!example.word.includes(kana.char)) {
        ctx.addIssue({
          code: 'custom',
          message: `example "${example.word}" does not contain ${kana.char}`,
          path: ['examples', index, 'word'],
        });
      }
    });
    const expected = kanjivgStrokes(kana.char);
    if (expected === undefined) {
      ctx.addIssue({
        code: 'custom',
        message: `KanjiVG has no data for ${kana.char}`,
        path: ['char'],
      });
    } else if (kana.strokes !== expected) {
      ctx.addIssue({
        code: 'custom',
        message: `KanjiVG draws ${kana.char} in ${expected} strokes`,
        path: ['strokes'],
      });
    }
  });

/** Stroke count of a kana (a yōon adds up both glyphs), or undefined without data. */
export function kanjivgStrokes(char: string): number | undefined {
  let total = 0;
  for (const glyph of char) {
    const data = (kanjivg.glyphs as Record<string, { strokes: string[] } | undefined>)[glyph];
    if (!data) return undefined;
    total += data.strokes.length;
  }
  return total;
}

const KANA_GROUP_SIZES = { gojuon: 46, dakuten: 20, handakuten: 5, yoon: 33 } as const;
const SCRIPT_PATTERN = {
  hiragana: /^\p{Script=Hiragana}+$/u,
  katakana: /^\p{Script=Katakana}+$/u,
} as const;

// One file per script: { script, items: [...] } — collection entries must be objects.
export const kanaScriptSchema = z
  .strictObject({
    script: z.enum(['hiragana', 'katakana']),
    items: z.array(kanaSchema).min(1),
  })
  .superRefine(({ script, items }, ctx) => {
    const seen = new Map<string, number>();
    items.forEach((kana, index) => {
      if (!SCRIPT_PATTERN[script].test(kana.char)) {
        ctx.addIssue({
          code: 'custom',
          message: `${kana.char} is not ${script}`,
          path: ['items', index, 'char'],
        });
      }
      for (const key of [kana.char, `${kana.group}:${kana.row}:${kana.vowel}`]) {
        const first = seen.get(key);
        if (first !== undefined) {
          ctx.addIssue({
            code: 'custom',
            message: `duplicates items[${first}] (${key})`,
            path: ['items', index],
          });
        }
        seen.set(key, index);
      }
    });
    for (const [group, size] of Object.entries(KANA_GROUP_SIZES)) {
      const count = items.filter((kana) => kana.group === group).length;
      if (count !== size) {
        ctx.addIssue({
          code: 'custom',
          message: `expected ${size} ${group} kana, found ${count}`,
          path: ['items'],
        });
      }
    }
  });

// Sharing our own PDF is only allowed when the license says so explicitly.
const shareableLicense = /\b(CC BY|CC0|public domain|free to share)\b/i;

/**
 * Spanish (or other) text of a book: src/content/library/<locale>/<slug>.md. The facts
 * (level, link, licence…) stay only in the English entry, so they are edited in one place.
 */
export const libraryTranslationSchema = z.strictObject({
  /** Only when the title differs from the English entry. */
  title: z.string().min(1).optional(),
});

export const librarySchema = z
  .strictObject({
    title: z.string().min(1),
    author: z.string().min(1),
    level: z.array(jlptLevel).min(1),
    categories: z
      .array(z.enum(['vocabulary', 'reading', 'listening', 'kanji', 'grammar', 'jlpt']))
      .min(1),
    resources: z.strictObject({
      audio: z.boolean(),
      exercises: z.boolean(),
    }),
    editions: z.array(z.enum(['en', 'es', 'ja'])).min(1),
    pages: z.number().int().positive().optional(),
    link: z.strictObject({
      kind: z.enum(['official', 'own-pdf']),
      url: z.url({ protocol: /^https$/ }),
    }),
    license: z.string().min(1),
    coverKanji: z.string().length(1),
    featured: z.boolean().default(false),
  })
  .refine((entry) => entry.link.kind !== 'own-pdf' || shareableLicense.test(entry.license), {
    message: 'link.kind "own-pdf" requires a license that allows sharing (e.g. "CC BY 4.0")',
    path: ['license'],
  });

const videoCategory = z.enum(['kana', 'grammar', 'jlpt', 'vocabulary', 'other']);

export const videoSchema = z.strictObject({
  id: z.string().regex(/^[\w-]{11}$/, 'Expected an 11-character YouTube video ID'),
  category: videoCategory,
  featured: z.boolean().default(false),
  title: localizedText.optional(),
});

/** src/content/community/channels.yaml: the one place that names the channel and the server. */
export const channelsSchema = z.strictObject({
  youtubeChannelId: z
    .string()
    .regex(/^UC[\w-]{22}$/, 'Expected a YouTube channel ID (UC…)')
    .nullable(),
  youtubeHandle: z
    .string()
    .regex(/^@[\w.-]+$/, 'Expected the channel handle, like @name')
    .nullable(),
  discordInvite: z.url({ protocol: /^https$/, hostname: /^discord\.gg$/ }).nullable(),
});

export const communitySchema = z.strictObject({
  name: z.string().min(1),
  description: localizedText,
  channels: z.array(
    z.strictObject({
      name: kebabId,
      description: localizedText,
    }),
  ),
  /** Shown by the "Server rules" disclosure under the Discord card (owner, 2026-11-06). */
  rules: z.array(localizedText).min(1),
});

export const playlistsSchema = z.strictObject({
  playlists: z.array(
    z.strictObject({
      id: z.string().min(1),
      category: videoCategory,
    }),
  ),
});

const ttsScript = z.strictObject({
  script: z.string().min(1),
  voices: z.array(z.string().min(1)).min(1),
});

const jlptQuestion = z.strictObject({
  id: z.string().regex(/^(kana|n[1-5])-[a-z]+-\d+-\d{4}$/, 'Expected an ID like n5-voc-2-0001'),
  /** ID of a passage of this mondai (reading and text grammar). */
  passage: kebabId.optional(),
  stem: z.string().min(1),
  choices: z.array(z.string().min(1)).min(3).max(4),
  answer: z.number().int().min(1).max(4),
  // Every question explains its answer in English and Spanish.
  explanation: z.strictObject({ en: z.string().min(1), es: z.string().min(1) }),
  author: z.enum(['claude', 'owner', 'community']),
  audio: z.url().nullable().default(null),
  tts: ttsScript.nullable().default(null),
  tags: z.array(kebabId).default([]),
});

const jlptPassage = z.strictObject({
  id: kebabId,
  text: z.string().min(1),
});

type JlptMondai = {
  level: JlptLevel;
  section: SectionId;
  mondai: number;
  passages: { id: string }[];
  questions: z.infer<typeof jlptQuestion>[];
};

/** Content lint: the file matches the level structure and every question is well formed. */
function lintMondai(file: JlptMondai, ctx: z.RefinementCtx) {
  const issue = (message: string, path: (string | number)[]) =>
    ctx.addIssue({ code: 'custom', message, path });
  const config = findMondai(file.level, file.section, file.mondai);
  if (!config) {
    issue(`${file.level} ${file.section} has no mondai ${file.mondai}`, ['mondai']);
    return;
  }
  const prefix = idPrefix(file.level, file.section, file.mondai);
  const passageIds = new Set(file.passages.map((entry) => entry.id));
  if (config.perPassage === null && file.passages.length > 0) {
    issue(`${config.type} questions do not use passages`, ['passages']);
  }
  const seen = new Set<string>();
  file.questions.forEach((question, index) => {
    const at = (field: string) => ['questions', index, field];
    if (!question.id.startsWith(prefix)) issue(`ID must start with ${prefix}`, at('id'));
    if (seen.has(question.id)) issue(`Duplicate ID ${question.id}`, at('id'));
    seen.add(question.id);
    if (question.choices.length !== config.choices) {
      issue(`${config.type} needs ${config.choices} choices`, at('choices'));
    }
    const choices = question.choices.map((choice) => choice.trim());
    if (new Set(choices).size !== choices.length) issue('Choices must differ', at('choices'));
    if (question.answer > question.choices.length) {
      issue(
        `answer ${question.answer} is out of range for ${question.choices.length} choices`,
        at('answer'),
      );
    }
    const hasAudio = question.audio !== null || question.tts !== null;
    if (config.audio && !hasAudio) issue('Listening questions need audio or tts', at('tts'));
    if (!config.audio && hasAudio) issue(`${config.type} questions have no audio`, at('tts'));
    if (config.perPassage === null) {
      if (question.passage) issue(`${config.type} questions do not use passages`, at('passage'));
    } else if (!question.passage || !passageIds.has(question.passage)) {
      issue('Expected the ID of a passage in this file', at('passage'));
    }
  });
  if (config.perPassage !== null) {
    file.passages.forEach((entry, index) => {
      const used = file.questions.filter((question) => question.passage === entry.id).length;
      if (used !== config.perPassage) {
        issue(
          `passage ${entry.id} has ${used} questions; ${config.type} needs ${config.perPassage}`,
          ['passages', index],
        );
      }
    });
  }
}

export const jlptMondaiSchema = z
  .strictObject({
    level: z.enum(JLPT_LEVELS),
    section: z.enum(Object.keys(SECTION_CODE) as [SectionId, ...SectionId[]]),
    mondai: z.number().int().positive(),
    instruction: z.strictObject({
      en: z.string().min(1),
      ja: z.string().min(1),
      es: z.string().min(1).optional(),
    }),
    passages: z.array(jlptPassage).default([]),
    questions: z.array(jlptQuestion).min(1),
  })
  .superRefine(lintMondai);

const gameItem = z.strictObject({
  /** What the bubble shows; for kana lists, the reading plus optional spaces and punctuation. */
  text: z.string().min(1),
  /** Kana the player types; validation compares kana, never romaji. */
  reading: z
    .string()
    .regex(/^[\p{Script=Hiragana}\p{Script=Katakana}ー]+$/u, 'Use kana only (no spaces)'),
  en: z.string().min(1),
  es: z.string().min(1).optional(),
  source: z
    .string()
    .regex(/^tatoeba:\d+$/)
    .optional(),
});

/** An item must not repeat within this many spawns (REPEAT_WINDOW in src/game/config.ts). */
const MIN_GAME_ITEMS = 16;
/** Spaces and punctuation shown in a bubble but not typed. */
const UNTYPED = /[\s、。！？・「」]/gu;
const KANA_LENGTH = { normal: [2, 4], hard: [2, 8], extreme: [6, 30] } as const;

// Easy kana lists come from the kana collection (the basic 46), so only Easy kanji has a file.
export const gameListSchema = z
  .strictObject({
    script,
    difficulty: z.enum(['easy', 'normal', 'hard', 'extreme']),
    items: z.array(gameItem).min(MIN_GAME_ITEMS),
  })
  .superRefine((list, ctx) => {
    if (list.script !== 'kanji' && list.difficulty === 'easy') {
      ctx.addIssue({
        code: 'custom',
        message: 'Easy kana lists come from src/content/kana; remove this file',
        path: ['difficulty'],
      });
    }
    const seen = new Set<string>();
    list.items.forEach((item, index) => {
      if (seen.has(item.text)) {
        ctx.addIssue({
          code: 'custom',
          message: `duplicate "${item.text}"`,
          path: ['items', index],
        });
      }
      seen.add(item.text);
      // The hint under a bubble must be typeable: typing it completes the reading.
      if (!typeable(item.reading)) {
        ctx.addIssue({
          code: 'custom',
          message: `"${romajiHint(item.reading)}" does not complete "${item.reading}"`,
          path: ['items', index, 'reading'],
        });
      }
      if (list.script === 'kanji') return;

      if (item.text.replace(UNTYPED, '') !== item.reading) {
        ctx.addIssue({
          code: 'custom',
          message: 'text must be the reading plus spaces or punctuation',
          path: ['items', index, 'text'],
        });
      }
      const pattern =
        list.script === 'hiragana'
          ? /^\p{Script=Hiragana}+$/u
          : /^[\p{Script=Katakana}\p{Script=Hiragana}ー]+$/u;
      if (!pattern.test(item.reading)) {
        ctx.addIssue({
          code: 'custom',
          message: `reading must be ${list.script}`,
          path: ['items', index, 'reading'],
        });
      }
      const range = list.difficulty === 'easy' ? null : KANA_LENGTH[list.difficulty];
      if (range && (item.reading.length < range[0] || item.reading.length > range[1])) {
        ctx.addIssue({
          code: 'custom',
          message: `${list.difficulty} items have ${range[0]}–${range[1]} kana`,
          path: ['items', index, 'reading'],
        });
      }
    });
  });

const indexCard = z.strictObject({
  kicker: z.string().min(1).max(20),
  text: z.string().min(1).max(120),
});

// Bracket furigana after a kanji run: 一緒[いっしょ]に頑張[がんば]ろう
const rubyText = z
  .string()
  .min(1)
  .regex(/^(?:[^[\]]|(?<=[\p{Script=Han}々])\[[^[\]]+\])+$/u, 'Use 漢字[よみ] for furigana');

// Both languages are required here: the 404 ships its Spanish strings from the start (16-i18n).
const bilingualText = z.strictObject({ en: z.string().min(1), es: z.string().min(1) });
const kanaReading = z.string().regex(/^[\p{Script=Hiragana}ー]+$/u, 'Use hiragana only');

// src/content/site/404-fortunes.yaml: the omikuji of the 404 page (07-spec-shell).
export const fortuneSchema = z.strictObject({
  rank: z.string().regex(/^[\p{Script=Han}]{1,3}$/u, 'Use the rank in kanji, e.g. 小吉'),
  reading: kanaReading,
  romaji: z.string().min(1),
  meaning: bilingualText,
  message: bilingualText,
  path: z.enum(['home', 'game', 'learn', 'library', 'jlpt', 'community']),
  word: z.string().min(1),
  wordKana: kanaReading,
  wordMeaning: bilingualText,
});

export const fortunesSchema = z
  .strictObject({ fortunes: z.array(fortuneSchema).min(2).max(12) })
  .superRefine(({ fortunes }, ctx) => {
    const seen = new Set<string>();
    fortunes.forEach((fortune, index) => {
      if (seen.has(fortune.rank)) {
        ctx.addIssue({
          code: 'custom',
          path: ['fortunes', index, 'rank'],
          message: `Duplicate rank ${fortune.rank}`,
        });
      }
      seen.add(fortune.rank);
    });
  });

// One file per locale: src/content/site/<locale>/home.yaml (Home copy, footer and social links).
export const siteSchema = z.strictObject({
  title: z.string().min(1).max(60),
  description: z.string().min(1).max(160),
  hero: z
    .strictObject({
      kicker: z.string().min(1),
      /** Hidden on small screens. */
      kickerMore: z.string().min(1),
      /** The h1 for screen readers and without JavaScript. */
      title: z.string().min(1),
      /** Typed in turn after the fixed first word of the title (components/home/Hero.astro). */
      phrases: z.array(z.string().min(1)).min(1),
      lead: z.string().min(1),
      primary: z.string().min(1),
      secondary: z.string().min(1),
    })
    .superRefine((hero, ctx) => {
      const fixed = `${hero.title.split(' ')[0]} `;
      hero.phrases.forEach((phrase, index) => {
        if (!phrase.startsWith(fixed)) {
          ctx.addIssue({
            code: 'custom',
            path: ['phrases', index],
            message: `Every phrase must start with "${fixed.trim()}"`,
          });
        }
      });
    }),
  index: z.strictObject({
    game: indexCard,
    learn: indexCard,
    jlpt: indexCard,
    library: indexCard,
    community: indexCard,
  }),
  video: z.strictObject({
    kicker: z.string().min(1),
    title: z.string().min(1),
    text: z.string().min(1),
  }),
  discord: z.strictObject({
    kicker: z.string().min(1),
    title: z.string().min(1),
    cta: z.string().min(1),
  }),
  footer: z.strictObject({
    phrase: rubyText,
  }),
  social: z.strictObject({
    x: z.url({ protocol: /^https$/, hostname: /^x\.com$/ }).optional(),
    github: z.url({ protocol: /^https$/, hostname: /^github\.com$/ }).optional(),
  }),
});
