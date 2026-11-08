import { canSearch, DEBOUNCE_MS, displayLocale, fetchDictionary } from './dictionary/client';
import { dictionaryOptions } from './dictionary/palette';

// Latin combining accents, U+0300 to U+036F. Kana dakuten (U+3099) sit outside it.
const LATIN_ACCENTS = new RegExp(
  `[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`,
  'g',
);

/**
 * Lowercase, width-folded (ｶ → カ) text without Latin accents (vídeo → video).
 * Only Latin combining marks go: kana dakuten must survive (が ≠ か).
 */
export function normalize(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .normalize('NFD')
    .replace(LATIN_ACCENTS, '')
    .normalize('NFC');
}

/** Every word of the query must appear somewhere in the haystack. */
export function matches(query: string, haystack: string): boolean {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  const target = normalize(haystack);
  return words.every((word) => target.includes(word));
}

/**
 * Site path of a Pagefind result: drops `index.html`, `.html` and the trailing slash so
 * it matches the links the site uses (`trailingSlash: 'never'`).
 */
export function pageHref(url: string): string {
  const path = url
    .replace(/[?#].*$/, '')
    .replace(/index\.html$/, '')
    .replace(/\.html$/, '')
    .replace(/\/+$/, '');
  return path || '/';
}

export interface ExcerptPart {
  text: string;
  mark: boolean;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeEntities(text: string): string {
  return text.replace(/&(?:#(\d+)|#x([\da-f]+)|(amp|lt|gt|quot|apos));/gi, (_, dec, hex, name) =>
    name
      ? (ENTITIES[name.toLowerCase()] ?? '')
      : String.fromCodePoint(Number.parseInt(dec ?? hex, dec ? 10 : 16)),
  );
}

/**
 * Splits a Pagefind excerpt (escaped page text with matches wrapped in `<mark>`) into
 * runs, so the dialog renders it as text nodes and never as HTML.
 */
export function excerptParts(excerpt: string): ExcerptPart[] {
  return excerpt
    .split(/(<mark>.*?<\/mark>)/s)
    .filter(Boolean)
    .map((chunk) => {
      const mark = chunk.startsWith('<mark>');
      const text = mark ? chunk.slice('<mark>'.length, -'</mark>'.length) : chunk;
      return { text: decodeEntities(text.replace(/<[^>]*>/g, '')), mark };
    });
}

/** The parts of the Pagefind browser API (/pagefind/pagefind.js) the dialog uses. */
interface Pagefind {
  options(options: { excerptLength?: number }): Promise<void>;
  init(): Promise<void>;
  search(query: string): Promise<{ results: { data(): Promise<PagefindPage> }[] }>;
}

interface PagefindPage {
  url: string;
  excerpt: string;
  /** `group` comes from BaseLayout's searchMeta (kana pages); other pages join Pages. */
  meta: { title?: string; group?: string };
}

// Built by src/integrations/pagefind.ts; absent in `astro dev`, where only sections show.
const PAGEFIND_URL = '/pagefind/pagefind.js';
const MAX_PAGES = 6;
const ANNOUNCE_DELAY_MS = 400;

let pagefind: Promise<Pagefind | undefined> | undefined;

/** Loads Pagefind once, on first use. Resolves to undefined when it cannot load. */
function loadPagefind(): Promise<Pagefind | undefined> {
  pagefind ??= (import(/* @vite-ignore */ PAGEFIND_URL) as Promise<Pagefind>)
    .then(async (module) => {
      await module.options({ excerptLength: 16 });
      await module.init();
      return module;
    })
    .catch(() => undefined);
  return pagefind;
}

/**
 * Client behaviour of the search dialog (components/shell/SearchDialog.astro): filters
 * the section options, adds matching pages from Pagefind, moves the active option with
 * the arrow keys, opens it with Enter or a click and announces the result count.
 */
export function initSearch(root: HTMLElement): void {
  const dialog = root.closest('dialog');
  const input = root.querySelector<HTMLInputElement>('[data-search-input]');
  const empty = root.querySelector<HTMLElement>('[data-search-empty]');
  const status = root.querySelector<HTMLElement>('[data-search-status]');
  const groups = new Map(
    [...root.querySelectorAll<HTMLElement>('[data-search-group]')].map((group) => [
      group.dataset.searchGroup,
      group,
    ]),
  );
  const pagesGroup = groups.get('pages');
  const pageIcon = root.querySelector<HTMLTemplateElement>('[data-search-page-icon]');
  const sections = [...root.querySelectorAll<HTMLElement>('[data-search-section]')];
  if (!dialog || !input || !empty || !status || !pagesGroup || !pageIcon) return;

  // Section landing pages already have their own option, so Pagefind skips them.
  const sectionHrefs = new Set(sections.map((option) => option.dataset.href));
  let active: HTMLElement | undefined;
  let announceTimer: ReturnType<typeof setTimeout> | undefined;
  let searchId = 0;
  let dictionaryTimer: ReturnType<typeof setTimeout> | undefined;
  let dictionaryRequest: AbortController | undefined;

  const visible = () =>
    [...root.querySelectorAll<HTMLElement>('[role="option"]')].filter((option) => !option.hidden);

  function setActive(option: HTMLElement | undefined): void {
    active?.setAttribute('aria-selected', 'false');
    active = option;
    if (!input) return;
    if (!option) {
      input.removeAttribute('aria-activedescendant');
      return;
    }
    option.setAttribute('aria-selected', 'true');
    input.setAttribute('aria-activedescendant', option.id);
    option.scrollIntoView({ block: 'nearest' });
  }

  function pageOption(page: PagefindPage, index: number): HTMLElement {
    const option = document.createElement('div');
    option.className = 'search__option search__option--page';
    option.id = `search-page-${index}`;
    option.setAttribute('role', 'option');
    option.setAttribute('aria-selected', 'false');
    option.dataset.href = pageHref(page.url);
    option.dataset.searchPage = '';

    const text = document.createElement('span');
    text.className = 'search__option-text';
    const label = document.createElement('span');
    label.className = 'search__option-label';
    label.textContent = page.meta.title ?? option.dataset.href;
    const excerpt = document.createElement('span');
    excerpt.className = 'search__option-excerpt';
    for (const part of excerptParts(page.excerpt)) {
      if (part.mark) {
        const mark = document.createElement('mark');
        mark.textContent = part.text;
        excerpt.append(mark);
      } else {
        excerpt.append(part.text);
      }
    }
    text.append(label, excerpt);
    option.append(pageIcon?.content.cloneNode(true) ?? '', text);
    return option;
  }

  function showPages(pages: PagefindPage[]): void {
    for (const option of root.querySelectorAll('[data-search-page]')) option.remove();
    pages.forEach((page, index) => {
      const group = groups.get(page.meta.group ?? 'pages') ?? pagesGroup;
      group?.append(pageOption(page, index));
    });
  }

  async function searchPages(query: string): Promise<void> {
    const id = ++searchId;
    if (!query) {
      showPages([]);
      return;
    }
    const api = await loadPagefind();
    if (!api || id !== searchId) return;
    const { results } = await api.search(query);
    const pages = (await Promise.all(results.slice(0, MAX_PAGES * 2).map((r) => r.data())))
      .filter((page) => !sectionHrefs.has(pageHref(page.url)))
      .slice(0, MAX_PAGES);
    if (id !== searchId) return;
    showPages(pages);
    update(query);
  }

  function showDictionary(options: HTMLElement[]): void {
    for (const option of root.querySelectorAll('[data-search-dictionary]')) option.remove();
    groups.get('dictionary')?.append(...options);
  }

  /** Waits for a pause in typing; older requests are cancelled so they cannot overwrite. */
  function searchDictionary(query: string): void {
    clearTimeout(dictionaryTimer);
    dictionaryRequest?.abort();
    if (!canSearch(query)) {
      showDictionary([]);
      return;
    }
    const request = new AbortController();
    dictionaryRequest = request;
    dictionaryTimer = setTimeout(() => {
      const locale = displayLocale();
      fetchDictionary(query, locale, request.signal)
        .then((result) => {
          if (request.signal.aborted) return;
          showDictionary(dictionaryOptions(result, locale, root.dataset.learnBase ?? ''));
          update(query);
        })
        // Pages and sections still answer when the dictionary cannot.
        .catch(() => undefined);
    }, DEBOUNCE_MS);
  }

  function filter(): void {
    if (!input) return;
    const query = input.value.trim();
    for (const option of sections) {
      option.hidden = !matches(query, option.dataset.keywords ?? '');
    }
    searchDictionary(query);
    update(query);
    void searchPages(query);
  }

  /** Groups, empty message, active option and the announced count for the shown options. */
  function update(query: string): void {
    if (!empty || !status) return;
    const shown = visible();
    for (const group of root.querySelectorAll<HTMLElement>('[role="group"]')) {
      group.hidden = !group.querySelector('[role="option"]:not([hidden])');
    }
    empty.hidden = shown.length > 0;
    empty.textContent = (root.dataset.empty ?? '').replace('{query}', query);
    // Keep the active option when late page results arrive.
    setActive(query ? (active && shown.includes(active) ? active : shown[0]) : undefined);

    clearTimeout(announceTimer);
    const message =
      shown.length === 0
        ? empty.textContent
        : ((shown.length === 1 ? root.dataset.countOne : root.dataset.countOther) ?? '');
    announceTimer = setTimeout(() => {
      status.textContent = message.replace('{count}', String(shown.length));
    }, ANNOUNCE_DELAY_MS);
  }

  function open(option: HTMLElement | undefined): void {
    if (option?.dataset.href) window.location.assign(option.dataset.href);
  }

  input.addEventListener('input', filter);

  input.addEventListener('keydown', (event) => {
    const shown = visible();
    const index = active ? shown.indexOf(active) : -1;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (shown.length === 0) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive(shown[(index + step + shown.length) % shown.length]);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      open(active ?? shown[0]);
    }
  });

  root.addEventListener('click', (event) => {
    open((event.target as Element).closest<HTMLElement>('[role="option"]') ?? undefined);
  });

  // Focus the field whenever the dialog opens, whatever opened it.
  new MutationObserver(() => {
    if (dialog.open) {
      void loadPagefind();
      input.focus();
      input.select();
    }
  }).observe(dialog, { attributes: true, attributeFilter: ['open'] });
}
