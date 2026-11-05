import { describe, expect, it } from 'vitest';

import { CHART, chartGeometry, nearestPoint, niceMax } from './chart';

describe('chart geometry', () => {
  it('keeps the scale at 60 or more, with a quarter of headroom above the peak', () => {
    expect(niceMax(0)).toBe(60);
    expect(niceMax(42)).toBe(60);
    expect(niceMax(48)).toBe(60);
    // 50 × 1.25 = 62.5 → steps of 30 above 60.
    expect(niceMax(50)).toBe(90);
    expect(niceMax(102)).toBe(150);
  });

  it('ends the line at the right edge, with gridlines every 15 up to 60 and 30 above', () => {
    const geometry = chartGeometry([20, 45], [1, 1], [0]);
    const last = geometry.points.at(-1);
    expect(last?.x).toBe(CHART.width - CHART.right);
    expect(last?.y).toBe(geometry.grid.find((line) => line.value === 45)?.y);
    expect(geometry.grid.map((line) => line.value)).toEqual([15, 30, 45, 60]);
    expect(chartGeometry([120], [1], []).grid.map((line) => line.value)).toEqual([
      30, 60, 90, 120, 150,
    ]);
    expect(geometry.errors[0]).toBeCloseTo(
      CHART.left + (CHART.width - CHART.left - CHART.right) / 4,
    );
  });

  it('finds the nearest point to the pointer', () => {
    const geometry = chartGeometry([10, 20, 30, 40], [1, 1, 1, 1], []);
    expect(nearestPoint(geometry, 1)).toBe(3);
    expect(nearestPoint(geometry, 0)).toBe(0);
  });
});
