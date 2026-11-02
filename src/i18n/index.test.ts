import { describe, expect, it } from 'vitest';

import en from './en.json';
import es from './es.json';
import { getLocale, localizePath, stripLocale, useTranslations } from './index';

describe('useTranslations', () => {
  it('returns the string for the locale', () => {
    expect(useTranslations('en')('nav.learn')).toBe('Learn');
    expect(useTranslations('es')('nav.learn')).toBe('Aprender');
  });

  it('fills named params and leaves unknown ones visible', () => {
    const t = useTranslations('en');
    expect(t('home.sections', { count: '05' })).toBe('05 sections');
    expect(t('home.sections')).toBe('{count} sections');
  });

  it('has the same keys in every locale', () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
  });
});

describe('locale paths', () => {
  it('reads the locale from the first segment', () => {
    expect(getLocale('/')).toBe('en');
    expect(getLocale('/learn/hiragana')).toBe('en');
    expect(getLocale('/es')).toBe('es');
    expect(getLocale('/es/learn')).toBe('es');
    expect(getLocale('/en/learn')).toBe('en');
    expect(getLocale('/estonia')).toBe('en');
  });

  it('strips the locale prefix', () => {
    expect(stripLocale('/es/learn/hiragana')).toBe('/learn/hiragana');
    expect(stripLocale('/es')).toBe('/');
    expect(stripLocale('/learn')).toBe('/learn');
    expect(stripLocale('')).toBe('/');
  });

  it('localizes paths both ways', () => {
    expect(localizePath('/', 'es')).toBe('/es');
    expect(localizePath('/learn', 'es')).toBe('/es/learn');
    expect(localizePath('/es/learn', 'en')).toBe('/learn');
    expect(localizePath('/es', 'en')).toBe('/');
    expect(localizePath('/es/learn', 'es')).toBe('/es/learn');
  });
});
