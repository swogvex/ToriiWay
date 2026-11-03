import { describe, expect, it } from 'vitest';

import { modeLabel, readSettings } from './settings';

describe('play settings', () => {
  it('falls back to defaults for missing or unknown values', () => {
    expect(readSettings('?script=cyrillic&mode=zen')).toEqual({
      script: 'hiragana',
      difficulty: 'normal',
      mode: 'challenge',
      layout: 'ansi',
      hint: true,
      meaning: true,
      sound: false,
      reduce: null,
      cues: false,
      size: 'm',
      seed: null,
    });
  });

  it('reads what the setup form sends', () => {
    const query =
      '?script=katakana&difficulty=hard&mode=endless&hint=0&meaning=0&meaning=1&layout=iso-es' +
      '&sound=0&sound=1&reduce=0&cues=0&size=l&seed=7';
    expect(readSettings(query)).toEqual({
      script: 'katakana',
      difficulty: 'hard',
      mode: 'endless',
      layout: 'iso-es',
      hint: false,
      meaning: true,
      sound: true,
      reduce: false,
      cues: false,
      size: 'l',
      seed: 7,
    });
  });

  it('reads checkboxes sent after their hidden "0"', () => {
    expect(readSettings('?hint=0&hint=1&meaning=0').hint).toBe(true);
    expect(readSettings('?hint=0&hint=1&meaning=0').meaning).toBe(false);
  });

  it('builds the mode label from translated labels', () => {
    const labels = { hiragana: 'Hiragana', normal: 'Normal', challenge: 'Reto' };
    expect(modeLabel({ script: 'hiragana', difficulty: 'normal', mode: 'challenge' }, labels)).toBe(
      'Hiragana · Normal · Reto',
    );
  });
});
