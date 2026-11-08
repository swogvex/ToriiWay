// Postgres schema (Drizzle). Migrations live in drizzle/ and are generated with `pnpm db:generate`.

import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import type { SectionResult } from '../lib/jlpt/run';
import type { ScoreReport } from '../lib/jlpt/scoring';

const time = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const jlptRuns = pgTable(
  'jlpt_runs',
  {
    id: uuid('id').primaryKey(),
    level: text('level').notNull(),
    seed: integer('seed').notNull(),
    status: text('status').notNull(),
    section: smallint('section').notNull(),
    sectionStartsAt: time('section_starts_at').notNull(),
    deadline: time('deadline').notNull(),
    breakStartedAt: time('break_started_at'),
    results: jsonb('results').$type<SectionResult[]>().notNull(),
    isPublic: boolean('is_public').notNull(),
    nickname: text('nickname'),
    /** Optional name the player chose for the score report. */
    name: text('name'),
    /** Only after the player asks for the results email; cleared 30 days after sending. */
    email: text('email'),
    emailSentAt: time('email_sent_at'),
    createdAt: time('created_at').notNull(),
    finishedAt: time('finished_at'),
    expiresAt: time('expires_at').notNull(),
    scores: jsonb('scores').$type<ScoreReport>(),
    passed: boolean('passed'),
  },
  (table) => [
    index('jlpt_runs_level_finished_idx').on(table.level, table.finishedAt),
    index('jlpt_runs_public_finished_idx').on(table.isPublic, table.finishedAt),
    index('jlpt_runs_expires_idx').on(table.expiresAt),
  ],
);

export const jlptAnswers = pgTable(
  'jlpt_answers',
  {
    runId: uuid('run_id')
      .notNull()
      .references(() => jlptRuns.id, { onDelete: 'cascade' }),
    section: smallint('section').notNull(),
    questionId: text('question_id').notNull(),
    choice: smallint('choice'),
    correct: boolean('correct').notNull(),
  },
  (table) => [primaryKey({ columns: [table.runId, table.questionId] })],
);

export const jlptFeedback = pgTable(
  'jlpt_feedback',
  {
    runId: uuid('run_id')
      .notNull()
      .references(() => jlptRuns.id, { onDelete: 'cascade' }),
    section: smallint('section').notNull(),
    rating: text('rating').notNull(),
  },
  (table) => [primaryKey({ columns: [table.runId, table.section] })],
);

/** Fixed-window counters keyed by route + hashed IP; purged after a day. */
export const rateLimits = pgTable(
  'rate_limits',
  {
    key: text('key').notNull(),
    windowStart: time('window_start').notNull(),
    count: integer('count').notNull(),
  },
  (table) => [primaryKey({ columns: [table.key, table.windowStart] })],
);

/** "Report a problem" submissions, reviewed on /admin. */
export const reports = pgTable(
  'reports',
  {
    id: uuid('id').primaryKey(),
    questionId: text('question_id').notNull(),
    runId: uuid('run_id').references(() => jlptRuns.id, { onDelete: 'set null' }),
    category: text('category').notNull(),
    message: text('message').notNull(),
    createdAt: time('created_at').notNull(),
    status: text('status').notNull(),
  },
  (table) => [index('reports_status_created_idx').on(table.status, table.createdAt)],
);

/** Kana Rush runs handed out at the countdown (single use, purged by the daily cron). */
export const gameRuns = pgTable(
  'game_runs',
  {
    id: uuid('id').primaryKey(),
    seed: integer('seed').notNull(),
    script: text('script').notNull(),
    difficulty: text('difficulty').notNull(),
    mode: text('mode').notNull(),
    serverStart: time('server_start').notNull(),
    usedAt: time('used_at'),
  },
  (table) => [index('game_runs_server_start_idx').on(table.serverStart)],
);

/** Who owns a leaderboard name (sha256 of the browser's submitter token), and admin blocks. */
export const gameNames = pgTable('game_names', {
  nameNormalized: text('name_normalized').primaryKey(),
  submitterHash: text('submitter_hash').notNull(),
  blocked: boolean('blocked').notNull().default(false),
  createdAt: time('created_at').notNull(),
});

/** One leaderboard entry per name and script × difficulty × mode. */
export const gameScores = pgTable(
  'game_scores',
  {
    id: uuid('id').primaryKey(),
    /** No foreign key: used runs are purged a day later, the entry stays. Unique = no replays. */
    runId: uuid('run_id').notNull().unique(),
    name: text('name').notNull(),
    nameNormalized: text('name_normalized')
      .notNull()
      .references(() => gameNames.nameNormalized, { onDelete: 'cascade' }),
    submitterHash: text('submitter_hash').notNull(),
    script: text('script').notNull(),
    difficulty: text('difficulty').notNull(),
    mode: text('mode').notNull(),
    cleared: boolean('cleared').notNull(),
    durationS: integer('duration_s').notNull(),
    wpm: doublePrecision('wpm').notNull(),
    rawWpm: doublePrecision('raw_wpm').notNull(),
    accuracy: doublePrecision('accuracy').notNull(),
    consistency: doublePrecision('consistency').notNull(),
    popped: integer('popped').notNull(),
    missed: integer('missed').notNull(),
    series: jsonb('series').$type<number[]>().notNull(),
    errors: jsonb('errors').$type<number[]>().notNull(),
    status: text('status').notNull().default('visible'),
    reports: integer('reports').notNull().default(0),
    createdAt: time('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('game_scores_name_combo_idx').on(
      table.nameNormalized,
      table.script,
      table.difficulty,
      table.mode,
    ),
    index('game_scores_combo_wpm_idx').on(
      table.script,
      table.difficulty,
      table.mode,
      table.status,
      table.wpm.desc(),
    ),
    index('game_scores_combo_duration_idx').on(
      table.script,
      table.difficulty,
      table.mode,
      table.status,
      table.durationS.desc(),
    ),
    index('game_scores_status_wpm_idx').on(table.status, table.wpm.desc()),
  ],
);

/** Reports on leaderboard entries (offensive name or suspicious score), reviewed on /admin. */
export const gameReports = pgTable(
  'game_reports',
  {
    id: uuid('id').primaryKey(),
    scoreId: uuid('score_id')
      .notNull()
      .references(() => gameScores.id, { onDelete: 'cascade' }),
    reason: text('reason').notNull(),
    status: text('status').notNull().default('open'),
    createdAt: time('created_at').notNull(),
  },
  (table) => [
    index('game_reports_status_created_idx').on(table.status, table.createdAt),
    index('game_reports_score_idx').on(table.scoreId),
  ],
);

/** Anonymous aggregate counters (library clicks): one row per key and UTC day, no visitor data. */
export const counters = pgTable(
  'counters',
  {
    key: text('key').notNull(),
    day: date('day', { mode: 'string' }).notNull(),
    value: integer('value').notNull(),
  },
  (table) => [primaryKey({ columns: [table.key, table.day] })],
);

// Dictionary tables: replaced as a whole by scripts/dictionary, so they carry no foreign keys.

const trigram = (column: AnyPgColumn) => sql`${column} gin_trgm_ops`;

/** KANJIDIC2, with JLPT levels from OpenJLPT. */
export const kanji = pgTable('kanji', {
  literal: text('literal').primaryKey(),
  grade: smallint('grade'),
  jlpt: smallint('jlpt'),
  strokes: smallint('strokes').notNull(),
  freq: smallint('freq'),
  meaningsEn: text('meanings_en').array().notNull(),
  meaningsEs: text('meanings_es').array().notNull(),
  onReadings: text('on_readings').array().notNull(),
  kunReadings: text('kun_readings').array().notNull(),
});

/** JMdict entries; `id` is the upstream ent_seq, so word URLs stay stable between imports. */
export const words = pgTable(
  'words',
  {
    id: integer('id').primaryKey(),
    kanjiForms: text('kanji_forms').array().notNull(),
    readings: text('readings').array().notNull(),
    kanjiChars: text('kanji_chars').array().notNull(),
    common: boolean('common').notNull(),
    jlpt: smallint('jlpt'),
  },
  (table) => [index('words_kanji_chars_idx').using('gin', table.kanjiChars)],
);

export const wordSenses = pgTable(
  'word_senses',
  {
    wordId: integer('word_id').notNull(),
    position: smallint('position').notNull(),
    pos: text('pos').array().notNull(),
    glossesEn: text('glosses_en').array().notNull(),
    glossesEs: text('glosses_es').array().notNull(),
  },
  (table) => [primaryKey({ columns: [table.wordId, table.position] })],
);

/** One normalised search term per row: kanji form, hiragana reading, English or Spanish gloss. */
export const wordTerms = pgTable(
  'word_terms',
  {
    wordId: integer('word_id').notNull(),
    term: text('term').notNull(),
    kind: text('kind').notNull(),
  },
  (table) => [
    index('word_terms_term_idx').on(sql`${table.term} text_pattern_ops`),
    index('word_terms_trgm_idx').using('gin', trigram(table.term)),
    index('word_terms_word_idx').on(table.wordId),
  ],
);

export const kanjiTerms = pgTable(
  'kanji_terms',
  {
    literal: text('literal').notNull(),
    term: text('term').notNull(),
    kind: text('kind').notNull(),
  },
  (table) => [
    index('kanji_terms_term_idx').on(sql`${table.term} text_pattern_ops`),
    index('kanji_terms_trgm_idx').using('gin', trigram(table.term)),
  ],
);

/** Tatoeba sentences chosen by OpenJLPT; `id` builds the attribution link. */
export const sentences = pgTable('sentences', {
  id: integer('id').primaryKey(),
  ja: text('ja').notNull(),
  /** Furigana markup: {漢字|かんじ}. */
  reading: text('reading'),
  en: text('en'),
  es: text('es'),
});

export const wordSentences = pgTable(
  'word_sentences',
  {
    wordId: integer('word_id').notNull(),
    sentenceId: integer('sentence_id').notNull(),
  },
  (table) => [primaryKey({ columns: [table.wordId, table.sentenceId] })],
);

/** What is loaded and from where; the credits page shows it. */
export const dataSources = pgTable('data_sources', {
  name: text('name').primaryKey(),
  version: text('version').notNull(),
  license: text('license').notNull(),
  url: text('url').notNull(),
  importedAt: time('imported_at').notNull(),
});
