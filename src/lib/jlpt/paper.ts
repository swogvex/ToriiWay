// Builds a paper (the question IDs of each section) from the bank. Deterministic for a
// level and seed, so the server can rebuild it from the run instead of storing it.

import { seededRandom } from '../../game/spawner';
import { LEVELS } from './levels';
import type { JlptLevel, MondaiConfig, SectionId } from './types';

export interface BankQuestion {
  id: string;
  passage?: string | undefined;
  stem: string;
  choices: string[];
  answer: number;
  explanation: { en: string; es: string };
  audio: string | null;
  tts: { script: string; voices: string[] } | null;
}

/** One question file, as validated by `jlptMondaiSchema`. */
export interface BankMondai {
  level: JlptLevel;
  section: SectionId;
  mondai: number;
  instruction: { en: string; ja: string; es?: string | undefined };
  passages: { id: string; text: string }[];
  questions: BankQuestion[];
}

export interface PaperMondai {
  number: number;
  questionIds: string[];
}

export interface PaperSection {
  id: SectionId;
  mondai: PaperMondai[];
}

export class BankError extends Error {}

/** FNV-1a, to give every mondai its own random stream. */
function hash(text: string): number {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    value = Math.imul(value ^ text.charCodeAt(index), 0x01000193);
  }
  return value >>> 0;
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [copy[index], copy[other]] = [copy[other] as T, copy[index] as T];
  }
  return copy;
}

function pickMondai(
  config: MondaiConfig,
  files: readonly BankMondai[],
  random: () => number,
): string[] {
  const label = `mondai ${config.number} (${config.type})`;
  if (config.perPassage === null) {
    const ids = files.flatMap((file) => file.questions.map((question) => question.id));
    if (ids.length < config.count) {
      throw new BankError(`${label} has ${ids.length} questions; a paper needs ${config.count}`);
    }
    return shuffle(ids, random).slice(0, config.count);
  }
  // Passages are picked whole, keeping their questions in order.
  const groups = files.flatMap((file) =>
    file.passages.map((passage) =>
      file.questions.filter((question) => question.passage === passage.id).map((q) => q.id),
    ),
  );
  const needed = config.count / config.perPassage;
  if (groups.length < needed) {
    throw new BankError(`${label} has ${groups.length} passages; a paper needs ${needed}`);
  }
  return shuffle(groups, random).slice(0, needed).flat();
}

export function buildPaper(
  level: JlptLevel,
  seed: number,
  bank: readonly BankMondai[],
): PaperSection[] {
  return LEVELS[level].sections.map((section) => ({
    id: section.id,
    mondai: section.mondai.map((config) => {
      const files = bank.filter(
        (file) =>
          file.level === level && file.section === section.id && file.mondai === config.number,
      );
      const random = seededRandom((seed ^ hash(`${section.id}/${config.number}`)) | 0);
      return { number: config.number, questionIds: pickMondai(config, files, random) };
    }),
  }));
}

/** Every question of a level by ID, with the mondai it belongs to. */
export function indexBank(level: JlptLevel, bank: readonly BankMondai[]) {
  const index = new Map<string, { question: BankQuestion; mondai: BankMondai }>();
  for (const file of bank) {
    if (file.level !== level) continue;
    for (const question of file.questions) index.set(question.id, { question, mondai: file });
  }
  return index;
}
