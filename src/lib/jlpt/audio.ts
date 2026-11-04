// Pre-generated listening audio (scripts/jlpt/audio.ts, 09-spec-jlpt "Listening audio"):
// the SSML sent to Azure AI Speech, the Blob path of each file and the YAML edit that
// stores its URL. Pure, so it is tested without the network.

import { createHash } from 'node:crypto';

import { parseScript, type Role } from './exam/format.ts';

/** Azure neural voices per script role (owner chose Nanami and Keita). */
export const VOICES: Record<Role, string> = {
  narrator: 'ja-JP-ShioriNeural',
  man: 'ja-JP-KeitaNeural',
  woman: 'ja-JP-NanamiNeural',
};

const escapeXml = (text: string) => text.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** One voice per script line, slightly slow, with a pause after each line and after "1　". */
export function toSsml(script: string): string {
  const lines = parseScript(script).map(({ role, text }) => {
    const body = escapeXml(text).replace(/^(\d)\s+/, '$1<break time="500ms"/>');
    return `<voice name="${VOICES[role]}"><prosody rate="-10%">${body}</prosody><break time="800ms"/></voice>`;
  });
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="ja-JP">${lines.join('')}</speak>`;
}

/** Named by a hash of the SSML: a changed script or voice gets a new file. */
export function audioPath(id: string, ssml: string): string {
  const hash = createHash('sha256').update(ssml).digest('hex').slice(0, 12);
  return `jlpt/audio/${id}-${hash}.mp3`;
}

/** Sets `audio:` on one question of a bank file, keeping the rest of the text as it is. */
export function setAudio(source: string, id: string, url: string): string {
  const start = source.indexOf(`  - id: ${id}\n`);
  if (start < 0) throw new Error(`${id}: question not found`);
  const next = source.indexOf('\n  - id: ', start + 1);
  const end = next < 0 ? source.length : next;
  const block = source.slice(start, end);
  const line = `    audio: '${url}'`;
  const updated = /^ {4}audio: .*$/m.test(block)
    ? block.replace(/^ {4}audio: .*$/m, line)
    : block.replace(/^ {4}tts:$/m, `${line}\n    tts:`);
  if (updated === block && !block.includes(line)) throw new Error(`${id}: no tts block`);
  return source.slice(0, start) + updated + source.slice(end);
}
