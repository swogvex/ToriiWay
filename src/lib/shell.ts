/**
 * Client behaviour shared by every BaseLayout page: theme toggles, the rail toggle,
 * the language switch and the global keyboard shortcuts. Event delegation only, so it
 * runs once and needs no per-component setup.
 */
import { loadLateFonts } from './fonts';
import { RAIL_STORAGE_KEY } from './theme/prepaint';
import { isTypingTarget, shortcutFor } from './shortcuts';
import { syncThemeToggles, toggleTheme } from './theme/theme';
import { showToast } from './ui/toast';

const LANG_STORAGE_KEY = 'tw:v1:lang';
const BANNER_STORAGE_KEY = 'tw:v1:lang-banner';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Suggests the Spanish page once to browsers that prefer Spanish; never redirects. */
function initLangBanner(): void {
  const banner = document.querySelector<HTMLElement>('[data-lang-banner]');
  if (!banner) return;
  const prefersSpanish = (navigator.languages[0] ?? navigator.language)
    .toLowerCase()
    .startsWith('es');
  if (
    !prefersSpanish ||
    read(BANNER_STORAGE_KEY) === 'dismissed' ||
    read(LANG_STORAGE_KEY) === 'en'
  ) {
    return;
  }
  banner.hidden = false;
  banner.querySelector('[data-lang-banner-close]')?.addEventListener('click', () => {
    store(BANNER_STORAGE_KEY, 'dismissed');
    banner.hidden = true;
  });
}

function store(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage can be blocked; the site works without it.
  }
}

function syncRailToggle(): void {
  const expanded = document.documentElement.dataset.rail === 'expanded';
  document.querySelector('[data-rail-toggle]')?.setAttribute('aria-pressed', String(expanded));
}

function toggleRail(): void {
  const root = document.documentElement;
  const expanded = root.dataset.rail !== 'expanded';
  if (expanded) root.dataset.rail = 'expanded';
  else delete root.dataset.rail;
  store(RAIL_STORAGE_KEY, expanded ? 'expanded' : 'collapsed');
  syncRailToggle();
}

function switchLanguage(): void {
  const link = document.querySelector<HTMLAnchorElement>('[data-lang-link]');
  if (link) {
    store(LANG_STORAGE_KEY, link.dataset.langLink ?? '');
    window.location.assign(link.href);
    return;
  }
  const soon = document.querySelector<HTMLElement>('[data-lang-soon]');
  if (soon?.dataset.langSoon) showToast(soon.dataset.langSoon);
}

/** Opens a modal dialog from a shortcut and returns focus to where it was. */
function openDialog(id: string): void {
  const dialog = document.getElementById(id);
  if (!(dialog instanceof HTMLDialogElement) || dialog.open) return;
  const previous = document.activeElement;
  document.querySelector<HTMLDialogElement>('dialog[open]')?.close();
  dialog.showModal();
  dialog.addEventListener(
    'close',
    () => {
      if (previous instanceof HTMLElement) previous.focus();
    },
    { once: true },
  );
}

function isMac(): boolean {
  return /Mac|iPhone|iPad/.test(navigator.platform);
}

export function initShell(): void {
  loadLateFonts();
  syncThemeToggles();
  syncRailToggle();
  initLangBanner();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncThemeToggles);

  if (isMac()) {
    for (const key of document.querySelectorAll('[data-mod-key]')) key.textContent = '⌘';
  }

  document.addEventListener('click', (event) => {
    const target = event.target as Element | null;
    if (target?.closest('[data-theme-toggle]')) toggleTheme();
    else if (target?.closest('[data-rail-toggle]')) toggleRail();
    else if (target?.closest('[data-lang-soon]')) switchLanguage();

    const link = target?.closest<HTMLAnchorElement>('[data-lang-link]');
    if (link?.dataset.langLink) store(LANG_STORAGE_KEY, link.dataset.langLink);
  });

  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.repeat) return;

    // WCAG 1.4.13: Esc dismisses the rail tooltips until the pointer leaves the rail.
    const rail = document.querySelector<HTMLElement>('[data-rail]');
    if (event.key === 'Escape' && rail && !document.querySelector('dialog[open]')) {
      rail.dataset.tipsOff = '';
      rail.addEventListener('pointerleave', () => delete rail.dataset.tipsOff, { once: true });
      rail.addEventListener('focusout', () => delete rail.dataset.tipsOff, { once: true });
    }

    const shortcut = shortcutFor({
      key: event.key,
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
      altKey: event.altKey,
      typing: isTypingTarget(event.target),
    });
    if (!shortcut) return;
    event.preventDefault();
    if (shortcut === 'search') openDialog('search-dialog');
    else if (shortcut === 'help') openDialog('shortcuts-dialog');
    else if (shortcut === 'theme') toggleTheme();
    else switchLanguage();
  });
}
