/**
 * The 404 playground (07-spec-shell): 迷 and 子 fall into place and can be dragged,
 * thrown and nudged with the keyboard. Glyphs keep their CSS position and move only
 * through transforms, so there is no layout shift. The loop sleeps when everything
 * rests or the tab is hidden.
 */
import { atRest, MAX_SPEED, step, type Body } from './physics';

/** Room left under the floor for the "drag me" hint. */
const FLOOR_GAP = 64;
/** How far back in time the release velocity is measured. */
const THROW_WINDOW_MS = 80;
const NUDGE = 600;
const THROW = 1600;

interface Glyph {
  el: HTMLElement;
  body: Body;
  /** Center of the glyph at its CSS (untransformed) position. */
  homeX: number;
  homeY: number;
}

interface Sample {
  x: number;
  y: number;
  t: number;
}

export function initPlayground(field: HTMLElement): void {
  const hint = field.querySelector<HTMLElement>('[data-lost-hint]');
  const glyphs: Glyph[] = [...field.querySelectorAll<HTMLElement>('[data-lost-glyph]')].map(
    (el) => ({ el, body: { x: 0, y: 0, vx: 0, vy: 0, r: 0, held: false }, homeX: 0, homeY: 0 }),
  );
  const bounds = { width: 0, height: 0 };
  let frame = 0;
  let last = 0;

  function measure(): void {
    bounds.width = field.clientWidth;
    bounds.height = field.clientHeight - FLOOR_GAP;
    for (const glyph of glyphs) {
      const size = glyph.el.offsetWidth;
      glyph.homeX = glyph.el.offsetLeft + size / 2;
      glyph.homeY = glyph.el.offsetTop + size / 2;
      glyph.body.r = size / 2;
    }
  }

  function render(): void {
    for (const { el, body, homeX, homeY } of glyphs) {
      el.style.transform = `translate(${body.x - homeX}px, ${body.y - homeY}px)`;
    }
  }

  function tick(now: number): void {
    step(
      glyphs.map((glyph) => glyph.body),
      bounds,
      (now - last) / 1000,
    );
    last = now;
    render();
    frame = atRest(
      glyphs.map((glyph) => glyph.body),
      bounds,
    )
      ? 0
      : requestAnimationFrame(tick);
  }

  function wake(): void {
    if (frame || document.hidden) return;
    last = performance.now();
    frame = requestAnimationFrame(tick);
  }

  function hideHint(): void {
    hint?.setAttribute('data-hidden', '');
  }

  measure();
  // Start from where the CSS drew them (lifted above their spot), then let them fall.
  for (const glyph of glyphs) {
    const lifted = new DOMMatrixReadOnly(getComputedStyle(glyph.el).transform);
    glyph.body.x = glyph.homeX + lifted.m41;
    glyph.body.y = glyph.homeY + lifted.m42;
  }
  render();
  wake();

  for (const glyph of glyphs) {
    const { el, body } = glyph;
    let samples: Sample[] = [];
    let grabX = 0;
    let grabY = 0;

    el.addEventListener('pointerenter', hideHint, { once: true });
    el.addEventListener('focus', hideHint, { once: true });

    el.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      el.focus({ preventScroll: true });
      el.setPointerCapture(event.pointerId);
      const box = field.getBoundingClientRect();
      grabX = event.clientX - box.left - body.x;
      grabY = event.clientY - box.top - body.y;
      body.held = true;
      body.vx = 0;
      body.vy = 0;
      samples = [];
      hideHint();
      wake();
    });

    el.addEventListener('pointermove', (event) => {
      if (!body.held) return;
      const box = field.getBoundingClientRect();
      body.x = Math.min(Math.max(event.clientX - box.left - grabX, body.r), bounds.width - body.r);
      body.y = Math.min(Math.max(event.clientY - box.top - grabY, body.r), bounds.height - body.r);
      const now = performance.now();
      samples.push({ x: body.x, y: body.y, t: now });
      samples = samples.filter((sample) => now - sample.t <= THROW_WINDOW_MS);
    });

    const release = () => {
      if (!body.held) return;
      body.held = false;
      const first = samples[0];
      const latest = samples.at(-1);
      if (first && latest && latest.t > first.t) {
        const seconds = (latest.t - first.t) / 1000;
        body.vx = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, (latest.x - first.x) / seconds));
        body.vy = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, (latest.y - first.y) / seconds));
      }
      wake();
    };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('lostpointercapture', release);

    el.addEventListener('keydown', (event) => {
      const push: Record<string, [number, number]> = {
        ArrowLeft: [-NUDGE, 0],
        ArrowRight: [NUDGE, 0],
        ArrowUp: [0, -NUDGE * 1.5],
        ArrowDown: [0, NUDGE],
        ' ': [0, -THROW],
      };
      const [dx, dy] = push[event.key] ?? [];
      if (dx === undefined || dy === undefined) return;
      event.preventDefault();
      body.vx += dx;
      body.vy = event.key === ' ' ? dy : body.vy + dy;
      hideHint();
      wake();
    });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(frame);
      frame = 0;
    } else {
      wake();
    }
  });

  new ResizeObserver(() => {
    // Keep each glyph's offset from home while the field resizes.
    const offsets = glyphs.map(({ body, homeX, homeY }) => [body.x - homeX, body.y - homeY]);
    measure();
    glyphs.forEach((glyph, index) => {
      const [dx = 0, dy = 0] = offsets[index] ?? [];
      glyph.body.x = Math.min(
        Math.max(glyph.homeX + dx, glyph.body.r),
        bounds.width - glyph.body.r,
      );
      glyph.body.y = Math.min(
        Math.max(glyph.homeY + dy, glyph.body.r),
        bounds.height - glyph.body.r,
      );
    });
    render();
    wake();
  }).observe(field);
}
