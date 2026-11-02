import { describe, expect, it } from 'vitest';

import { SECTIONS, sectionCurrent } from './nav';

const section = (id: string) => {
  const found = SECTIONS.find((item) => item.id === id);
  if (!found) throw new Error(`No section ${id}`);
  return found;
};

describe('sectionCurrent', () => {
  it('marks the exact page', () => {
    expect(sectionCurrent(section('learn'), '/learn')).toBe('page');
    expect(sectionCurrent(section('home'), '/')).toBe('page');
    expect(sectionCurrent(section('learn'), '/es/learn')).toBe('page');
  });

  it('marks the section for nested pages', () => {
    expect(sectionCurrent(section('learn'), '/learn/hiragana')).toBe('true');
    expect(sectionCurrent(section('home'), '/learn')).toBeUndefined();
  });

  it('does not match a shared prefix', () => {
    expect(sectionCurrent(section('game'), '/gamers')).toBeUndefined();
  });
});
