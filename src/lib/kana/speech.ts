/** The fields of a speech synthesis voice the ranking reads. */
export type VoiceInfo = Pick<SpeechSynthesisVoice, 'lang' | 'name'>;

// Higher-quality voices usually say so in their name.
const QUALITY = /natural|online|neural|enhanced|premium|google/i;

/**
 * The best Japanese voice available (10-spec-learn: Audio): ja-JP before other ja
 * variants, then voices that name themselves as high quality. Undefined without one.
 */
export function pickJapaneseVoice<T extends VoiceInfo>(voices: readonly T[]): T | undefined {
  let best: T | undefined;
  let bestScore = 0;
  for (const voice of voices) {
    const lang = voice.lang.replace('_', '-').toLowerCase();
    if (!lang.startsWith('ja')) continue;
    const score = 1 + (lang === 'ja-jp' ? 2 : 0) + (QUALITY.test(voice.name) ? 1 : 0);
    if (score > bestScore) {
      best = voice;
      bestScore = score;
    }
  }
  return best;
}

/**
 * The browser's voices. Chrome fills the list asynchronously, so wait for
 * `voiceschanged` (up to `timeout`) when it starts empty.
 */
export function loadVoices(timeout = 1500): Promise<SpeechSynthesisVoice[]> {
  if (!('speechSynthesis' in window)) return Promise.resolve([]);
  const voices = speechSynthesis.getVoices();
  if (voices.length > 0) return Promise.resolve(voices);
  return new Promise((resolve) => {
    const done = () => resolve(speechSynthesis.getVoices());
    speechSynthesis.addEventListener('voiceschanged', done, { once: true });
    setTimeout(done, timeout);
  });
}

/** Says a kana or word with the given voice, a little slower than normal speech. */
export function speak(text: string, voice: SpeechSynthesisVoice): void {
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.voice = voice;
  utterance.lang = voice.lang;
  utterance.rate = 0.8;
  speechSynthesis.speak(utterance);
}
