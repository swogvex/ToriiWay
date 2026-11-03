import { describe, expect, it } from 'vitest';

import {
  findMondai,
  idPrefix,
  JLPT_LEVELS,
  LEVELS,
  sectionQuestions,
  totalMinutes,
} from './levels';

const questionsPerSection = (level: keyof typeof LEVELS) =>
  LEVELS[level].sections.map(sectionQuestions);

describe('level structure', () => {
  it('matches the official question counts', () => {
    expect(questionsPerSection('N5')).toEqual([21, 22, 24]);
    expect(questionsPerSection('N4')).toEqual([28, 29, 28]);
    expect(questionsPerSection('N3')).toEqual([35, 39, 28]);
    expect(questionsPerSection('kana')).toEqual([25, 23, 20]);
  });

  it('matches the official section times', () => {
    expect(totalMinutes('N5')).toBe(90);
    expect(totalMinutes('N4')).toBe(115);
    expect(totalMinutes('N3')).toBe(140);
    expect(totalMinutes('kana')).toBe(35);
  });

  it.each(JLPT_LEVELS)('%s scores out of 180 and every sub-area is scored once', (level) => {
    const config = LEVELS[level];
    expect(config.scoring.reduce((sum, section) => sum + section.max, 0)).toBe(180);
    const scored = config.scoring.flatMap((section) => section.from);
    expect(new Set(scored).size).toBe(scored.length);
    for (const section of config.sections) {
      for (const mondai of section.mondai) expect(scored).toContain(mondai.subArea);
    }
    for (const area of config.referenceGrades) expect(scored).toContain(area);
  });

  it.each(JLPT_LEVELS)('%s numbers mondai from 1 and fills passages exactly', (level) => {
    for (const section of LEVELS[level].sections) {
      expect(section.mondai.map((mondai) => mondai.number)).toEqual(
        section.mondai.map((_, index) => index + 1),
      );
      for (const mondai of section.mondai) {
        if (mondai.perPassage !== null) expect(mondai.count % mondai.perPassage).toBe(0);
        expect(mondai.audio).toBe(section.id === 'listening' || section.id === 'dictation');
        expect(mondai.spokenChoices).toBe(['utterance', 'quick-response'].includes(mondai.type));
      }
    }
  });
});

describe('helpers', () => {
  it('finds a mondai and builds its ID prefix', () => {
    expect(findMondai('N5', 'vocabulary', 2)?.type).toBe('orthography');
    expect(findMondai('N5', 'vocabulary', 5)).toBeUndefined();
    expect(findMondai('N5', 'hiragana', 1)).toBeUndefined();
    expect(idPrefix('N5', 'vocabulary', 2)).toBe('n5-voc-2-');
    expect(idPrefix('kana', 'dictation', 1)).toBe('kana-dict-1-');
  });
});
