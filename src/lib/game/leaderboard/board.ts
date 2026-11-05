// /game/leaderboard: filters and page in the URL, 50 rows per page, one expandable row at a
// time with its chart, and the Report / "Remove my run" dialogs. Rows are built from a
// <template> with textContent only, so player names can never inject markup.

import { CHART, chartGeometry, nearestPoint, renderChart } from '../../../game/chart';
import { turnstileWidget, type Widget } from '../../turnstile-client';
import {
  BOARD_PAGE_SIZE,
  type BoardPage,
  boardSearch,
  clock,
  filterFromSearch,
  forgetEntry,
  myEntries,
  pageFromSearch,
  pageList,
  searchFromFilter,
  submitterToken,
} from './client';
import type { BoardFilter, PublicScore } from './types';

type Labels = Record<string, string>;

const GLYPHS: Readonly<Record<string, string>> = { hiragana: 'あ', katakana: 'ア', kanji: '字' };

function fill(text: string, params: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

function need<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing ${selector}`);
  return element;
}

export function initBoard(root: HTMLElement): void {
  const labels = JSON.parse(root.dataset.labels ?? '{}') as Labels;
  const form = need<HTMLFormElement>(root, '[data-board-filters]');
  const sortGroup = need<HTMLElement>(root, '[data-board-sort]');
  const summary = need<HTMLElement>(root, '[data-board-summary]');
  const table = need<HTMLElement>(root, '[data-board-table]');
  const list = need<HTMLOListElement>(root, '[data-board-rows]');
  const empty = need<HTMLElement>(root, '[data-board-empty]');
  const failed = need<HTMLElement>(root, '[data-board-error]');
  const pages = need<HTMLElement>(root, '[data-board-pages]');
  const template = need<HTMLTemplateElement>(root, '[data-row-template]');
  const skeleton = list.innerHTML;

  let filter: BoardFilter = filterFromSearch(location.search);
  let page = pageFromSearch(location.search);
  /** Ignores answers to requests that a newer filter or page change replaced. */
  let request = 0;
  let open: HTMLButtonElement | null = null;

  function syncForm(): void {
    const values: Record<string, string> = {
      script: filter.script ?? '',
      difficulty: filter.difficulty ?? '',
      mode: filter.mode ?? '',
      sort: filter.sort,
    };
    for (const [name, value] of Object.entries(values)) {
      const input = form.querySelector<HTMLInputElement>(`input[name="${name}"][value="${value}"]`);
      if (input) input.checked = true;
    }
    sortGroup.hidden = filter.mode !== 'endless';
  }

  function readForm(): BoardFilter {
    const data = new FormData(form);
    const query = new URLSearchParams();
    for (const name of ['script', 'difficulty', 'mode', 'sort']) {
      const value = String(data.get(name) ?? '');
      if (value) query.set(name, value);
    }
    return filterFromSearch(`?${query.toString()}`);
  }

  /** Screen-reader status only: the filters already show the selection on screen. */
  function describe(total: number): string {
    const params = {
      count: total,
      script: filter.script ? (labels[filter.script] ?? '') : (labels.allScripts ?? ''),
      difficulty: filter.difficulty
        ? (labels[filter.difficulty] ?? '')
        : (labels.allDifficulties ?? ''),
      mode: filter.mode ? (labels[filter.mode] ?? '') : (labels.allModes ?? ''),
    };
    return fill((total === 1 ? labels.summaryOne : labels.summary) ?? '', params);
  }

  function showState(state: 'loading' | 'rows' | 'empty' | 'error'): void {
    table.setAttribute('aria-busy', String(state === 'loading'));
    empty.hidden = state !== 'empty';
    failed.hidden = state !== 'error';
    list.hidden = state === 'empty' || state === 'error';
    if (state === 'loading') list.innerHTML = skeleton;
  }

  function buildRow(entry: PublicScore, mine: ReadonlySet<string>): HTMLLIElement {
    const row = (template.content.firstElementChild as HTMLLIElement).cloneNode(
      true,
    ) as HTMLLIElement;
    const set = (field: string, value: string) => {
      const element = row.querySelector<HTMLElement>(`[data-f="${field}"]`);
      if (element) element.textContent = value;
    };
    const id = `board-row-${entry.id}`;
    const toggle = need<HTMLButtonElement>(row, '[data-row-toggle]');
    const details = need<HTMLElement>(row, '[data-row-details]');
    toggle.setAttribute('aria-controls', id);
    details.id = id;
    row.dataset.id = entry.id;
    row.dataset.name = entry.name;

    const rank = need<HTMLElement>(row, '.row__rank');
    if (entry.rank <= 3) rank.dataset.top = '';
    set('rank', String(entry.rank));
    set('name', entry.name);
    set('glyph', GLYPHS[entry.script] ?? '');
    set('script', labels[entry.script] ?? entry.script);
    set('difficulty', labels[entry.difficulty] ?? entry.difficulty);
    set('mode', labels[entry.mode] ?? entry.mode);
    need<HTMLElement>(row, '[data-f="mode"]').dataset.mode = entry.mode;
    set('survived', entry.mode === 'endless' ? clock(entry.durationS) : '—');
    set('wpm', String(Math.round(entry.wpm)));
    set('stat-wpm', String(Math.round(entry.wpm)));
    set('accuracy', `${Math.round(entry.accuracy)}%`);
    set('consistency', `${Math.round(entry.consistency)}%`);
    set('popped', String(entry.popped));
    set('missed', String(entry.missed));
    set('end', clock(entry.durationS));
    need<HTMLButtonElement>(row, '[data-row-remove]').hidden = !(
      mine.has(entry.id) && submitterToken()
    );

    // The chart is drawn the first time the row opens.
    toggle.addEventListener('click', () => {
      const expanding = toggle.getAttribute('aria-expanded') !== 'true';
      if (open && open !== toggle) collapse(open);
      toggle.setAttribute('aria-expanded', String(expanding));
      details.hidden = !expanding;
      open = expanding ? toggle : null;
      if (expanding && !row.dataset.drawn) {
        drawChart(row, entry);
        row.dataset.drawn = '';
      }
    });
    return row;
  }

  function collapse(toggle: HTMLButtonElement): void {
    toggle.setAttribute('aria-expanded', 'false');
    const details = document.getElementById(toggle.getAttribute('aria-controls') ?? '');
    if (details) details.hidden = true;
  }

  function drawChart(row: HTMLElement, entry: PublicScore): void {
    const svg = need<SVGSVGElement>(row, '[data-chart]');
    const tip = need<HTMLElement>(row, '[data-chart-tip]');
    const title = need<HTMLElement>(row, '[data-f="chart-title"]');
    const desc = need<SVGDescElement>(row, '[data-chart-desc]');
    title.id = `board-chart-title-${entry.id}`;
    desc.id = `board-chart-desc-${entry.id}`;
    svg.setAttribute('aria-labelledby', `${title.id} ${desc.id}`);
    const points = entry.series.length;
    const step = points > 0 ? entry.durationS / points : 1;
    const durations = Array.from({ length: points }, () => step);
    const geometry = chartGeometry(entry.series, durations, entry.errors);
    const cross = renderChart(svg, geometry);
    desc.textContent =
      points === 0
        ? (labels.chartEmpty ?? '')
        : fill(labels.chartDesc ?? '', {
            start: entry.series[0] ?? 0,
            end: entry.series.at(-1) ?? 0,
            time: clock(entry.durationS),
            peak: Math.max(...entry.series),
            errors: entry.errors.length,
          });

    // Hover like the results chart: a crosshair and "time · wpm" at the nearest point.
    const hide = () => {
      tip.hidden = true;
      cross.setAttribute('visibility', 'hidden');
    };
    svg.addEventListener('pointerleave', hide);
    svg.addEventListener('pointermove', (event) => {
      const box = svg.getBoundingClientRect();
      if (box.width === 0) return;
      const index = nearestPoint(geometry, (event.clientX - box.left) / box.width);
      const point = geometry.points[index];
      if (!point) return hide();
      cross.setAttribute('x1', String(point.x));
      cross.setAttribute('x2', String(point.x));
      cross.setAttribute('visibility', 'visible');
      tip.textContent = fill(labels.chartTip ?? '{time} · {wpm} wpm', {
        time: clock(step * (index + 1)),
        wpm: entry.series[index] ?? 0,
      });
      tip.style.insetInlineStart = `${(point.x / CHART.width) * 100}%`;
      tip.hidden = false;
    });
  }

  function renderPages(total: number): void {
    const count = Math.max(1, Math.ceil(total / BOARD_PAGE_SIZE));
    pages.hidden = count <= 1;
    if (count <= 1) {
      pages.replaceChildren();
      return;
    }
    const button = (
      label: string,
      target: number,
      options: { current?: boolean; aria?: string } = {},
    ) => {
      const element = document.createElement('button');
      element.type = 'button';
      element.className = 'page';
      element.textContent = label;
      if (options.aria) element.setAttribute('aria-label', options.aria);
      if (options.current) element.setAttribute('aria-current', 'page');
      element.disabled = target < 1 || target > count;
      element.addEventListener('click', () => goTo(target));
      return element;
    };
    const items: HTMLElement[] = [
      button('‹', page - 1, { aria: labels.prev ?? 'Previous page' }),
      ...pageList(page, count).map((item) => {
        if (item === 'gap') {
          const gap = document.createElement('span');
          gap.className = 'page-gap';
          gap.setAttribute('aria-hidden', 'true');
          gap.textContent = '…';
          return gap;
        }
        return button(String(item), item, {
          current: item === page,
          aria: fill(labels.page ?? 'Page {page}', { page: item }),
        });
      }),
      button('›', page + 1, { aria: labels.next ?? 'Next page' }),
    ];
    pages.replaceChildren(...items);
  }

  function pushUrl(): void {
    const url = `${location.pathname}${boardSearch(filter, page)}`;
    if (url !== `${location.pathname}${location.search}`) history.pushState(null, '', url);
  }

  function goTo(target: number): void {
    page = target;
    pushUrl();
    void load(true);
  }

  async function load(scrollUp = false): Promise<void> {
    const current = ++request;
    open = null;
    showState('loading');
    const query = new URLSearchParams(searchFromFilter(filter).slice(1));
    if (page > 1) query.set('cursor', String((page - 1) * BOARD_PAGE_SIZE));
    try {
      const response = await fetch(`/api/game/leaderboard?${query.toString()}`);
      if (!response.ok) throw new Error(String(response.status));
      const result = (await response.json()) as BoardPage;
      if (current !== request) return;
      // A page past the end (old link, rows removed): go to the last one.
      const last = Math.max(1, Math.ceil(result.total / BOARD_PAGE_SIZE));
      if (page > last) {
        page = last;
        history.replaceState(null, '', `${location.pathname}${boardSearch(filter, page)}`);
        void load(scrollUp);
        return;
      }
      const mine = myEntries();
      list.replaceChildren(...result.entries.map((entry) => buildRow(entry, mine)));
      renderPages(result.total);
      summary.textContent = describe(result.total);
      showState(result.total === 0 ? 'empty' : 'rows');
      if (scrollUp) table.scrollIntoView({ block: 'start' });
    } catch {
      if (current !== request) return;
      summary.textContent = '';
      pages.hidden = true;
      showState('error');
    }
  }

  form.addEventListener('change', () => {
    filter = readForm();
    page = 1;
    syncForm();
    pushUrl();
    void load();
  });
  form.addEventListener('submit', (event) => event.preventDefault());

  window.addEventListener('popstate', () => {
    filter = filterFromSearch(location.search);
    page = pageFromSearch(location.search);
    syncForm();
    void load();
  });

  need<HTMLButtonElement>(root, '[data-board-retry]').addEventListener('click', () => {
    void load();
  });

  // The board is cached at the edge for 30 s, so a removed row is dropped here, not reloaded.
  initDialogs(root, labels, (id) => {
    const row = list.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`);
    const neighbour = (
      row?.nextElementSibling ?? row?.previousElementSibling
    )?.querySelector<HTMLElement>('[data-row-toggle]');
    row?.remove();
    open = null;
    summary.textContent = labels.removed ?? '';
    // After the dialog's own focus return (to the removed button) has run.
    window.setTimeout(() => (neighbour ?? table).focus(), 0);
  });
  syncForm();
  void load();
}

/** Report and "Remove my run" dialogs, shared by every row. */
function initDialogs(root: HTMLElement, labels: Labels, onRemoved: (id: string) => void): void {
  const report = document.getElementById('board-report');
  const remove = document.getElementById('board-remove');
  if (!(report instanceof HTMLDialogElement) || !(remove instanceof HTMLDialogElement)) return;
  const reportForm = need<HTMLFormElement>(report, '[data-board-report-form]');
  const reportStatus = need<HTMLElement>(report, '[data-board-report-status]');
  const reportSend = need<HTMLButtonElement>(report, '[data-board-report-send]');
  const box = need<HTMLElement>(report, '[data-turnstile]');
  const removeText = need<HTMLElement>(remove, '[data-board-remove-text]');
  const removeStatus = need<HTMLElement>(remove, '[data-board-remove-status]');
  const removeConfirm = need<HTMLButtonElement>(remove, '[data-board-remove-confirm]');
  let widget: Widget | null | undefined;
  let target = '';

  root.addEventListener('click', async (event) => {
    const button = (event.target as Element | null)?.closest<HTMLButtonElement>(
      '[data-row-report], [data-row-remove]',
    );
    const row = button?.closest<HTMLElement>('.row');
    if (!button || !row) return;
    target = row.dataset.id ?? '';
    const dialog = button.matches('[data-row-report]') ? report : remove;
    dialog.addEventListener('close', () => button.focus(), { once: true });
    if (dialog === remove) {
      removeText.textContent = fill(labels.removeText ?? '', { name: row.dataset.name ?? '' });
      removeStatus.textContent = '';
      removeConfirm.disabled = false;
      remove.showModal();
      return;
    }
    reportStatus.textContent = '';
    reportSend.disabled = false;
    report.showModal();
    if (widget === undefined) {
      widget = await turnstileWidget(box, reportForm.dataset.sitekey ?? '');
      if (!widget) reportStatus.textContent = labels.generic ?? '';
    } else {
      widget?.reset();
    }
  });

  reportForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const token = widget?.token() ?? '';
    if (!token) {
      reportStatus.textContent = labels.verify ?? '';
      return;
    }
    reportSend.disabled = true;
    reportStatus.textContent = labels.sending ?? '';
    try {
      const response = await fetch(`/api/game/scores/${target}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: String(new FormData(reportForm).get('reason') ?? 'name'),
          turnstile: token,
        }),
      });
      if (response.ok) {
        reportStatus.textContent = labels.thanks ?? '';
        window.setTimeout(() => report.close(), 1500);
        return;
      }
      reportStatus.textContent = (response.status === 429 ? labels.limit : labels.generic) ?? '';
    } catch {
      reportStatus.textContent = labels.generic ?? '';
    }
    reportSend.disabled = false;
    widget?.reset();
  });

  removeConfirm.addEventListener('click', async () => {
    const token = submitterToken();
    if (!token) return;
    removeConfirm.disabled = true;
    try {
      const response = await fetch(`/api/game/scores/${target}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok || response.status === 404) {
        forgetEntry(target);
        remove.close();
        onRemoved(target);
        return;
      }
    } catch {
      // Falls through to the error message.
    }
    removeStatus.textContent = labels.removeError ?? '';
    removeConfirm.disabled = false;
  });
}
