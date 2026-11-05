import { describe, expect, it } from 'vitest';

import { foldName, isOffensive, nameProblem, normalizeName } from './names';

describe('leaderboard names', () => {
  it('accepts 3–16 letters, digits, _ and -', () => {
    for (const name of ['Ken', 'kana_fan-99', 'A'.repeat(16), 'Zora', 'Paola', 'grape_jam']) {
      expect(nameProblem(name)).toBeNull();
    }
  });

  it('rejects the wrong length or characters', () => {
    for (const name of ['ab', 'A'.repeat(17), 'with space', 'ñandú', 'emoji🙂', 'dot.name', '']) {
      expect(nameProblem(name)).toBe('format');
    }
  });

  it('is case-insensitive, so two people cannot share a name by changing case', () => {
    expect(normalizeName('Kenji_99')).toBe(normalizeName('kENJI_99'));
  });

  it('folds look-alike digits, separators and repeated letters', () => {
    expect(foldName('F_u-u-u-C_K')).toBe('fuck');
    expect(foldName('sh1t')).toBe('shit');
    expect(foldName('p3n3')).toBe('pene');
  });

  it('catches offensive words and their disguised variants', () => {
    for (const name of ['fuck', 'xXfUcKXx', 'sh1t_lord', 'b1tch', 'm1erda', 'h1tl3r', 'fuuuck']) {
      expect(isOffensive(name), name).toBe(true);
      expect(nameProblem(name)).toBe('offensive');
    }
  });

  it('does not block ordinary names that contain short fragments', () => {
    for (const name of ['Cassandra', 'peacock', 'classic', 'Dickens', 'Hancock', 'Hiroshi']) {
      expect(isOffensive(name), name).toBe(false);
    }
  });
});
