import type { IconName } from '../components/ui/icons';
import { stripLocale } from '../i18n';

export type SectionId = 'home' | 'game' | 'learn' | 'library' | 'jlpt' | 'community';

export interface Section {
  id: SectionId;
  /** Path in the default locale; localize it with `localizePath`. */
  href: string;
  icon: IconName;
  /** The area's decorative kanji (05-art-direction). */
  glyph?: string;
}

/** Rail and menu order. */
export const SECTIONS: readonly Section[] = [
  { id: 'home', href: '/', icon: 'house' },
  { id: 'game', href: '/game', icon: 'keyboard', glyph: '打' },
  { id: 'learn', href: '/learn', icon: 'book-open', glyph: '学' },
  { id: 'library', href: '/library', icon: 'library-big', glyph: '本' },
  { id: 'jlpt', href: '/jlpt', icon: 'clipboard-check', glyph: '試' },
  { id: 'community', href: '/community', icon: 'square-play', glyph: '輪' },
];

/**
 * `page` for the section's own URL, `true` inside it (e.g. /learn/hiragana under /learn),
 * undefined elsewhere. Home only matches itself.
 */
export function sectionCurrent(section: Section, pathname: string): 'page' | 'true' | undefined {
  const path = stripLocale(pathname);
  if (path === section.href) return 'page';
  if (section.href !== '/' && path.startsWith(`${section.href}/`)) return 'true';
  return undefined;
}
