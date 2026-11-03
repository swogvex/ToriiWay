// Data for the result page (09-spec-jlpt: result page, artboard 14). Pure: the page
// loads the run, its answers and the bank, then renders what this returns.

import { findMondai, LEVELS } from './levels';
import { buildPaper, indexBank, type BankMondai } from './paper';
import type { AnswerRow } from './run';
import type { JlptLevel, SectionId } from './types';

/** Percentiles appear once this many runs of the level exist (09-spec-jlpt). */
export const PERCENTILE_MIN_RUNS = 50;

export interface ReviewItem {
  id: string;
  /** Question number inside its section, as shown during the exam. */
  number: number;
  section: SectionId;
  mondai: number;
  type: string;
  instruction: BankMondai['instruction'];
  passage: string | null;
  stem: string;
  choices: string[];
  answer: number;
  choice: number | null;
  explanation: { en: string; es: string };
  /** Listening script, shown only after the run (accessibility: transcript). */
  transcript: string | null;
}

export interface TypeResult {
  section: SectionId;
  type: string;
  correct: number;
  total: number;
}

export interface ReportData {
  answered: number;
  correct: number;
  total: number;
  breakdown: TypeResult[];
  mistakes: ReviewItem[];
}

export function buildReport(
  level: JlptLevel,
  seed: number,
  rows: readonly AnswerRow[],
  bank: readonly BankMondai[],
): ReportData {
  const byId = new Map(rows.map((row) => [row.questionId, row]));
  const index = indexBank(level, bank);
  const breakdown: TypeResult[] = [];
  const mistakes: ReviewItem[] = [];
  let answered = 0;
  let correct = 0;
  let total = 0;

  for (const section of buildPaper(level, seed, bank)) {
    let number = 0;
    for (const entry of section.mondai) {
      const config = findMondai(level, section.id, entry.number);
      const result: TypeResult = {
        section: section.id,
        type: config?.type ?? '',
        correct: 0,
        total: 0,
      };
      for (const questionId of entry.questionIds) {
        number += 1;
        const found = index.get(questionId);
        if (!found) continue;
        const row = byId.get(questionId);
        const isCorrect = row?.correct ?? false;
        result.total += 1;
        total += 1;
        if (row?.choice !== null && row?.choice !== undefined) answered += 1;
        if (isCorrect) {
          result.correct += 1;
          correct += 1;
          continue;
        }
        const { question, mondai } = found;
        mistakes.push({
          id: question.id,
          number,
          section: section.id,
          mondai: entry.number,
          type: result.type,
          instruction: mondai.instruction,
          passage: mondai.passages.find((passage) => passage.id === question.passage)?.text ?? null,
          stem: question.stem,
          choices: question.choices,
          answer: question.answer,
          choice: row?.choice ?? null,
          explanation: question.explanation,
          transcript: question.tts?.script ?? null,
        });
      }
      breakdown.push(result);
    }
  }
  return { answered, correct, total, breakdown, mistakes };
}

/** Percentile of a total among finished runs, or null until there are enough runs. */
export function percentileOf(runs: number, below: number): number | null {
  if (runs < PERCENTILE_MIN_RUNS) return null;
  return Math.round((below / runs) * 1000) / 10;
}

/** The next level up for "Try the next simulation", if there is one. */
export function nextLevel(level: JlptLevel): JlptLevel | null {
  const order: JlptLevel[] = ['kana', 'N5', 'N4', 'N3'];
  return order[order.indexOf(level) + 1] ?? null;
}

/** Report name: control characters removed, spaces collapsed, at most 40 characters. */
export function cleanName(value: string): string | null {
  const name = value.replace(/\p{C}/gu, '').replace(/\s+/g, ' ').trim().slice(0, 40).trim();
  return name === '' ? null : name;
}

/** Sections in exam order, for grouping the breakdown. */
export const sectionsOf = (level: JlptLevel) => LEVELS[level].sections.map((section) => section.id);
