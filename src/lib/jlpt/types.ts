// Types for the JLPT simulation structure (data in levels.ts).

export type JlptLevel = 'kana' | 'N5' | 'N4' | 'N3' | 'N2' | 'N1';

export type SectionId =
  | 'hiragana'
  | 'katakana'
  | 'dictation'
  | 'vocabulary'
  | 'grammar-reading'
  /** N2 and N1 test vocabulary, grammar and reading in one section. */
  | 'language-reading'
  | 'listening';

/** Bucket used for scoring sections and reference grades. */
export type SubArea =
  'hiragana' | 'katakana' | 'dictation' | 'vocabulary' | 'grammar' | 'reading' | 'listening';

export type ScoringId =
  'hiragana' | 'katakana' | 'dictation' | 'language-reading' | 'language' | 'reading' | 'listening';

export interface MondaiConfig {
  number: number;
  /** Question type, kebab-case (e.g. `kanji-reading`). */
  type: string;
  /** Official name of the question type (site-only names for Kana). */
  ja: string;
  /** Questions per paper. */
  count: number;
  choices: 3 | 4;
  subArea: SubArea;
  /** Questions per shared passage; null when questions stand alone. */
  perPassage: number | null;
  /** Each question needs audio (a file or a TTS script). */
  audio: boolean;
  /** Choices are only heard, as in the real test; their text is shown after the run. */
  spokenChoices: boolean;
}

export interface SectionConfig {
  id: SectionId;
  ja: string;
  minutes: number;
  mondai: readonly MondaiConfig[];
}

export interface ScoringSection {
  id: ScoringId;
  ja: string;
  max: number;
  min: number;
  from: readonly SubArea[];
}

export interface LevelConfig {
  id: JlptLevel;
  /** Prefix of question IDs (`n5-voc-2-0001`). */
  code: string;
  sections: readonly SectionConfig[];
  scoring: readonly ScoringSection[];
  passMark: number;
  /** Sub-areas that get an A/B/C reference grade. */
  referenceGrades: readonly SubArea[];
  /** How many times a listening clip may be played. */
  replays: number;
}
