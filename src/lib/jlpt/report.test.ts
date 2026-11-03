import { describe, expect, it } from 'vitest';

import { fakeBank } from './fixtures';
import { buildPaper } from './paper';
import { buildReport, cleanName, nextLevel, percentileOf } from './report';
import type { AnswerRow } from './run';

const bank = fakeBank('N5');
const paper = buildPaper('N5', 9, bank);

/** Answers every question, correct except the first `wrong` of each section. */
function rows(wrong: number): AnswerRow[] {
  return paper.flatMap((section, number) =>
    section.mondai
      .flatMap((mondai) => mondai.questionIds)
      .map((questionId, index) => ({
        section: number,
        questionId,
        choice: index < wrong ? 2 : 1,
        correct: index >= wrong,
      })),
  );
}

describe('buildReport', () => {
  it('counts answers and lists mistakes in exam order with their numbers', () => {
    const report = buildReport('N5', 9, rows(2), bank);
    expect(report).toMatchObject({ total: 67, answered: 67, correct: 61 });
    expect(report.mistakes.map((item) => [item.section, item.number])).toEqual([
      ['vocabulary', 1],
      ['vocabulary', 2],
      ['grammar-reading', 1],
      ['grammar-reading', 2],
      ['listening', 1],
      ['listening', 2],
    ]);
    const listening = report.mistakes.find((item) => item.section === 'listening');
    expect(listening).toMatchObject({ choice: 2, answer: 1, transcript: 'N: こんにちは。' });
  });

  it('breaks results down by question type', () => {
    const report = buildReport('N5', 9, rows(0), bank);
    expect(report.breakdown).toHaveLength(14);
    expect(report.breakdown[0]).toEqual({
      section: 'vocabulary',
      type: 'kanji-reading',
      correct: 7,
      total: 7,
    });
  });

  it('treats unanswered questions as mistakes', () => {
    const report = buildReport('N5', 9, [], bank);
    expect(report).toMatchObject({ answered: 0, correct: 0, total: 67 });
    expect(report.mistakes).toHaveLength(67);
    expect(report.mistakes[0]?.choice).toBeNull();
  });
});

describe('helpers', () => {
  it('shows a percentile only with enough runs', () => {
    expect(percentileOf(49, 30)).toBeNull();
    expect(percentileOf(200, 145)).toBe(72.5);
  });

  it('suggests the next level', () => {
    expect(nextLevel('kana')).toBe('N5');
    expect(nextLevel('N5')).toBe('N4');
    expect(nextLevel('N3')).toBeNull();
  });

  it('cleans report names', () => {
    expect(cleanName('  Ana\u0000  María  ')).toBe('Ana María');
    expect(cleanName('   ')).toBeNull();
    expect(cleanName('x'.repeat(60))).toHaveLength(40);
  });
});
