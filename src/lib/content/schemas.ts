import { z } from 'astro/zod';

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
});

const kanaExample = z.strictObject({
  word: z.string().min(1),
  reading: z.string().min(1),
  en: z.string().min(1),
  es: z.string().min(1).optional(),
});

export const kanaSchema = z.strictObject({
  char: z.string().min(1).max(2),
  romaji: z.string().min(1),
  variants: z.array(z.string().min(1)).min(1),
  row: z.string().min(1),
  vowel: z.enum(['a', 'i', 'u', 'e', 'o', 'n']),
  group: z.enum(['gojuon', 'dakuten', 'handakuten', 'yoon']),
  strokes: z.number().int().positive(),
  mnemonic: localizedText,
  examples: z.array(kanaExample),
});

// One file per script: { script, items: [...] } — collection entries must be objects.
export const kanaScriptSchema = z.strictObject({
  script: z.enum(['hiragana', 'katakana']),
  items: z.array(kanaSchema).min(1),
});

// Sharing our own PDF is only allowed when the license says so explicitly.
const shareableLicense = /\b(CC BY|CC0|public domain|free to share)\b/i;

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

export const communitySchema = z.strictObject({
  name: z.string().min(1),
  invite: z.url({ protocol: /^https$/, hostname: /^discord\.gg$/ }),
  description: localizedText,
  channels: z.array(
    z.strictObject({
      name: kebabId,
      description: localizedText,
    }),
  ),
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
  stem: z.string().min(1),
  passage: z.string().min(1).optional(),
  choices: z.array(z.string().min(1)).min(2).max(4),
  answer: z.number().int().min(1).max(4),
  explanation: localizedText,
  author: z.enum(['claude', 'owner', 'community']),
  audio: z.url().nullable().default(null),
  tts: ttsScript.nullable().default(null),
  tags: z.array(kebabId).default([]),
});

export const jlptMondaiSchema = z
  .strictObject({
    level: z.enum(['kana', 'N5', 'N4', 'N3']),
    section: z.enum(['vocabulary', 'grammar-reading', 'listening', 'language', 'reading']),
    mondai: z.number().int().positive(),
    instruction: z.strictObject({
      en: z.string().min(1),
      ja: z.string().min(1),
      es: z.string().min(1).optional(),
    }),
    subArea: z.enum(['vocabulary', 'grammar', 'reading', 'listening']),
    questions: z.array(jlptQuestion).min(1),
  })
  .superRefine((mondai, ctx) => {
    mondai.questions.forEach((question, index) => {
      if (question.answer > question.choices.length) {
        ctx.addIssue({
          code: 'custom',
          message: `answer ${question.answer} is out of range for ${question.choices.length} choices`,
          path: ['questions', index, 'answer'],
        });
      }
    });
  });

const gameItem = z.strictObject({
  text: z.string().min(1),
  reading: z.string().min(1),
  en: z.string().min(1),
  es: z.string().min(1).optional(),
  source: z
    .string()
    .regex(/^tatoeba:\d+$/)
    .optional(),
});

export const gameListSchema = z.strictObject({
  script,
  difficulty: z.enum(['easy', 'normal', 'hard', 'extreme']),
  items: z.array(gameItem).min(1),
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

// One file per locale: src/content/site/<locale>/home.yaml (Home copy, footer and social links).
export const siteSchema = z.strictObject({
  title: z.string().min(1).max(60),
  description: z.string().min(1).max(160),
  hero: z.strictObject({
    kicker: z.string().min(1),
    /** Hidden on small screens. */
    kickerMore: z.string().min(1),
    title: z.string().min(1),
    lead: z.string().min(1),
    primary: z.string().min(1),
    secondary: z.string().min(1),
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
    discord: z.url({ protocol: /^https$/, hostname: /^discord\.gg$/ }),
    youtube: z.url({ protocol: /^https$/, hostname: /^(www\.)?youtube\.com$/ }),
    x: z.url({ protocol: /^https$/, hostname: /^x\.com$/ }).optional(),
    github: z.url({ protocol: /^https$/, hostname: /^github\.com$/ }).optional(),
  }),
});
