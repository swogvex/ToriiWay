import { describe, expect, it } from 'vitest';

import { MAX_DESCRIPTION, metaDescription, pageTitle } from './seo';

describe('pageTitle', () => {
  it('keeps every part when it fits', () => {
    expect(pageTitle('Genki I', 'Library', 'ToriiWay')).toBe('Genki I · Library · ToriiWay');
  });

  it('drops the section, then the site name, never the page name', () => {
    const long = 'Kanji para recordar 1 · Curso mnemotécnico';
    expect(pageTitle(long, 'Biblioteca', 'ToriiWay')).toBe(`${long} · ToriiWay`);
    const longer = 'Minna no Nihongo Shokyu II · Translation & Grammar Notes';
    expect(pageTitle(longer, 'Library', 'ToriiWay')).toBe(longer);
    const longest = 'A'.repeat(70);
    expect(pageTitle(longest, 'Library', 'ToriiWay')).toBe(longest);
  });
});

describe('metaDescription', () => {
  it('leaves a short text alone', () => {
    expect(metaDescription('  Learn kana.\n ')).toBe('Learn kana.');
  });

  it('cuts a long text at a word and ends it with an ellipsis', () => {
    const text = `${'word '.repeat(40)}end.`;
    const result = metaDescription(text);
    expect(result.length).toBeLessThanOrEqual(MAX_DESCRIPTION);
    expect(result).toMatch(/word…$/);
  });
});
