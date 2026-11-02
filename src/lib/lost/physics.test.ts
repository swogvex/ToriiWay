import { describe, expect, it } from 'vitest';

import { atRest, corners, step, toWorld, type Body } from './physics';

const bounds = { width: 800, height: 400 };
const body = (overrides: Partial<Body> = {}): Body => ({
  x: 200,
  y: 100,
  vx: 0,
  vy: 0,
  angle: 0,
  spin: 0,
  half: 50,
  ...overrides,
});

function run(bodies: Body[], seconds: number): void {
  for (let t = 0; t < seconds; t += 1 / 60) step(bodies, bounds, 1 / 60);
}

/** Distance of an angle from the nearest multiple of 90°. */
const offSquare = (angle: number) => {
  const quarter = Math.PI / 2;
  const rest = ((angle % quarter) + quarter) % quarter;
  return Math.min(rest, quarter - rest);
};

const inside = (glyph: Body) =>
  corners(glyph).every(
    ([x, y]) => x >= -2 && x <= bounds.width + 2 && y >= -2 && y <= bounds.height + 2,
  );

describe('physics', () => {
  it('drops a body onto the floor and lets it settle', () => {
    const glyph = body();
    run([glyph], 3);
    expect(glyph.y).toBeCloseTo(bounds.height - glyph.half, 0);
    expect(atRest([glyph], bounds)).toBe(true);
  });

  it('tips a body that lands on a corner until it lies flat', () => {
    const glyph = body({ angle: 0.35 });
    run([glyph], 4);
    expect(offSquare(glyph.angle)).toBeLessThan(0.03);
    expect(atRest([glyph], bounds)).toBe(true);
  });

  it('is not at rest while hanging still in the air', () => {
    expect(atRest([body()], bounds)).toBe(false);
  });

  it('keeps fast spinning bodies inside the playground', () => {
    const glyph = body({ vx: 4000, vy: -3000, spin: 15 });
    for (let i = 0; i < 180; i++) {
      step([glyph], bounds, 1 / 60);
      expect(inside(glyph)).toBe(true);
    }
  });

  it('separates overlapping glyphs and knocks them apart', () => {
    const a = body({ x: 300, y: 340 });
    const b = body({ x: 340, y: 300, angle: 0.4 });
    run([a, b], 3);
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeGreaterThan(95);
    expect(inside(a) && inside(b)).toBe(true);
  });

  it('settles two glyphs dropped side by side, as on the 404', () => {
    const a = body({ x: 350, y: 150 });
    const b = body({ x: 450, y: 150 });
    run([a, b], 4);
    expect(atRest([a, b], bounds)).toBe(true);
    expect(b.x - a.x).toBeGreaterThanOrEqual(99);
    expect(a.y).toBeCloseTo(bounds.height - a.half, 0);
    expect(offSquare(a.angle) + offSquare(b.angle)).toBeLessThan(0.02);
  });

  it('hangs a body grabbed by its corner like a pendulum', () => {
    const glyph = body({ x: 400, y: 200 });
    glyph.grab = { localX: -50, localY: -50, targetX: 350, targetY: 150 };
    run([glyph], 4);
    const [px, py] = toWorld(glyph, -50, -50);
    expect(Math.hypot(px - 350, py - 150)).toBeLessThan(15);
    // The center ends up straight below the held corner, so the square turns 45°.
    expect(Math.abs(glyph.x - 350)).toBeLessThan(6);
    expect(offSquare(glyph.angle)).toBeGreaterThan(Math.PI / 4 - 0.1);
    expect(atRest([glyph], bounds)).toBe(false);
  });

  it('ignores negative frame times', () => {
    const glyph = body({ vy: -1600 });
    step([glyph], bounds, -0.004);
    expect(glyph).toMatchObject({ y: 100, vy: -1600 });
  });
});
