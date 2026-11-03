import { describe, expect, it } from 'vitest';

import { castVoices } from './voices';

const voice = (name: string, lang = 'ja-JP') => ({ name, lang });

describe('castVoices', () => {
  it('gives the man and the woman their own voices when there are some', () => {
    const cast = castVoices([
      voice('Microsoft Keita Online (Natural)'),
      voice('Microsoft Nanami Online (Natural)'),
      voice('Google US English', 'en-US'),
    ]);
    expect(cast?.man.name).toContain('Keita');
    expect(cast?.woman.name).toContain('Nanami');
  });

  it('falls back to the best Japanese voice for every role', () => {
    const cast = castVoices([voice('Google 日本語')]);
    expect(cast?.man).toBe(cast?.narrator);
    expect(cast?.woman).toBe(cast?.narrator);
  });

  it('is null without a Japanese voice', () => {
    expect(castVoices([voice('Alex', 'en-US')])).toBeNull();
  });
});
