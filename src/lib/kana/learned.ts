import type { KanaProgress } from '../progress/kana';

/**
 * "Learned" state in the page: chart cells (`[data-kana]`) get `data-learned` and an
 * accessible "(learned)" suffix, toggles (`[data-learn-toggle="か"]`) get aria-pressed and
 * `[data-learned-count]` shows how many of the script's kana are learned.
 */
export function syncLearned(root: ParentNode, progress: KanaProgress): void {
  const learned = progress.learned();
  for (const cell of root.querySelectorAll<HTMLElement>('[data-kana]')) {
    const done = learned.has(cell.dataset.kana ?? '');
    cell.toggleAttribute('data-learned', done);
    // The spoken suffix exists only on learned cells, to keep the chart HTML small.
    let suffix = cell.querySelector<HTMLElement>('[data-learned-label]');
    if (done && !suffix) {
      suffix = document.createElement('span');
      suffix.className = 'visually-hidden';
      suffix.dataset.learnedLabel = '';
      suffix.textContent = ` ${cell.closest<HTMLElement>('[data-learned-suffix]')?.dataset.learnedSuffix ?? ''}`;
      cell.append(suffix);
    } else if (!done) {
      suffix?.remove();
    }
  }
  for (const toggle of root.querySelectorAll<HTMLElement>('[data-learn-toggle]')) {
    toggle.ariaPressed = String(learned.has(toggle.dataset.learnToggle ?? ''));
  }
  const count = root.querySelector<HTMLElement>('[data-learned-count]');
  if (count) {
    const chars = new Set(
      [...root.querySelectorAll<HTMLElement>('[data-kana]')].map((cell) => cell.dataset.kana),
    );
    const done = [...chars].filter((char) => char && learned.has(char)).length;
    count.textContent = (count.dataset.template ?? '')
      .replace('{count}', String(done))
      .replace('{total}', String(chars.size));
  }
}

/** Wires the "Mark as learned" toggles and shows the stored state. */
export function initLearned(root: HTMLElement, progress: KanaProgress): void {
  syncLearned(root, progress);
  root.addEventListener('click', (event) => {
    const toggle = (event.target as Element).closest<HTMLElement>('[data-learn-toggle]');
    const char = toggle?.dataset.learnToggle;
    if (!toggle || !char) return;
    progress.setLearned(char, toggle.ariaPressed !== 'true');
    syncLearned(root, progress);
  });
}
