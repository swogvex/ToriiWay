import { THEME_STORAGE_KEY } from './prepaint';

export type Theme = 'light' | 'dark';

/** The theme on screen: the manual choice, else the system preference. */
export function currentTheme(): Theme {
  const chosen = document.documentElement.dataset.theme;
  if (chosen === 'light' || chosen === 'dark') return chosen;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Keeps every theme toggle's pressed state in line with the theme on screen. */
export function syncThemeToggles(): void {
  const dark = String(currentTheme() === 'dark');
  for (const toggle of document.querySelectorAll('[data-theme-toggle]')) {
    toggle.setAttribute('aria-pressed', dark);
  }
}

export function toggleTheme(): void {
  const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // Storage can be blocked; the choice then lasts for this page only.
  }
  syncThemeToggles();
}
