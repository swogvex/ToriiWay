import { type CollectionEntry, getEntry } from 'astro:content';

import kanjivg from '../../data/kanjivg/kana.json';
import { localizePath, type Locale, useTranslations } from '../../i18n';
import { type GlyphData, type GlyphLayout, glyphLayout } from './glyph';

export type Script = CollectionEntry<'kana'>['data']['script'];
export type Kana = CollectionEntry<'kana'>['data']['items'][number];

export const SCRIPTS: readonly Script[] = ['hiragana', 'katakana'];

// JSON imports type tuples as number[][], hence the cast through unknown.
const GLYPHS = kanjivg.glyphs as unknown as Readonly<Record<string, GlyphData | undefined>>;

/** Source and license of the stroke data, for the visible credit. */
export const KANJIVG_CREDIT = { url: 'https://kanjivg.tagaini.net/', source: kanjivg.source };

/** All kana of a script, in table order. */
export async function getKana(script: Script): Promise<Kana[]> {
  const entry = await getEntry('kana', script);
  if (!entry) throw new Error(`Missing src/content/kana/${script}.yaml`);
  return entry.data.items;
}

export function kanaHref(char: string, locale: Locale): string {
  return localizePath(`/learn/kana/${char}`, locale);
}

export function scriptHref(script: Script, locale: Locale): string {
  return localizePath(`/learn/${script}`, locale);
}

/** Schema validation guarantees KanjiVG data for every kana in the collection. */
export function kanaGlyph(char: string): GlyphLayout {
  const layout = glyphLayout(char, GLYPHS);
  if (!layout) throw new Error(`KanjiVG has no data for ${char}`);
  return layout;
}

/** The romaji row name as the chart shows it: k, sh, ky… */
function rowName(kana: Kana): string {
  return kana.row.toUpperCase();
}

/** "Hiragana · K-row · 3 strokes" (rendered uppercase by the kicker style). */
export function kanaLabel(kana: Kana, script: Script, locale: Locale): string {
  const t = useTranslations(locale);
  const row =
    kana.vowel === 'n'
      ? t('learn.label.nn')
      : kana.row === 'vowel'
        ? t('learn.label.vowel')
        : t('learn.label.row', { row: rowName(kana) });
  return [t(`learn.${script}`), row, strokesLabel(kana.strokes, locale)].join(' · ');
}

export function strokesLabel(count: number, locale: Locale): string {
  const t = useTranslations(locale);
  return count === 1 ? t('learn.strokes.one') : t('learn.strokes.other', { count });
}

/** Everything the chart's detail panel shows for one kana, serialised for the client. */
export interface PanelKana {
  char: string;
  romaji: string;
  label: string;
  href: string;
  mnemonic?: string | undefined;
  examples: { word: string; reading: string; meaning: string }[];
  glyph: GlyphLayout;
}

export function panelKana(kana: Kana, script: Script, locale: Locale): PanelKana {
  return {
    char: kana.char,
    romaji: kana.romaji,
    label: kanaLabel(kana, script, locale),
    href: kanaHref(kana.char, locale),
    mnemonic: (locale === 'es' ? kana.mnemonic?.es : undefined) ?? kana.mnemonic?.en,
    // Both meanings, as in artboard 08: "umbrella / paraguas".
    examples: kana.examples.map((example) => ({
      word: example.word,
      reading: example.reading,
      meaning: [example.en, example.es].filter(Boolean).join(' / '),
    })),
    glyph: kanaGlyph(kana.char),
  };
}
