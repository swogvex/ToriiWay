/**
 * The 404 playground (07-spec-shell): 迷 and 子 drop onto the ground line as soon as the
 * page shows, and can be grabbed by any point, swung, thrown and nudged with the
 * keyboard. Glyphs keep their CSS position and move only through transforms (no layout
 * shift). requestAnimationFrame pauses by itself in hidden tabs; the loop also sleeps
 * once everything rests.
 */
import { atRest, step, toLocal, type Body } from './physics';

const NUDGE = 600;
const THROW = 1700;
/** Initial tumble (rad/s), so the glyphs land on a corner and tip over. */
const DROP_SPIN = 1.6;

interface Glyph {
  el: HTMLElement;
  body: Body;
  /** Center of the glyph at its CSS (untransformed) position. */
  homeX: number;
  homeY: number;
}

export function initPlayground(field: HTMLElement): void {
  const hint = field.querySelector<HTMLElement>('[data-lost-hint]');
  const glyphs: Glyph[] = [...field.querySelectorAll<HTMLElement>('[data-lost-glyph]')].map(
    (el) => ({
      el,
      body: { x: 0, y: 0, vx: 0, vy: 0, angle: 0, spin: 0, half: 0 },
      homeX: 0,
      homeY: 0,
    }),
  );
  const bodies = glyphs.map((glyph) => glyph.body);
  const bounds = { width: 0, height: 0 };
  let running = false;
  let last = 0;

  function measure(): void {
    bounds.width = field.clientWidth;
    bounds.height = field.clientHeight;
    for (const glyph of glyphs) {
      const size = glyph.el.offsetWidth;
      glyph.homeX = glyph.el.offsetLeft + size / 2;
      glyph.homeY = glyph.el.offsetTop + size / 2;
      glyph.body.half = size / 2;
    }
  }

  function render(): void {
    for (const { el, body, homeX, homeY } of glyphs) {
      el.style.transform = `translate(${body.x - homeX}px, ${body.y - homeY}px) rotate(${body.angle}rad)`;
    }
  }

  function tick(now: number): void {
    step(bodies, bounds, (now - last) / 1000);
    last = now;
    render();
    if (atRest(bodies, bounds)) running = false;
    else requestAnimationFrame(tick);
  }

  function wake(): void {
    if (running || document.visibilityState === 'hidden') return;
    running = true;
    last = performance.now();
    requestAnimationFrame(tick);
  }

  function hideHint(): void {
    hint?.setAttribute('data-hidden', '');
  }

  function pointer(event: PointerEvent): [number, number] {
    const box = field.getBoundingClientRect();
    return [event.clientX - box.left, event.clientY - box.top];
  }

  measure();
  // Start where the CSS drew them (lifted above the ground), tumbling a little.
  glyphs.forEach((glyph, index) => {
    const lifted = new DOMMatrixReadOnly(getComputedStyle(glyph.el).transform);
    glyph.body.x = glyph.homeX + lifted.m41;
    glyph.body.y = glyph.homeY + lifted.m42;
    glyph.body.spin = index % 2 === 0 ? -DROP_SPIN : DROP_SPIN;
  });
  render();
  wake();

  for (const { el, body } of glyphs) {
    el.addEventListener('pointerenter', hideHint, { once: true });
    el.addEventListener('focus', hideHint, { once: true });

    // No focus on press: the focus ring is for keyboard users only.
    el.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      el.setPointerCapture(event.pointerId);
      const [x, y] = pointer(event);
      const [localX, localY] = toLocal(body, x, y);
      body.grab = { localX, localY, targetX: x, targetY: y };
      hideHint();
      wake();
    });

    el.addEventListener('pointermove', (event) => {
      if (!body.grab) return;
      [body.grab.targetX, body.grab.targetY] = pointer(event);
      wake();
    });

    // Letting go keeps the body's own velocity and spin: that is the throw.
    const release = () => {
      body.grab = undefined;
      wake();
    };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('lostpointercapture', release);

    el.addEventListener('keydown', (event) => {
      const push: Record<string, [number, number, number]> = {
        ArrowLeft: [-NUDGE, 0, -2],
        ArrowRight: [NUDGE, 0, 2],
        ArrowUp: [0, -NUDGE * 1.5, 0],
        ArrowDown: [0, NUDGE, 0],
        ' ': [0, -THROW, 4],
      };
      const [dx, dy, spin] = push[event.key] ?? [];
      if (dx === undefined || dy === undefined || spin === undefined) return;
      event.preventDefault();
      body.vx += dx;
      body.vy = event.key === ' ' ? dy : body.vy + dy;
      body.spin += event.key === ' ' && Math.random() < 0.5 ? -spin : spin;
      hideHint();
      wake();
    });
  }

  document.addEventListener('visibilitychange', wake);

  new ResizeObserver(() => {
    // Keep each glyph's offset from home while the field resizes.
    const offsets = glyphs.map(({ body, homeX, homeY }) => [body.x - homeX, body.y - homeY]);
    measure();
    glyphs.forEach((glyph, index) => {
      const [dx = 0, dy = 0] = offsets[index] ?? [];
      const { half } = glyph.body;
      glyph.body.x = Math.min(Math.max(glyph.homeX + dx, half), bounds.width - half);
      glyph.body.y = Math.min(Math.max(glyph.homeY + dy, half), bounds.height - half);
    });
    render();
    wake();
  }).observe(field);
}
