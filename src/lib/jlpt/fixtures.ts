// Test helper: a synthetic bank with `copies` papers' worth of questions for a level.

import { idPrefix, LEVELS } from './levels';
import type { BankMondai } from './paper';
import type { JlptLevel } from './types';

export function fakeBank(level: JlptLevel, copies = 3): BankMondai[] {
  return LEVELS[level].sections.flatMap((section) =>
    section.mondai.map((config): BankMondai => {
      const prefix = idPrefix(level, section.id, config.number);
      const total = config.count * copies;
      const perPassage = config.perPassage;
      const passages =
        perPassage === null
          ? []
          : Array.from({ length: total / perPassage }, (_, index) => ({
              id: `p${index + 1}`,
              text: `Passage ${index + 1}`,
            }));
      return {
        level,
        section: section.id,
        mondai: config.number,
        instruction: { en: 'Choose.', ja: 'えらんで ください。' },
        passages,
        questions: Array.from({ length: total }, (_, index) => ({
          id: `${prefix}${String(index + 1).padStart(4, '0')}`,
          ...(perPassage === null ? {} : { passage: `p${Math.floor(index / perPassage) + 1}` }),
          stem: `Question ${index + 1}`,
          choices: Array.from({ length: config.choices }, (_, choice) => `choice ${choice + 1}`),
          answer: 1,
          explanation: { en: 'Because.', es: 'Porque.' },
          audio: null,
          tts: config.audio ? { script: 'N: こんにちは。', voices: ['narrator'] } : null,
        })),
      };
    }),
  );
}
