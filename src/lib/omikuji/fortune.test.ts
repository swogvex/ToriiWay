import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import { fortunesSchema } from '../content/schemas';
import { drawIndex, isBad, PATH_GLYPH, PATH_HREF, tiedGlyph } from './fortune';

const file = fortunesSchema.parse(
  parse(readFileSync('src/content/site/404-fortunes.yaml', 'utf8')),
).fortunes;

describe('drawIndex', () => {
  it('never repeats the previous fortune', () => {
    for (let previous = 0; previous < 6; previous++) {
      for (const value of [0, 0.1, 0.2, 0.4, 0.5, 0.7, 0.9, 0.99999]) {
        const next = drawIndex(6, previous, () => value);
        expect(next).not.toBe(previous);
        expect(next).toBeGreaterThanOrEqual(0);
        expect(next).toBeLessThan(6);
      }
    }
  });

  it('can reach every other fortune', () => {
    const seen = new Set<number>();
    for (let step = 0; step < 50; step++) seen.add(drawIndex(6, 2, () => step / 50));
    expect([...seen].sort()).toEqual([0, 1, 3, 4, 5]);
  });

  it('draws any fortune the first time and survives a random() of 1', () => {
    expect(drawIndex(6, null, () => 0)).toBe(0);
    expect(drawIndex(6, null, () => 1)).toBe(5);
    expect(drawIndex(6, 5, () => 1)).toBe(4);
    expect(drawIndex(1, 0, () => 0.5)).toBe(0);
  });
});

describe('fortunes', () => {
  it('map each fortune to its own path', () => {
    expect(Object.fromEntries(file.map((fortune) => [fortune.rank, fortune.path]))).toEqual({
      大凶: 'home',
      凶: 'learn',
      末吉: 'game',
      小吉: 'library',
      吉: 'jlpt',
      中吉: 'community',
    });
    expect(new Set(file.map((fortune) => fortune.path)).size).toBe(file.length);
  });

  it('every path has a link and a glyph', () => {
    for (const fortune of file) {
      expect(PATH_HREF[fortune.path]).toMatch(/^\//);
      expect(PATH_GLYPH[fortune.path]).toHaveLength(1);
    }
    expect(PATH_HREF.learn).toBe('/learn/hiragana');
  });

  it('tells bad fortunes apart and picks the tied glyph', () => {
    expect(file.filter((fortune) => isBad(fortune.rank)).map((f) => f.rank)).toEqual([
      '大凶',
      '凶',
    ]);
    expect(tiedGlyph('小吉')).toBe('吉');
    expect(tiedGlyph('凶')).toBe('凶');
  });

  it('rejects a duplicate rank', () => {
    const twice = { fortunes: [file[0], file[0]] };
    expect(fortunesSchema.safeParse(twice).success).toBe(false);
  });
});
