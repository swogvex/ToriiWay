// The Learn page: wires the chart and swaps between scripts without reloading the page.

import { localKanaProgress } from '../progress/kana';
import { initKanaExplorer } from './explorer';
import { initLearned } from './learned';
import { initListen } from './listen';
import { initPractice } from './practice-ui';

const BODY = '[data-kana-explorer]';
const DIALOG = '#kana-practice';
const LINK = '[data-script-link]';

/** Copies an attribute from the fetched page to the matching element of this one. */
function copyAttribute(next: Document, selector: string, attribute: string): void {
  const value = next.querySelector(selector)?.getAttribute(attribute);
  if (value) document.querySelector(selector)?.setAttribute(attribute, value);
}

/** Title, links and breadcrumb: what depends on the page beyond the chart itself. */
function updateDocument(next: Document): void {
  document.title = next.title;
  copyAttribute(next, 'meta[name="description"]', 'content');
  copyAttribute(next, 'link[rel="canonical"]', 'href');
  for (const { hreflang } of document.querySelectorAll<HTMLLinkElement>('link[rel="alternate"]')) {
    copyAttribute(next, `link[rel="alternate"][hreflang="${hreflang}"]`, 'href');
  }
  for (const link of document.querySelectorAll<HTMLElement>('[data-lang-link]')) {
    copyAttribute(next, `[data-lang-link="${link.dataset.langLink}"]`, 'href');
  }
  const crumbs = next.querySelector('.header__crumbs');
  if (crumbs) document.querySelector('.header__crumbs')?.replaceWith(crumbs);
}

/** Opens in the incoming chart the same group of kana that was showing. */
function keepGroup(current: Element, next: Element): void {
  const open = current.querySelector('[role="tab"][aria-selected="true"]')?.id;
  if (!open) return;
  for (const tab of next.querySelectorAll<HTMLElement>('[role="tab"]')) {
    const active = tab.id === open;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    const panel = next.querySelector<HTMLElement>(`#${tab.getAttribute('aria-controls')}`);
    if (panel) panel.hidden = !active;
  }
}

export function initLearnPage(): void {
  const progress = localKanaProgress();
  let controller = new AbortController();
  let select: (char: string) => void = () => undefined;
  let path = window.location.pathname;
  let latest = 0;

  function mount(): void {
    const body = document.querySelector<HTMLElement>(BODY);
    const practice = document.querySelector<HTMLElement>('[data-practice]');
    if (!body) return;
    controller = new AbortController();
    select = initKanaExplorer(body, progress);
    initLearned(body, progress);
    void initListen(body);
    if (practice) initPractice(practice, progress, controller.signal);
  }

  /** Any problem falls back to the plain link, which always works. */
  async function swap(href: string, push: boolean): Promise<void> {
    const id = ++latest;
    let next: Document;
    try {
      const response = await fetch(href);
      if (!response.ok) throw new Error(String(response.status));
      next = new DOMParser().parseFromString(await response.text(), 'text/html');
    } catch {
      window.location.assign(href);
      return;
    }
    if (id !== latest) return;

    const body = document.querySelector(BODY);
    const dialog = document.querySelector(DIALOG);
    const nextBody = next.querySelector(BODY);
    const nextDialog = next.querySelector(DIALOG);
    if (!body || !dialog || !nextBody || !nextDialog) {
      window.location.assign(href);
      return;
    }

    // The two charts list their kana in the same order, so か stays selected as カ.
    const cells = [...body.querySelectorAll('[data-kana]')];
    const selected = cells.findIndex((cell) => cell.getAttribute('aria-pressed') === 'true');
    const nextCell = next.querySelectorAll<HTMLElement>(`${BODY} [data-kana]`)[selected];

    keepGroup(body, nextBody);
    controller.abort();
    body.replaceWith(nextBody);
    dialog.replaceWith(nextDialog);
    updateDocument(next);
    if (push) history.pushState(null, '', href);
    path = window.location.pathname;
    mount();
    if (selected > 0 && nextCell?.dataset.kana) select(nextCell.dataset.kana);
    // The link that had focus was replaced: without this, keyboard users restart at the top.
    document.querySelector<HTMLElement>(`${LINK}[aria-current]`)?.focus({ preventScroll: true });
  }

  document.addEventListener('click', (event) => {
    const link = (event.target as Element).closest<HTMLAnchorElement>(LINK);
    const newTab = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
    if (!link || newTab || event.button !== 0) return;
    event.preventDefault();
    if (link.pathname !== window.location.pathname) void swap(link.pathname, true);
  });

  window.addEventListener('popstate', () => {
    if (window.location.pathname !== path) void swap(window.location.pathname, false);
  });

  mount();
}
