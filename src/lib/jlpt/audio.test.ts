import { describe, expect, it } from 'vitest';

import { audioPath, setAudio, toSsml } from './audio';

describe('toSsml', () => {
  it('gives each role its voice and escapes XML', () => {
    const ssml = toSsml('N: はなして　います。\nM: A&B <です>\nF: 1　はい');
    expect(ssml).toContain('<voice name="ja-JP-ShioriNeural"><prosody rate="-10%">はなして');
    expect(ssml).toContain('ja-JP-KeitaNeural"><prosody rate="-10%">A&#38;B &#60;です&#62;');
    expect(ssml).toContain('ja-JP-NanamiNeural"><prosody rate="-10%">1<break time="500ms"/>はい');
    expect(ssml.startsWith('<speak version="1.0"')).toBe(true);
  });
});

describe('audioPath', () => {
  it('changes when the SSML changes', () => {
    const a = audioPath('n5-lis-1-0001', toSsml('N: あ'));
    expect(a).toMatch(/^jlpt\/audio\/n5-lis-1-0001-[0-9a-f]{12}\.mp3$/);
    expect(audioPath('n5-lis-1-0001', toSsml('N: い'))).not.toBe(a);
  });
});

describe('setAudio', () => {
  const yaml = [
    'questions:',
    '  - id: q-1',
    '    author: claude',
    '    tts:',
    "      script: 'N: か'",
    '  - id: q-2',
    "    audio: 'https://old'",
    '    tts:',
    "      script: 'N: き'",
    '',
  ].join('\n');

  it('inserts audio before tts, or replaces the old URL, only in that question', () => {
    const once = setAudio(yaml, 'q-1', 'https://new/1.mp3');
    expect(once).toContain("    author: claude\n    audio: 'https://new/1.mp3'\n    tts:");
    expect(once).toContain("audio: 'https://old'");
    const twice = setAudio(once, 'q-2', 'https://new/2.mp3');
    expect(twice).not.toContain('https://old');
    expect(twice.match(/audio:/g)).toHaveLength(2);
    expect(setAudio(twice, 'q-2', 'https://new/2.mp3')).toBe(twice);
  });

  it('fails on an unknown question', () => {
    expect(() => setAudio(yaml, 'q-9', 'x')).toThrow('q-9');
  });
});
