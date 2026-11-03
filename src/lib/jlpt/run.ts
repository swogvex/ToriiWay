// Server-authoritative run state. Pure functions: the API loads a run, applies one
// transition with the server clock and saves the result.

import { findMondai, LEVELS, TIMING } from './levels';
import type { BankMondai, BankQuestion, PaperSection } from './paper';
import { scoreRun, type AnsweredQuestion, type ScoreReport } from './scoring';
import type { JlptLevel } from './types';

const SECOND = 1000;
const DAY = 24 * 60 * 60 * SECOND;
/** Result pages expire after this many days. */
export const RUN_LIFETIME_DAYS = 180;

export type RunStatus = 'section' | 'break' | 'finished';

export interface SectionResult {
  section: number;
  answered: number;
  total: number;
  /** Seconds used, capped at the section time. */
  seconds: number;
}

export interface RunRecord {
  id: string;
  level: JlptLevel;
  seed: number;
  status: RunStatus;
  /** The current section, or the next one during a break. */
  section: number;
  /** Times are epoch milliseconds from the server clock. */
  sectionStartsAt: number;
  deadline: number;
  breakStartedAt: number | null;
  results: SectionResult[];
  isPublic: boolean;
  createdAt: number;
  finishedAt: number | null;
  expiresAt: number;
  scores: ScoreReport | null;
}

export interface SubmittedAnswer {
  id: string;
  choice: number | null;
  /** When the choice was made (server time, as estimated by the client). */
  at: number;
}

export interface AnswerRow {
  section: number;
  questionId: string;
  choice: number | null;
  correct: boolean;
}

export type RunErrorCode = 'not-in-section' | 'wrong-section' | 'not-in-break' | 'break-not-over';

export class RunError extends Error {
  constructor(readonly code: RunErrorCode) {
    super(code);
  }
}

function startSection(run: RunRecord, section: number, at: number): RunRecord {
  const config = LEVELS[run.level].sections[section];
  if (!config) throw new RangeError(`${run.level} has no section ${section}`);
  const sectionStartsAt = at + TIMING.countdown * SECOND;
  return {
    ...run,
    status: 'section',
    section,
    sectionStartsAt,
    deadline: sectionStartsAt + config.minutes * 60 * SECOND,
    breakStartedAt: null,
  };
}

export function createRun(options: {
  id: string;
  level: JlptLevel;
  seed: number;
  isPublic: boolean;
  now: number;
}): RunRecord {
  const { now, ...rest } = options;
  const blank: RunRecord = {
    ...rest,
    status: 'section',
    section: 0,
    sectionStartsAt: now,
    deadline: now,
    breakStartedAt: null,
    results: [],
    createdAt: now,
    finishedAt: null,
    expiresAt: now + RUN_LIFETIME_DAYS * DAY,
    scores: null,
  };
  return startSection(blank, 0, now);
}

/** Applies the transitions that happen on their own: a break that ran out starts the next section. */
export function advance(run: RunRecord, now: number): RunRecord {
  if (run.status !== 'break' || run.breakStartedAt === null) return run;
  const breakEnds = run.breakStartedAt + TIMING.breakMax * SECOND;
  return now >= breakEnds ? startSection(run, run.section, breakEnds) : run;
}

/** The player ends the break early (allowed after the mandatory minute). */
export function continueRun(run: RunRecord, now: number): RunRecord {
  if (run.status !== 'break' || run.breakStartedAt === null) throw new RunError('not-in-break');
  if (now < run.breakStartedAt + TIMING.breakMin * SECOND) throw new RunError('break-not-over');
  return startSection(run, run.section, now);
}

/**
 * Finalizes the current section. Answers made after the deadline (plus tolerance) are
 * dropped, so a late submission keeps only what was answered in time.
 */
export function submitSection(
  run: RunRecord,
  section: number,
  answers: readonly SubmittedAnswer[],
  paper: PaperSection,
  key: ReadonlyMap<string, Pick<BankQuestion, 'answer' | 'choices'>>,
  now: number,
): { run: RunRecord; rows: AnswerRow[] } {
  if (run.status !== 'section') throw new RunError('not-in-section');
  if (section !== run.section) throw new RunError('wrong-section');
  const cutoff = run.deadline + TIMING.lateTolerance * SECOND;
  const chosen = new Map<string, number | null>();
  for (const answer of answers) {
    if (answer.at > cutoff) continue;
    chosen.set(answer.id, answer.choice);
  }
  const rows = paper.mondai.flatMap((mondai) =>
    mondai.questionIds.map((questionId): AnswerRow => {
      const question = key.get(questionId);
      const raw = chosen.get(questionId) ?? null;
      const valid = question && raw !== null && raw >= 1 && raw <= question.choices.length;
      const choice = valid ? raw : null;
      return {
        section,
        questionId,
        choice,
        correct: choice !== null && choice === question?.answer,
      };
    }),
  );
  const used = Math.min(now, run.deadline) - run.sectionStartsAt;
  const result: SectionResult = {
    section,
    answered: rows.filter((row) => row.choice !== null).length,
    total: rows.length,
    seconds: Math.max(0, Math.round(used / SECOND)),
  };
  const last = section === LEVELS[run.level].sections.length - 1;
  const next: RunRecord = last
    ? { ...run, status: 'finished', finishedAt: now, results: [...run.results, result] }
    : {
        ...run,
        status: 'break',
        section: section + 1,
        breakStartedAt: now,
        results: [...run.results, result],
      };
  return { run: next, rows };
}

/** Scores every answer of a finished run. */
export function scoreAnswers(
  level: JlptLevel,
  rows: readonly AnswerRow[],
  index: ReadonlyMap<string, { mondai: BankMondai }>,
): ScoreReport {
  const questions = rows.flatMap((row): AnsweredQuestion[] => {
    const file = index.get(row.questionId)?.mondai;
    const config = file && findMondai(level, file.section, file.mondai);
    return config ? [{ subArea: config.subArea, correct: row.correct }] : [];
  });
  return scoreRun(level, questions);
}

/** What the client may see about a run. */
export function publicState(run: RunRecord, now: number) {
  const breakStartedAt = run.breakStartedAt;
  return {
    id: run.id,
    level: run.level,
    status: run.status,
    section: run.section,
    sectionStartsAt: run.sectionStartsAt,
    deadline: run.deadline,
    breakMinEndsAt: breakStartedAt === null ? null : breakStartedAt + TIMING.breakMin * SECOND,
    breakEndsAt: breakStartedAt === null ? null : breakStartedAt + TIMING.breakMax * SECOND,
    results: run.results,
    serverNow: now,
  };
}

export type PublicRunState = ReturnType<typeof publicState>;
