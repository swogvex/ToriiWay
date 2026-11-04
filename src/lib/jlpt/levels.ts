// JLPT simulation structure. Adding a level is configuration here plus a question bank.
// N5/N4 counts: jlpt.jp notice of 2020-09-10 (revised from the December 2020 test).
// N3, N2 and N1 counts: official guidebook 問題の構成 (guidebook_s_j.pdf, p. 7); section times
// from jlpt.jp/e/guideline/testsections.html (N1 listening 55 min since December 2022).
// Kana is a site-only level; its structure and pass rule are our own.

import type {
  JlptLevel,
  LevelConfig,
  MondaiConfig,
  SectionConfig,
  SectionId,
  SubArea,
} from './types';

export type * from './types';

/** Short code per section, used in question IDs. */
export const SECTION_CODE: Readonly<Record<SectionId, string>> = {
  hiragana: 'hira',
  katakana: 'kata',
  dictation: 'dict',
  vocabulary: 'voc',
  'grammar-reading': 'grm',
  'language-reading': 'lr',
  listening: 'lis',
};

export const TIMING = {
  /** Seconds of grace after a section deadline before answers are ignored. */
  lateTolerance: 30,
  breakMin: 60,
  breakMax: 15 * 60,
  countdown: 3,
} as const;

type MondaiOptions = Partial<
  Pick<MondaiConfig, 'choices' | 'perPassage' | 'audio' | 'spokenChoices'>
>;

function mondai(
  number: number,
  type: string,
  ja: string,
  count: number,
  subArea: SubArea,
  options: MondaiOptions = {},
): MondaiConfig {
  return {
    number,
    type,
    ja,
    count,
    subArea,
    choices: options.choices ?? 4,
    perPassage: options.perPassage ?? null,
    audio: options.audio ?? false,
    spokenChoices: options.spokenChoices ?? false,
  };
}

// Utterance and quick-response choices are only heard (3 choices in the real test).
const listen = (choices: 3 | 4 = 4): MondaiOptions => ({
  audio: true,
  choices,
  spokenChoices: choices === 3,
});
const passage = (perPassage: number): MondaiOptions => ({ perPassage });

const KANA: LevelConfig = {
  id: 'kana',
  code: 'kana',
  sections: [
    {
      id: 'hiragana',
      ja: 'ひらがな',
      minutes: 10,
      mondai: [
        mondai(1, 'kana-reading', 'よみかた', 10, 'hiragana'),
        mondai(2, 'kana-writing', 'かきかた', 10, 'hiragana'),
        mondai(3, 'kana-spelling', 'ことばのかきかた', 5, 'hiragana'),
      ],
    },
    {
      id: 'katakana',
      ja: 'カタカナ・すうじ',
      minutes: 10,
      mondai: [
        mondai(1, 'kana-reading', 'よみかた', 10, 'katakana'),
        mondai(2, 'kana-writing', 'かきかた', 8, 'katakana'),
        mondai(3, 'numbers', 'すうじ', 5, 'katakana'),
      ],
    },
    {
      id: 'dictation',
      ja: 'ききとり',
      minutes: 15,
      mondai: [
        mondai(1, 'kana-dictation', 'おとをきく', 10, 'dictation', listen()),
        mondai(2, 'word-dictation', 'ことばをきく', 10, 'dictation', listen()),
      ],
    },
  ],
  // Site rule: pass at 60% overall and at least 40% in every section.
  scoring: [
    { id: 'hiragana', ja: 'ひらがな', max: 60, min: 24, from: ['hiragana'] },
    { id: 'katakana', ja: 'カタカナ・すうじ', max: 60, min: 24, from: ['katakana'] },
    { id: 'dictation', ja: 'ききとり', max: 60, min: 24, from: ['dictation'] },
  ],
  passMark: 108,
  referenceGrades: [],
  replays: 2,
};

const N5: LevelConfig = {
  id: 'N5',
  code: 'n5',
  sections: [
    {
      id: 'vocabulary',
      ja: '言語知識（文字・語彙）',
      minutes: 20,
      mondai: [
        mondai(1, 'kanji-reading', '漢字読み', 7, 'vocabulary'),
        mondai(2, 'orthography', '表記', 5, 'vocabulary'),
        mondai(3, 'contextual', '文脈規定', 6, 'vocabulary'),
        mondai(4, 'paraphrase', '言い換え類義', 3, 'vocabulary'),
      ],
    },
    {
      id: 'grammar-reading',
      ja: '言語知識（文法）・読解',
      minutes: 40,
      mondai: [
        mondai(1, 'grammar-form', '文法形式の判断', 9, 'grammar'),
        mondai(2, 'sentence-composition', '文の組み立て', 4, 'grammar'),
        mondai(3, 'text-grammar', '文章の文法', 4, 'grammar', passage(4)),
        mondai(4, 'short-passage', '内容理解（短文）', 2, 'reading', passage(1)),
        mondai(5, 'mid-passage', '内容理解（中文）', 2, 'reading', passage(2)),
        mondai(6, 'information-retrieval', '情報検索', 1, 'reading', passage(1)),
      ],
    },
    {
      id: 'listening',
      ja: '聴解',
      minutes: 30,
      mondai: [
        mondai(1, 'task', '課題理解', 7, 'listening', listen()),
        mondai(2, 'point', 'ポイント理解', 6, 'listening', listen()),
        mondai(3, 'utterance', '発話表現', 5, 'listening', listen(3)),
        mondai(4, 'quick-response', '即時応答', 6, 'listening', listen(3)),
      ],
    },
  ],
  scoring: [
    {
      id: 'language-reading',
      ja: '言語知識（文字・語彙・文法）・読解',
      max: 120,
      min: 38,
      from: ['vocabulary', 'grammar', 'reading'],
    },
    { id: 'listening', ja: '聴解', max: 60, min: 19, from: ['listening'] },
  ],
  passMark: 80,
  referenceGrades: ['vocabulary', 'grammar', 'reading'],
  replays: 1,
};

const N4: LevelConfig = {
  ...N5,
  id: 'N4',
  code: 'n4',
  sections: [
    {
      id: 'vocabulary',
      ja: '言語知識（文字・語彙）',
      minutes: 25,
      mondai: [
        mondai(1, 'kanji-reading', '漢字読み', 7, 'vocabulary'),
        mondai(2, 'orthography', '表記', 5, 'vocabulary'),
        mondai(3, 'contextual', '文脈規定', 8, 'vocabulary'),
        mondai(4, 'paraphrase', '言い換え類義', 4, 'vocabulary'),
        mondai(5, 'usage', '用法', 4, 'vocabulary'),
      ],
    },
    {
      id: 'grammar-reading',
      ja: '言語知識（文法）・読解',
      minutes: 55,
      mondai: [
        mondai(1, 'grammar-form', '文法形式の判断', 13, 'grammar'),
        mondai(2, 'sentence-composition', '文の組み立て', 4, 'grammar'),
        mondai(3, 'text-grammar', '文章の文法', 4, 'grammar', passage(4)),
        mondai(4, 'short-passage', '内容理解（短文）', 3, 'reading', passage(1)),
        mondai(5, 'mid-passage', '内容理解（中文）', 3, 'reading', passage(3)),
        mondai(6, 'information-retrieval', '情報検索', 2, 'reading', passage(2)),
      ],
    },
    {
      id: 'listening',
      ja: '聴解',
      minutes: 35,
      mondai: [
        mondai(1, 'task', '課題理解', 8, 'listening', listen()),
        mondai(2, 'point', 'ポイント理解', 7, 'listening', listen()),
        mondai(3, 'utterance', '発話表現', 5, 'listening', listen(3)),
        mondai(4, 'quick-response', '即時応答', 8, 'listening', listen(3)),
      ],
    },
  ],
  passMark: 90,
};

const N3: LevelConfig = {
  id: 'N3',
  code: 'n3',
  sections: [
    {
      id: 'vocabulary',
      ja: '言語知識（文字・語彙）',
      minutes: 30,
      mondai: [
        mondai(1, 'kanji-reading', '漢字読み', 8, 'vocabulary'),
        mondai(2, 'orthography', '表記', 6, 'vocabulary'),
        mondai(3, 'contextual', '文脈規定', 11, 'vocabulary'),
        mondai(4, 'paraphrase', '言い換え類義', 5, 'vocabulary'),
        mondai(5, 'usage', '用法', 5, 'vocabulary'),
      ],
    },
    {
      id: 'grammar-reading',
      ja: '言語知識（文法）・読解',
      minutes: 70,
      mondai: [
        mondai(1, 'grammar-form', '文法形式の判断', 13, 'grammar'),
        mondai(2, 'sentence-composition', '文の組み立て', 5, 'grammar'),
        mondai(3, 'text-grammar', '文章の文法', 5, 'grammar', passage(5)),
        mondai(4, 'short-passage', '内容理解（短文）', 4, 'reading', passage(1)),
        mondai(5, 'mid-passage', '内容理解（中文）', 6, 'reading', passage(3)),
        mondai(6, 'long-passage', '内容理解（長文）', 4, 'reading', passage(4)),
        mondai(7, 'information-retrieval', '情報検索', 2, 'reading', passage(2)),
      ],
    },
    {
      id: 'listening',
      ja: '聴解',
      minutes: 40,
      mondai: [
        mondai(1, 'task', '課題理解', 6, 'listening', listen()),
        mondai(2, 'point', 'ポイント理解', 6, 'listening', listen()),
        mondai(3, 'summary', '概要理解', 3, 'listening', listen()),
        mondai(4, 'utterance', '発話表現', 4, 'listening', listen(3)),
        mondai(5, 'quick-response', '即時応答', 9, 'listening', listen(3)),
      ],
    },
  ],
  scoring: [
    {
      id: 'language',
      ja: '言語知識（文字・語彙・文法）',
      max: 60,
      min: 19,
      from: ['vocabulary', 'grammar'],
    },
    { id: 'reading', ja: '読解', max: 60, min: 19, from: ['reading'] },
    { id: 'listening', ja: '聴解', max: 60, min: 19, from: ['listening'] },
  ],
  passMark: 95,
  referenceGrades: ['vocabulary', 'grammar'],
  replays: 1,
};

// N2 and N1: one language knowledge · reading section, then listening. Reading passages:
// mid-size texts carry 3 questions, the long and integrated texts carry them all.
const N2: LevelConfig = {
  ...N3,
  id: 'N2',
  code: 'n2',
  sections: [
    {
      id: 'language-reading',
      ja: '言語知識（文字・語彙・文法）・読解',
      minutes: 105,
      mondai: [
        mondai(1, 'kanji-reading', '漢字読み', 5, 'vocabulary'),
        mondai(2, 'orthography', '表記', 5, 'vocabulary'),
        mondai(3, 'word-formation', '語形成', 5, 'vocabulary'),
        mondai(4, 'contextual', '文脈規定', 7, 'vocabulary'),
        mondai(5, 'paraphrase', '言い換え類義', 5, 'vocabulary'),
        mondai(6, 'usage', '用法', 5, 'vocabulary'),
        mondai(7, 'grammar-form', '文法形式の判断', 12, 'grammar'),
        mondai(8, 'sentence-composition', '文の組み立て', 5, 'grammar'),
        mondai(9, 'text-grammar', '文章の文法', 5, 'grammar', passage(5)),
        mondai(10, 'short-passage', '内容理解（短文）', 5, 'reading', passage(1)),
        mondai(11, 'mid-passage', '内容理解（中文）', 9, 'reading', passage(3)),
        mondai(12, 'integrated', '統合理解', 2, 'reading', passage(2)),
        mondai(13, 'thematic', '主張理解（長文）', 3, 'reading', passage(3)),
        mondai(14, 'information-retrieval', '情報検索', 2, 'reading', passage(2)),
      ],
    },
    {
      id: 'listening',
      ja: '聴解',
      minutes: 50,
      mondai: [
        mondai(1, 'task', '課題理解', 5, 'listening', listen()),
        mondai(2, 'point', 'ポイント理解', 6, 'listening', listen()),
        mondai(3, 'summary', '概要理解', 5, 'listening', listen()),
        mondai(4, 'quick-response', '即時応答', 12, 'listening', listen(3)),
        mondai(5, 'listening-integrated', '統合理解', 4, 'listening', listen()),
      ],
    },
  ],
  passMark: 90,
};

const N1: LevelConfig = {
  ...N3,
  id: 'N1',
  code: 'n1',
  sections: [
    {
      id: 'language-reading',
      ja: '言語知識（文字・語彙・文法）・読解',
      minutes: 110,
      mondai: [
        mondai(1, 'kanji-reading', '漢字読み', 6, 'vocabulary'),
        mondai(2, 'contextual', '文脈規定', 7, 'vocabulary'),
        mondai(3, 'paraphrase', '言い換え類義', 6, 'vocabulary'),
        mondai(4, 'usage', '用法', 6, 'vocabulary'),
        mondai(5, 'grammar-form', '文法形式の判断', 10, 'grammar'),
        mondai(6, 'sentence-composition', '文の組み立て', 5, 'grammar'),
        mondai(7, 'text-grammar', '文章の文法', 5, 'grammar', passage(5)),
        mondai(8, 'short-passage', '内容理解（短文）', 4, 'reading', passage(1)),
        mondai(9, 'mid-passage', '内容理解（中文）', 9, 'reading', passage(3)),
        mondai(10, 'long-passage', '内容理解（長文）', 4, 'reading', passage(4)),
        mondai(11, 'integrated', '統合理解', 3, 'reading', passage(3)),
        mondai(12, 'thematic', '主張理解（長文）', 4, 'reading', passage(4)),
        mondai(13, 'information-retrieval', '情報検索', 2, 'reading', passage(2)),
      ],
    },
    {
      id: 'listening',
      ja: '聴解',
      minutes: 55,
      mondai: [
        mondai(1, 'task', '課題理解', 6, 'listening', listen()),
        mondai(2, 'point', 'ポイント理解', 7, 'listening', listen()),
        mondai(3, 'summary', '概要理解', 6, 'listening', listen()),
        mondai(4, 'quick-response', '即時応答', 14, 'listening', listen(3)),
        mondai(5, 'listening-integrated', '統合理解', 4, 'listening', listen()),
      ],
    },
  ],
  passMark: 100,
};

export const JLPT_LEVELS: readonly JlptLevel[] = ['kana', 'N5', 'N4', 'N3', 'N2', 'N1'];

export const LEVELS: Readonly<Record<JlptLevel, LevelConfig>> = { kana: KANA, N5, N4, N3, N2, N1 };

export function findMondai(
  level: JlptLevel,
  section: SectionId,
  number: number,
): MondaiConfig | undefined {
  return LEVELS[level].sections
    .find((entry) => entry.id === section)
    ?.mondai.find((entry) => entry.number === number);
}

export function sectionQuestions(section: SectionConfig): number {
  return section.mondai.reduce((sum, entry) => sum + entry.count, 0);
}

export function totalMinutes(level: JlptLevel): number {
  return LEVELS[level].sections.reduce((sum, section) => sum + section.minutes, 0);
}

/** The question ID prefix for a mondai, e.g. `n5-voc-2-`. */
export function idPrefix(level: JlptLevel, section: SectionId, number: number): string {
  return `${LEVELS[level].code}-${SECTION_CODE[section]}-${number}-`;
}
