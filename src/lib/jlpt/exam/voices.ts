// Plays a listening script with the browser's Japanese voices (09-spec-jlpt: TTS
// fallback until pre-generated audio exists). Each role gets its own voice when the
// browser has several; otherwise the pitch tells the speakers apart.

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
  play(lines: readonly ScriptLine[]): Promise<void>;
  stop(): void;
}

/** Null when this browser has no Japanese voice. */
export async function createPlayer(): Promise<Player | null> {
  const cast = castVoices(await loadVoices());
  if (!cast) return null;
  return {
    stop: () => speechSynthesis.cancel(),
    play(lines) {
      speechSynthesis.cancel();
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
