// End of the run: pass or not yet and the scaled scores. The full score report and
// result page replace this screen later (09-spec-jlpt, artboard 14).

import { saveName } from '../client';
import type { PublicRunState } from '../run';
import type { Labels } from './labels';

function row(label: string, cells: string[], total = false): HTMLTableRowElement {
  const tr = document.createElement('tr');
  if (total) tr.dataset.total = '';
  const th = document.createElement('th');
  th.scope = 'row';
  th.textContent = label;
  tr.append(th);
  for (const text of cells) {
    const td = document.createElement('td');
    td.textContent = text;
    tr.append(td);
  }
  return tr;
}

export function renderDone(root: HTMLElement, state: PublicRunState, t: Labels): void {
  const scores = state.scores;
  const set = (selector: string, text: string) => {
    const node = root.querySelector(selector);
    if (node) node.textContent = text;
  };
  set('[data-done-kicker]', t('jlpt.done.kicker', { level: t(`level.${state.level}`) }));
  root.hidden = false;
  if (!scores) return;
  set('[data-done-title]', t(scores.passed ? 'jlpt.done.passed' : 'jlpt.done.notYet'));
  set('[data-done-mark]', t('jlpt.done.passMark', { mark: scores.passMark, max: scores.max }));
  root
    .querySelector('[data-done-rows]')
    ?.replaceChildren(
      ...scores.sections.map((section) =>
        row(t(`scoring.${section.id}`), [
          `${section.scaled} / ${section.max}`,
          `${t('jlpt.done.minimum', { min: section.min })} ${section.passed ? '✓' : '✗'}`,
        ]),
      ),
      row(t('jlpt.done.total'), [`${scores.total} / ${scores.max}`, ''], true),
    );
  root.querySelector<HTMLElement>('[data-done-title]')?.focus();

  const form = root.querySelector<HTMLFormElement>('[data-report-form]');
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = String(new FormData(form).get('name') ?? '').trim();
    try {
      if (name) await saveName(state.id, name);
    } finally {
      window.location.assign(`${form.dataset.reportBase ?? '/jlpt/r/'}${state.id}`);
    }
  });
}
