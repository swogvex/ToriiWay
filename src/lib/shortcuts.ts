export type Shortcut = 'search' | 'theme' | 'language' | 'help';

interface KeyLike {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  /** True when focus is in a text field, where single keys must type. */
  typing: boolean;
}

/**
 * Maps a keydown to a global shortcut (07-spec-shell): ⌘K / Ctrl K search, T theme,
 * L language, ? help. Single-key shortcuts never fire while typing or with modifiers.
 */
export function shortcutFor(event: KeyLike): Shortcut | null {
  const key = event.key.toLowerCase();
  if ((event.metaKey || event.ctrlKey) && !event.altKey && key === 'k') return 'search';
  if (event.typing || event.metaKey || event.ctrlKey || event.altKey) return null;
  if (key === 't') return 'theme';
  if (key === 'l') return 'language';
  if (key === '?') return 'help';
  return null;
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (!(target instanceof HTMLInputElement)) return false;
  return !['button', 'checkbox', 'radio', 'range', 'reset', 'submit'].includes(target.type);
}
