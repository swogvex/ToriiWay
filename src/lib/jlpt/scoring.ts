import { LEVELS } from './levels';
import type { JlptLevel, ScoringId, SubArea } from './types';

export type Grade = 'A' | 'B' | 'C';

/** One question of the paper: its bucket and whether it was answered correctly. */
export interface AnsweredQuestion {
  subArea: SubArea;
  correct: boolean;
}

export interface ScoredSection {
  id: ScoringId;
  raw: number;
  total: number;
  scaled: number;
  max: number;
  min: number;
  passed: boolean;
}

export interface ScoreReport {
  level: JlptLevel;
  sections: ScoredSection[];
  total: number;
  max: number;
  passMark: number;
  passed: boolean;
  grades: Partial<Record<SubArea, Grade>>;
}

/** Reference grade from a correct ratio: A ≥ 67%, B 34–66%, C < 34%. */
export function grade(correct: number, total: number): Grade {
  const ratio = total === 0 ? 0 : correct / total;
  if (ratio >= 0.67) return 'A';
  if (ratio >= 0.34) return 'B';
  return 'C';
}

/** Linear mapping of the raw ratio onto the section's scale, rounded. */
export function scale(correct: number, total: number, max: number): number {
  return total === 0 ? 0 : Math.round((correct / total) * max);
}

function tally(questions: readonly AnsweredQuestion[], areas: readonly SubArea[]) {
  const inside = questions.filter((question) => areas.includes(question.subArea));
  return {
    raw: inside.filter((question) => question.correct).length,
    total: inside.length,
  };
}

/**
 * Scores a run. `questions` lists every question of the paper, so unanswered
 * questions count as wrong.
 */
export function scoreRun(level: JlptLevel, questions: readonly AnsweredQuestion[]): ScoreReport {
  const config = LEVELS[level];
  const sections = config.scoring.map((section): ScoredSection => {
    const { raw, total } = tally(questions, section.from);
    const scaled = scale(raw, total, section.max);
    return {
      id: section.id,
      raw,
      total,
      scaled,
      max: section.max,
      min: section.min,
      passed: scaled >= section.min,
    };
  });
  const total = sections.reduce((sum, section) => sum + section.scaled, 0);
  const grades: Partial<Record<SubArea, Grade>> = {};
  for (const area of config.referenceGrades) {
    const { raw, total: count } = tally(questions, [area]);
    grades[area] = grade(raw, count);
  }
  return {
    level,
    sections,
    total,
    max: sections.reduce((sum, section) => sum + section.max, 0),
    passMark: config.passMark,
    passed: total >= config.passMark && sections.every((section) => section.passed),
    grades,
  };
}
