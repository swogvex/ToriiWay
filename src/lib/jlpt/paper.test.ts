import { describe, expect, it } from 'vitest';

import { fakeBank } from './fixtures';
import { LEVELS, sectionQuestions } from './levels';
import { BankError, buildPaper, indexBank } from './paper';

describe('buildPaper', () => {
  const bank = fakeBank('N5');

  it('picks the official number of questions per mondai, without repeats', () => {
    const paper = buildPaper('N5', 42, bank);
    paper.forEach((section, index) => {
      const config = LEVELS.N5.sections[index];
      expect(section.id).toBe(config?.id);
      const ids = section.mondai.flatMap((mondai) => mondai.questionIds);
      expect(ids).toHaveLength(config ? sectionQuestions(config) : 0);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  it('is deterministic for a seed and varies between seeds', () => {
    expect(buildPaper('N5', 7, bank)).toEqual(buildPaper('N5', 7, bank));
    expect(buildPaper('N5', 7, bank)).not.toEqual(buildPaper('N5', 8, bank));
  });

  it('keeps passage questions together and in order', () => {
    const index = indexBank('N5', bank);
    const mid = buildPaper('N5', 3, bank)[1]?.mondai.find((mondai) => mondai.number === 5);
    const passages = mid?.questionIds.map((id) => index.get(id)?.question.passage);
    expect(passages).toHaveLength(2);
    expect(passages?.[0]).toBe(passages?.[1]);
    expect(mid?.questionIds).toEqual([...(mid?.questionIds ?? [])].sort());
  });

  it('fails clearly when a mondai is too small', () => {
    const small = bank.map((file) =>
      file.section === 'vocabulary' && file.mondai === 1
        ? { ...file, questions: file.questions.slice(0, 3) }
        : file,
    );
    expect(() => buildPaper('N5', 1, small)).toThrow(BankError);
    expect(() => buildPaper('N5', 1, small)).toThrow(/mondai 1 \(kanji-reading\) has 3 questions/);
  });

  it('builds every level from a bank of the right size', () => {
    for (const level of ['kana', 'N4', 'N3'] as const) {
      expect(() => buildPaper(level, 99, fakeBank(level, 1))).not.toThrow();
    }
  });
});
