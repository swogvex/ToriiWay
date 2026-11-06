// Numbered pagination shared by lists (library; the leaderboard uses pageList too).

/**
 * Page buttons to show: always the first and last, the current one with a neighbour on
 * each side, and 'gap' where pages are skipped. 1 2 3 … 9 / 1 … 4 5 6 … 9.
 */
export function pageList(current: number, total: number): (number | 'gap')[] {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const shown = new Set([1, total, current - 1, current, current + 1]);
  if (current <= 3) [2, 3, 4].forEach((page) => shown.add(page));
  if (current >= total - 2) [total - 3, total - 2, total - 1].forEach((page) => shown.add(page));
  const pages = [...shown].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b);
  return pages.flatMap((page, index) =>
    index > 0 && page - (pages[index - 1] ?? page) > 1 ? ['gap' as const, page] : [page],
  );
}

export interface PageLabels {
  prev: string;
  next: string;
  /** "Page {page}". */
  page: string;
}

/**
 * Fills a src/components/ui/Pagination.astro nav: ‹ 1 2 3 … n ›, the current page marked
 * with aria-current, hidden when there is a single page.
 */
export function renderPages(
  nav: HTMLElement,
  current: number,
  count: number,
  labels: PageLabels,
  goTo: (page: number) => void,
): void {
  nav.hidden = count <= 1;
  if (count <= 1) {
    nav.replaceChildren();
    return;
  }
  const button = (label: string, target: number, aria: string, isCurrent = false) => {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = 'page';
    element.textContent = label;
    element.setAttribute('aria-label', aria);
    if (isCurrent) element.setAttribute('aria-current', 'page');
    element.disabled = target < 1 || target > count;
    element.addEventListener('click', () => goTo(target));
    return element;
  };
  nav.replaceChildren(
    button('‹', current - 1, labels.prev),
    ...pageList(current, count).map((item) => {
      if (item !== 'gap') {
        return button(
          String(item),
          item,
          labels.page.replace('{page}', String(item)),
          item === current,
        );
      }
      const gap = document.createElement('span');
      gap.className = 'page-gap';
      gap.setAttribute('aria-hidden', 'true');
      gap.textContent = '…';
      return gap;
    }),
    button('›', current + 1, labels.next),
  );
}
