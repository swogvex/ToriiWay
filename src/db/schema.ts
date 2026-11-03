// Postgres schema (Drizzle). Migrations live in drizzle/ and are generated with `pnpm db:generate`.

import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
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
