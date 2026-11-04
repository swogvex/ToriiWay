// Plays a listening question: its pre-generated file (scripts/jlpt/audio.ts), or the
// browser's Japanese voices as the fallback (09-spec-jlpt). Each role gets its own voice
// when the browser has several; otherwise the pitch tells the speakers apart.

import { loadVoices, pickJapaneseVoice, type VoiceInfo } from '../../kana/speech';
import type { Role, ScriptLine } from './format';

const MALE = /male|man|otoya|ichiro|keita|daichi|naoki|kenji/i;
const FEMALE = /female|woman|kyoko|haruka|ayumi|nanami|aoi|mayu|shiori|sayaka/i;
const PITCH: Record<Role, number> = { narrator: 1, man: 0.8, woman: 1.2 };

/** A voice per role, from the Japanese voices available. */
export function castVoices<T extends VoiceInfo>(voices: readonly T[]): Record<Role, T> | null {
  const japanese = voices.filter((voice) => voice.lang.toLowerCase().startsWith('ja'));
  const best = pickJapaneseVoice(japanese);
  if (!best) return null;
  const man = japanese.find((voice) => MALE.test(voice.name) && !FEMALE.test(voice.name));
  const woman = japanese.find((voice) => FEMALE.test(voice.name));
  return { narrator: best, man: man ?? best, woman: woman ?? best };
}

export interface Player {
  /** False without a Japanese voice: only questions with an audio file can play. */
  canSpeak: boolean;
  /** Plays the file when there is one; the browser voice reads the script otherwise or if it fails. */
  play(lines: readonly ScriptLine[], audio?: string | null): Promise<void>;
  stop(): void;
}

/** Resolves true when the file played to the end (or was stopped), false when it failed. */
function playFile(element: HTMLAudioElement): Promise<boolean> {
  return new Promise((resolve) => {
    element.addEventListener('pause', () => resolve(true), { once: true });
    element.addEventListener('error', () => resolve(false), { once: true });
    element.play().catch(() => resolve(false));
  });
}

export async function createPlayer(): Promise<Player> {
  const cast = castVoices(await loadVoices());
  let file: HTMLAudioElement | null = null;
  const stop = () => {
    file?.pause();
    file = null;
    if (cast) speechSynthesis.cancel();
  };
  return {
    canSpeak: cast !== null,
    stop,
    async play(lines, audio) {
      stop();
      if (audio) {
        const element = new Audio(audio);
        file = element;
        if (await playFile(element)) return;
        if (file !== element) return; // stopped while it was loading
      }
      if (!cast) return;
      return new Promise((resolve) => {
        let remaining = lines.length;
        if (remaining === 0) resolve();
        for (const line of lines) {
          const utterance = new SpeechSynthesisUtterance(line.text);
          const voice = cast[line.role];
          utterance.voice = voice;
          utterance.lang = voice.lang;
          utterance.rate = 0.9;
          // Same voice for two speakers: tell them apart by pitch.
          if (voice === cast.narrator && line.role !== 'narrator')
            utterance.pitch = PITCH[line.role];
          const done = () => {
            remaining -= 1;
            if (remaining === 0) resolve();
          };
          utterance.addEventListener('end', done);
          utterance.addEventListener('error', done);
          speechSynthesis.speak(utterance);
        }
      });
    },
  };
}
