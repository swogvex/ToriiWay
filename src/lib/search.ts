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

const ANNOUNCE_DELAY_MS = 400;

/**
 * Client behaviour of the search dialog (components/shell/SearchDialog.astro): filters
 * the options, moves the active option with the arrow keys, opens it with Enter or a
 * click and announces the result count.
 */
export function initSearch(root: HTMLElement): void {
  const dialog = root.closest('dialog');
  const input = root.querySelector<HTMLInputElement>('[data-search-input]');
  const empty = root.querySelector<HTMLElement>('[data-search-empty]');
  const status = root.querySelector<HTMLElement>('[data-search-status]');
  const options = [...root.querySelectorAll<HTMLElement>('[role="option"]')];
  if (!dialog || !input || !empty || !status) return;

  let active: HTMLElement | undefined;
  let announceTimer: ReturnType<typeof setTimeout> | undefined;

  const visible = () => options.filter((option) => !option.hidden);

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

  function filter(): void {
    if (!input || !empty || !status) return;
    const query = input.value.trim();
    for (const option of options) {
      option.hidden = !matches(query, option.dataset.keywords ?? '');
    }
    const shown = visible();
    for (const group of root.querySelectorAll<HTMLElement>('[role="group"]')) {
      group.hidden = !group.querySelector('[role="option"]:not([hidden])');
    }
    empty.hidden = shown.length > 0;
    empty.textContent = (root.dataset.empty ?? '').replace('{query}', query);
    setActive(query ? shown[0] : undefined);

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
      input.focus();
      input.select();
    }
  }).observe(dialog, { attributes: true, attributeFilter: ['open'] });
}
