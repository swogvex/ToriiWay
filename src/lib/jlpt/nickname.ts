// Random-looking public nicknames for "recent runs" (09-spec-jlpt): an English
// adjective and a Japanese word, derived from the run ID so nothing personal is stored
// or shown. Original word list.

const ADJECTIVES = [
  'Quiet',
  'Brave',
  'Sleepy',
  'Swift',
  'Gentle',
  'Bright',
  'Lucky',
  'Calm',
  'Clever',
  'Happy',
  'Little',
  'Mighty',
  'Patient',
  'Curious',
  'Steady',
  'Sunny',
  'Wise',
  'Kind',
  'Bold',
  'Merry',
  'Nimble',
  'Cosy',
  'Eager',
  'Humble',
] as const;

const NOUNS = [
  'Tanuki',
  'Onigiri',
  'Koi',
  'Kitsune',
  'Sakura',
  'Daruma',
  'Mochi',
  'Tsuru',
  'Neko',
  'Kappa',
  'Fuji',
  'Bonsai',
  'Ramen',
  'Taiko',
  'Torii',
  'Momiji',
  'Hotaru',
  'Usagi',
  'Kame',
  'Tsuki',
  'Kumo',
  'Sora',
  'Yuki',
  'Hana',
] as const;

function hash(text: string): number {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    value = Math.imul(value ^ text.charCodeAt(index), 0x01000193);
  }
  return value >>> 0;
}

/** Stable nickname for a run, e.g. "QuietTanuki". */
export function nicknameFor(runId: string): string {
  const value = hash(runId);
  const adjective = ADJECTIVES[value % ADJECTIVES.length] ?? 'Quiet';
  const noun = NOUNS[Math.floor(value / ADJECTIVES.length) % NOUNS.length] ?? 'Tanuki';
  return `${adjective}${noun}`;
}
