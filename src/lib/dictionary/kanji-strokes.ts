// Kanji page: draws the strokes in order and lets the visitor step through them.

const FULL_DRAW_MS = 6000;
const MAX_STEP_MS = 600;
const DRAW_SHARE = 0.8;

function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function initKanjiStrokes(root: HTMLElement): void {
  const paths = [...root.querySelectorAll<SVGPathElement>('.strokes__ink path')];
  const numbers = [...root.querySelectorAll<SVGTextElement>('.strokes__numbers text')];
  const controls = root.querySelector<HTMLElement>('[data-stroke-controls]');
  const previous = root.querySelector<HTMLButtonElement>('[data-stroke-prev]');
  const next = root.querySelector<HTMLButtonElement>('[data-stroke-next]');
  const replay = root.querySelector<HTMLButtonElement>('[data-stroke-replay]');
  const status = root.querySelector<HTMLElement>('[data-stroke-status]');
  if (paths.length === 0 || !controls || !previous || !next || !replay || !status) return;

  const total = paths.length;
  let shown = total;
  let running: Animation[] = [];

  function cancel(): void {
    for (const animation of running) animation.cancel();
    running = [];
  }

  function show(count: number, announce: boolean): void {
    cancel();
    shown = count;
    paths.forEach((path, index) => path.classList.toggle('is-off', index >= count));
    numbers.forEach((number, index) => number.classList.toggle('is-off', index >= count));
    if (previous) previous.disabled = count <= 1;
    if (next) next.disabled = count >= total;
    if (announce && status) {
      status.textContent = (status.dataset.template ?? '')
        .replace('{current}', String(count))
        .replace('{total}', String(total));
    }
  }

  function play(): void {
    show(total, false);
    if (reducedMotion()) return;
    const step = Math.min(MAX_STEP_MS, FULL_DRAW_MS / total);
    running = paths.map((path, index) =>
      path.animate(
        [
          { strokeDasharray: '1', strokeDashoffset: '1' },
          { strokeDasharray: '1', strokeDashoffset: '0' },
        ],
        { duration: step * DRAW_SHARE, delay: index * step, fill: 'backwards', easing: 'ease' },
      ),
    );
  }

  previous.addEventListener('click', () => show(shown - 1, true));
  next.addEventListener('click', () => show(shown + 1, true));
  replay.addEventListener('click', play);

  controls.hidden = false;
  play();
}
