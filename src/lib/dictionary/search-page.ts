// /learn/search: reads ?q=, keeps the URL shareable and draws the result templates.

import {
  DEBOUNCE_MS,
  displayLocale,
  fetchDictionary,
  kanjiHref,
  pickMeaning,
  senseGlosses,
  wordHref,
  type DisplayLocale,
} from './client';
import { KANJI_LIMIT, WORD_LIMIT } from './limits';
import type { KanjiResult, SearchResult, WordResult } from './store';

type State = 'idle' | 'loading' | 'results' | 'empty' | 'error';

interface Labels {
  title: string;
  counts: string;
  showing: string;
  strokesOne: string;
  strokesOther: string;
  jlpt: string;
  gradeSchool: string;
  gradeSecondary: string;
  jinmeiyo: string;
  freq: string;
  common: string;
  otherEn: string;
  otherEs: string;
  loading: string;
  error: string;
}

const ANNOUNCE_DELAY_MS = 400;
const SECONDARY_GRADE = 8;
const MAX_SCHOOL_GRADE = 6;

const fill = (template: string, values: Record<string, string | number>): string =>
  template.replace(/\{(\w+)\}/g, (match, key: string) => String(values[key] ?? match));

/** The element, or nothing when the template lacks it. Removes it if there is no text. */
function setText(root: ParentNode, selector: string, text: string | null): void {
  const element = root.querySelector(selector);
  if (!element) return;
  if (text) element.textContent = text;
  else element.remove();
}

/** The page is static, so a missing part is a build mistake rather than a runtime case. */
function part<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing ${selector}`);
  return element;
}

export function initDictionarySearch(root: HTMLElement): void {
  const input = part<HTMLInputElement>(root, 'input[name="q"]');
  const form = part<HTMLFormElement>(root, 'form');
  const kanjiList = part<HTMLElement>(root, '[data-dict-kanji]');
  const wordList = part<HTMLElement>(root, '[data-dict-words]');
  const kanjiTemplate = part<HTMLTemplateElement>(root, '[data-dict-kanji-template]');
  const wordTemplate = part<HTMLTemplateElement>(root, '[data-dict-word-template]');
  const status = part<HTMLElement>(root, '[data-dict-status]');
  const heading = part<HTMLElement>(root, '[data-dict-heading]');
  const counts = part<HTMLElement>(root, '[data-dict-counts]');
  const showing = part<HTMLElement>(root, '[data-dict-showing]');
  const results = part<HTMLElement>(root, '[data-dict-region]');
  const retry = part<HTMLElement>(root, '[data-dict-retry]');

  const labels = JSON.parse(root.dataset.labels ?? '{}') as Labels;
  const locale: DisplayLocale = displayLocale();
  const learn = root.dataset.learnBase ?? '/learn';
  const panels = [...root.querySelectorAll<HTMLElement>('[data-dict-panel]')];
  let controller: AbortController | undefined;
  let debounce: ReturnType<typeof setTimeout> | undefined;
  let announce: ReturnType<typeof setTimeout> | undefined;

  function say(message: string): void {
    clearTimeout(announce);
    announce = setTimeout(() => {
      status.textContent = message;
    }, ANNOUNCE_DELAY_MS);
  }

  function setState(state: State): void {
    for (const panel of panels) panel.hidden = panel.dataset.dictPanel !== state;
    results.setAttribute('aria-busy', String(state === 'loading'));
  }

  function grade(value: number | null): string | null {
    if (value === null) return null;
    if (value <= MAX_SCHOOL_GRADE) return fill(labels.gradeSchool, { grade: value });
    return value === SECONDARY_GRADE ? labels.gradeSecondary : labels.jinmeiyo;
  }

  function fillMeaning(card: ParentNode, english: string[], spanish: string[]): void {
    const meaning = pickMeaning(english, spanish, locale);
    setText(card, '[data-meaning]', meaning.primary.join(', '));
    const otherLabel = locale === 'en' ? labels.otherEs : labels.otherEn;
    setText(
      card,
      '[data-meaning-other]',
      meaning.other.length > 0 ? `${otherLabel} ${meaning.other.join(', ')}` : null,
    );
    if (!meaning.englishOnly) card.querySelector('[data-english-only]')?.remove();
  }

  function kanjiCard(kanji: KanjiResult): DocumentFragment {
    const card = kanjiTemplate.content.cloneNode(true) as DocumentFragment;
    setText(card, '[data-glyph]', kanji.literal);
    card.querySelector('[data-kanji-link]')?.setAttribute('href', kanjiHref(learn, kanji.literal));
    setText(
      card,
      '[data-strokes]',
      fill(kanji.strokes === 1 ? labels.strokesOne : labels.strokesOther, {
        count: kanji.strokes,
      }),
    );
    setText(card, '.js-jlpt', kanji.jlpt ? fill(labels.jlpt, { level: kanji.jlpt }) : null);
    setText(card, '.js-grade', grade(kanji.grade));
    setText(card, '.js-freq', kanji.freq ? fill(labels.freq, { rank: kanji.freq }) : null);
    fillMeaning(card, kanji.meaningsEn, kanji.meaningsEs);
    for (const [key, values] of [
      ['on', kanji.onReadings],
      ['kun', kanji.kunReadings],
    ] as const) {
      const value = values.join('、');
      if (value) setText(card, `[data-reading="${key}"]`, value);
      else card.querySelector(`[data-reading-row="${key}"]`)?.remove();
    }
    const list = card.querySelector('[data-common-list]');
    if (kanji.commonWords.length === 0) card.querySelector('[data-common]')?.remove();
    for (const word of kanji.commonWords) {
      const item = document.createElement('li');
      const form = document.createElement('a');
      form.lang = 'ja';
      form.href = wordHref(learn, word.id);
      form.textContent = word.form;
      const reading = document.createElement('span');
      reading.lang = 'ja';
      reading.textContent = ` ${word.reading}`;
      const gloss = pickMeaning(word.glossesEn, word.glossesEs, locale).primary[0];
      item.append(form, reading, gloss ? ` · ${gloss}` : '');
      list?.append(item);
    }
    return card;
  }

  function wordRow(word: WordResult): DocumentFragment {
    const row = word.kanjiForms[0];
    const item = wordTemplate.content.cloneNode(true) as DocumentFragment;
    setText(item, '[data-word-form]', row ?? word.readings[0] ?? '');
    item.querySelector('[data-word-link]')?.setAttribute('href', wordHref(learn, word.id));
    setText(item, '[data-word-reading]', row ? (word.readings[0] ?? null) : null);
    setText(item, '.js-word-common', word.common ? labels.common : null);
    setText(item, '.js-word-jlpt', word.jlpt ? fill(labels.jlpt, { level: word.jlpt }) : null);
    const { en, es } = senseGlosses(word.senses);
    fillMeaning(item, en, es);
    return item;
  }

  function render(query: string, result: SearchResult): void {
    kanjiList.replaceChildren(...result.kanji.map(kanjiCard));
    wordList.replaceChildren(...result.words.map(wordRow));
    kanjiList.hidden = result.kanji.length === 0;
    wordList.hidden = result.words.length === 0;
    heading.textContent = fill(labels.title, { query });
    const summary = fill(labels.counts, { kanji: result.counts.kanji, words: result.counts.words });
    counts.textContent = summary;
    const truncated = result.counts.kanji > KANJI_LIMIT || result.counts.words > WORD_LIMIT;
    showing.textContent = fill(labels.showing, {
      kanji: result.kanji.length,
      words: result.words.length,
    });
    showing.hidden = !truncated;
    say(summary);
  }

  async function search(raw: string): Promise<void> {
    clearTimeout(debounce);
    controller?.abort();
    const query = raw.trim();
    const url = new URL(window.location.href);
    if (query) url.searchParams.set('q', query);
    else url.searchParams.delete('q');
    history.replaceState(null, '', url);

    if (!query) {
      setState('idle');
      return;
    }
    const current = new AbortController();
    controller = current;
    setState('loading');
    say(labels.loading);
    try {
      const result = await fetchDictionary(query, locale, current.signal);
      if (current !== controller) return;
      if (result.kanji.length + result.words.length === 0) {
        setState('empty');
        for (const element of root.querySelectorAll('[data-dict-query]')) {
          element.textContent = query;
        }
        say(root.querySelector('[data-dict-empty]')?.textContent ?? '');
        return;
      }
      render(query, result);
      setState('results');
    } catch {
      if (current.signal.aborted) return;
      setState('error');
      say(labels.error);
    }
  }

  input.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => void search(input.value), DEBOUNCE_MS);
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void search(input.value);
  });
  retry.addEventListener('click', () => void search(input.value));

  const initial = new URLSearchParams(window.location.search).get('q') ?? '';
  input.value = initial;
  void search(initial);
}
