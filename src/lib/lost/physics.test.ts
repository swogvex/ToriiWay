import { describe, expect, it } from 'vitest';

import { atRest, step, type Body } from './physics';

const bounds = { width: 800, height: 400 };
const body = (overrides: Partial<Body> = {}): Body => ({
  x: 200,
  y: 100,
  vx: 0,
  vy: 0,
  r: 50,
  held: false,
  ...overrides,
});

function run(bodies: Body[], seconds: number): void {
  for (let t = 0; t < seconds; t += 1 / 60) step(bodies, bounds, 1 / 60);
}

describe('physics', () => {
  it('drops a body onto the floor and lets it settle', () => {
    const glyph = body();
    run([glyph], 3);
    expect(glyph.y).toBeCloseTo(bounds.height - glyph.r);
    expect(atRest([glyph], bounds)).toBe(true);
  });

  it('is not at rest while hanging still in the air', () => {
    expect(atRest([body()], bounds)).toBe(false);
  });

  it('keeps fast bodies inside the playground', () => {
    const glyph = body({ vx: 4000, vy: -4000 });
    for (let i = 0; i < 120; i++) {
      step([glyph], bounds, 1 / 60);
      expect(glyph.x).toBeGreaterThanOrEqual(glyph.r);
      expect(glyph.x).toBeLessThanOrEqual(bounds.width - glyph.r);
      expect(glyph.y).toBeGreaterThanOrEqual(glyph.r);
      expect(glyph.y).toBeLessThanOrEqual(bounds.height - glyph.r);
    }
  });

  it('separates overlapping glyphs', () => {
    const a = body({ x: 300, y: 350 });
    const b = body({ x: 320, y: 350 });
    run([a, b], 2);
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeGreaterThanOrEqual(a.r + b.r - 1);
  });

  it('throws a resting body up, even with a negative first step', () => {
    const glyph = body({ y: bounds.height - 50, vy: -1600 });
    step([glyph], bounds, -0.004);
    expect(glyph.vy).toBe(-1600);
    step([glyph], bounds, 1 / 60);
    expect(glyph.y).toBeLessThan(bounds.height - 50);
  });

  it('does not move a held body', () => {
    const held = body({ held: true });
    step([held], bounds, 1 / 60);
    expect(held).toMatchObject({ x: 200, y: 100 });
    expect(atRest([held], bounds)).toBe(false);
  });

  it('pushes a free body away from a held one', () => {
    const held = body({ x: 300, y: 350, held: true });
    const free = body({ x: 310, y: 350 });
    step([held, free], bounds, 1 / 60);
    expect(held.x).toBe(300);
    expect(free.x - held.x).toBeGreaterThanOrEqual(held.r + free.r - 1e-9);
  });
});
