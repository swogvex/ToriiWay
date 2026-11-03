import { describe, expect, it } from 'vitest';

import { matchRomaji, typingForm } from './romaji';
import { pickTarget } from './targeting';

/** Types `romaji` key by key and returns the status after each key. */
function typeKeys(reading: string, romaji: string): string[] {
  return [...romaji].map((_, index) => matchRomaji(reading, romaji.slice(0, index + 1)).status);
}

function accepts(reading: string, romaji: string): boolean {
  const statuses = typeKeys(reading, romaji);
  return statuses.at(-1) === 'done' && statuses.slice(0, -1).every((s) => s === 'partial');
}

describe('matchRomaji', () => {
  it.each([
    ['さくら', 'sakura'],
    ['し', 'shi'],
    ['し', 'si'],
    ['ち', 'chi'],
    ['ち', 'ti'],
    ['つ', 'tsu'],
    ['つ', 'tu'],
    ['ふ', 'fu'],
    ['ふ', 'hu'],
    ['じ', 'ji'],
    ['じ', 'zi'],
    ['じゃ', 'ja'],
    ['じゃ', 'zya'],
    ['じゃ', 'jya'],
    ['きって', 'kitte'],
    ['きって', 'kixtute'],
    ['きって', 'kiltsute'],
    ['ほん', 'hon'],
    ['かんい', "kan'i"],
    ['かんい', 'kanni'],
    ['かんな', 'kanna'],
    ['かんな', 'kannna'],
    ['こんにちは', 'konnichiha'],
    ['こんにちは', 'konnnichiha'],
    ['ほんや', 'honnya'],
    ['ほんや', "hon'ya"],
    ['がっこう', 'gakkou'],
    ['でんしゃ', 'densha'],
    ['でんしゃ', 'densya'],
    ['を', 'wo'],
    ['ラーメン', 'ra-men'],
    ['ティー', 'thi-'],
    ['ファン', 'fan'],
  ])('accepts %s typed as %s', (reading, romaji) => {
    expect(accepts(reading, romaji)).toBe(true);
  });

  it('keeps a trailing n pending inside a word', () => {
    expect(matchRomaji('かんな', 'kan')).toEqual({ status: 'partial', kana: 1, pending: 'n' });
    expect(matchRomaji('かんな', 'kann')).toEqual({ status: 'partial', kana: 2, pending: '' });
  });

  it('rejects n + vowel where the reading has ん + vowel', () => {
    expect(matchRomaji('かんい', 'kani').status).toBe('miss');
    expect(matchRomaji('ほんや', 'honya').status).toBe('miss');
  });

  it('reports produced kana and pending romaji', () => {
    expect(matchRomaji('さくら', '')).toEqual({ status: 'partial', kana: 0, pending: '' });
    expect(matchRomaji('さくら', 's')).toEqual({ status: 'partial', kana: 0, pending: 's' });
    expect(matchRomaji('さくら', 'sak')).toEqual({ status: 'partial', kana: 1, pending: 'k' });
    expect(matchRomaji('きって', 'kitt')).toEqual({ status: 'partial', kana: 1, pending: 'tt' });
  });

  it('rejects keys that cannot lead to the reading', () => {
    expect(matchRomaji('さくら', 'k').status).toBe('miss');
    expect(matchRomaji('さくら', 'sq').status).toBe('miss');
    expect(matchRomaji('じ', 'd').status).toBe('miss');
    expect(matchRomaji('か', 'ka-').status).toBe('miss');
    expect(matchRomaji('か', "ka'").status).toBe('miss');
  });

  it('compares katakana readings as hiragana and keeps ー', () => {
    expect(typingForm('ラーメン')).toBe('らーめん');
  });
});

describe('pickTarget', () => {
  const bubbles = [
    { id: 1, reading: 'さくら', progress: 0.2 },
    { id: 2, reading: 'さかな', progress: 0.6 },
    { id: 3, reading: 'ねこ', progress: 0.9 },
  ];

  it('picks the bubble whose reading accepts the input', () => {
    expect(pickTarget(bubbles, 'n')?.id).toBe(3);
    expect(pickTarget(bubbles, 'saku')?.id).toBe(1);
  });

  it('breaks ties by the bubble closest to its exit edge', () => {
    expect(pickTarget(bubbles, 's')?.id).toBe(2);
    expect(pickTarget(bubbles, 'sa')?.id).toBe(2);
  });

  it('returns null for a wrong key', () => {
    expect(pickTarget(bubbles, 'q')).toBeNull();
    expect(pickTarget([], 'a')).toBeNull();
  });

  it('returns the match for the fill', () => {
    expect(pickTarget(bubbles, 'sak')?.match).toEqual({ status: 'partial', kana: 1, pending: 'k' });
  });
});
