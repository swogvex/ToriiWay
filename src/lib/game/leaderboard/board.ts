// /game/leaderboard: filters in the URL, paged rows from the API, one expandable row at a
// time with its chart, and the Report / "Remove my run" dialogs. Rows are built from a
// <template> with textContent only, so player names can never inject markup.

import { chartGeometry, renderChart } from '../../../game/chart';
import { turnstileWidget, type Widget } from '../../turnstile-client';
import {
  type BoardPage,
  clock,
  filterFromSearch,
  forgetEntry,
  myEntries,
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
  const more = need<HTMLButtonElement>(root, '[data-board-more]');
  const template = need<HTMLTemplateElement>(root, '[data-row-template]');
  const skeleton = list.innerHTML;

  let filter: BoardFilter = filterFromSearch(location.search);
  let next: string | null = null;
  /** Ignores answers to requests that a newer filter change replaced. */
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
    const title = need<HTMLElement>(row, '[data-f="chart-title"]');
    const desc = need<SVGDescElement>(row, '[data-chart-desc]');
    title.id = `board-chart-title-${entry.id}`;
    desc.id = `board-chart-desc-${entry.id}`;
    svg.setAttribute('aria-labelledby', `${title.id} ${desc.id}`);
    const points = entry.series.length;
    const step = points > 0 ? entry.durationS / points : 1;
    const durations = Array.from({ length: points }, () => step);
    renderChart(svg, chartGeometry(entry.series, durations, entry.errors));
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
  }

  async function load(append: boolean): Promise<void> {
    const current = ++request;
    if (!append) {
      open = null;
      showState('loading');
      more.hidden = true;
    }
    more.disabled = true;
    const query = new URLSearchParams(searchFromFilter(filter).slice(1));
    if (append && next) query.set('cursor', next);
    try {
      const response = await fetch(`/api/game/leaderboard?${query.toString()}`);
      if (!response.ok) throw new Error(String(response.status));
      const page = (await response.json()) as BoardPage;
      if (current !== request) return;
      const mine = myEntries();
      const rows = page.entries.map((entry) => buildRow(entry, mine));
      if (append) list.append(...rows);
      else list.replaceChildren(...rows);
      next = page.next;
      more.hidden = next === null;
      summary.textContent = describe(page.total);
      showState(page.total === 0 ? 'empty' : 'rows');
    } catch {
      if (current !== request) return;
      if (append) {
        more.hidden = false;
      } else {
        summary.textContent = '';
        showState('error');
      }
    } finally {
      if (current === request) more.disabled = false;
    }
  }

  form.addEventListener('change', () => {
    filter = readForm();
    syncForm();
    const url = `${location.pathname}${searchFromFilter(filter)}`;
    if (url !== `${location.pathname}${location.search}`) history.pushState(null, '', url);
    void load(false);
  });
  form.addEventListener('submit', (event) => event.preventDefault());

  window.addEventListener('popstate', () => {
    filter = filterFromSearch(location.search);
    syncForm();
    void load(false);
  });

  need<HTMLButtonElement>(root, '[data-board-retry]').addEventListener('click', () => {
    void load(false);
  });
  more.addEventListener('click', () => void load(true));

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
    window.setTimeout(() => (neighbour ?? more).focus(), 0);
  });
  syncForm();
  void load(false);
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
