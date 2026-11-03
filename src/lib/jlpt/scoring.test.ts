import { describe, expect, it } from 'vitest';

import { grade, scale, scoreRun, type AnsweredQuestion } from './scoring';
import type { SubArea } from './types';

/** `correct` of `total` questions in one sub-area. */
function answers(subArea: SubArea, correct: number, total: number): AnsweredQuestion[] {
  return Array.from({ length: total }, (_, index) => ({ subArea, correct: index < correct }));
}

describe('grade', () => {
  it('uses the reference grade bands', () => {
    expect(grade(67, 100)).toBe('A');
    expect(grade(66, 100)).toBe('B');
    expect(grade(34, 100)).toBe('B');
    expect(grade(33, 100)).toBe('C');
    expect(grade(0, 0)).toBe('C');
  });
});

describe('scale', () => {
  it('maps the raw ratio linearly and rounds', () => {
    expect(scale(43, 43, 120)).toBe(120);
    expect(scale(20, 43, 120)).toBe(56);
    expect(scale(0, 0, 60)).toBe(0);
  });
});

describe('scoreRun', () => {
  it('passes an N5 run above the pass mark and both minimums', () => {
    const report = scoreRun('N5', [
      ...answers('vocabulary', 18, 21),
      ...answers('grammar', 12, 17),
      ...answers('reading', 3, 5),
      ...answers('listening', 12, 24),
    ]);
    expect(report.sections.map((section) => section.scaled)).toEqual([92, 30]);
    expect(report.total).toBe(122);
    expect(report.max).toBe(180);
    expect(report.passed).toBe(true);
    expect(report.grades).toEqual({ vocabulary: 'A', grammar: 'A', reading: 'B' });
  });

  it('fails a run that misses a section minimum even above the pass mark', () => {
    const report = scoreRun('N5', [
      ...answers('vocabulary', 21, 21),
      ...answers('grammar', 17, 17),
      ...answers('reading', 5, 5),
      ...answers('listening', 7, 24),
    ]);
    expect(report.total).toBe(138);
    expect(report.sections[1]).toMatchObject({ scaled: 18, min: 19, passed: false });
    expect(report.passed).toBe(false);
  });

  it('scores N3 language knowledge and reading separately', () => {
    const report = scoreRun('N3', [
      ...answers('vocabulary', 35, 35),
      ...answers('grammar', 23, 23),
      ...answers('reading', 4, 16),
      ...answers('listening', 28, 28),
    ]);
    expect(report.sections.map((section) => [section.id, section.scaled])).toEqual([
      ['language', 60],
      ['reading', 15],
      ['listening', 60],
    ]);
    expect(report.passed).toBe(false);
    expect(Object.keys(report.grades)).toEqual(['vocabulary', 'grammar']);
  });

  it('applies the kana site rule: 60% overall and 40% per section', () => {
    const pass = scoreRun('kana', [
      ...answers('hiragana', 15, 25),
      ...answers('katakana', 14, 23),
      ...answers('dictation', 12, 20),
    ]);
    expect(pass.total).toBe(109);
    expect(pass.passed).toBe(true);
    expect(pass.grades).toEqual({});

    const fail = scoreRun('kana', [
      ...answers('hiragana', 25, 25),
      ...answers('katakana', 23, 23),
      ...answers('dictation', 7, 20),
    ]);
    expect(fail.total).toBe(141);
    expect(fail.passed).toBe(false);
  });
});
