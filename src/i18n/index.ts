import en from './en.json';
import es from './es.json';

export const LOCALES = ['en', 'es'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

/** Locales with translated pages. The language switch only links to these. */
export const PUBLISHED_LOCALES: readonly Locale[] = ['en', 'es'];

export type UiKey = keyof typeof en;
type Params = Record<string, string | number>;

// Typing es as a full Record makes a missing Spanish key fail `pnpm check`.
const dictionaries: Record<Locale, Record<UiKey, string>> = { en, es };

export function useTranslations(locale: Locale) {
  return function t(key: UiKey, params: Params = {}): string {
    return dictionaries[locale][key].replace(/\{(\w+)\}/g, (match, name: string) =>
      name in params ? String(params[name]) : match,
    );
  };
}

export function isLocale(value: string | undefined): value is Locale {
  return (LOCALES as readonly string[]).includes(value ?? '');
}

/** Locale from the first path segment; the default locale has no prefix. */
export function getLocale(pathname: string): Locale {
  const segment = pathname.split('/')[1];
  return isLocale(segment) && segment !== DEFAULT_LOCALE ? segment : DEFAULT_LOCALE;
}

/** Path without its locale prefix: `/es/learn` → `/learn`. */
export function stripLocale(pathname: string): string {
  const locale = getLocale(pathname);
  if (locale === DEFAULT_LOCALE) return pathname || '/';
  return pathname.slice(locale.length + 1) || '/';
}

/** Same page in another locale: `localizePath('/learn', 'es')` → `/es/learn`. */
export function localizePath(pathname: string, locale: Locale): string {
  const path = stripLocale(pathname);
  if (locale === DEFAULT_LOCALE) return path;
  return path === '/' ? `/${locale}` : `/${locale}${path}`;
}
