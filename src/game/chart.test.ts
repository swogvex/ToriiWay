import { describe, expect, it } from 'vitest';

import { CHART, chartGeometry, nearestPoint, niceMax } from './chart';

describe('chart geometry', () => {
  it('rounds the scale up to the next ten', () => {
    expect(niceMax(0)).toBe(10);
    expect(niceMax(42)).toBe(50);
    expect(niceMax(50)).toBe(50);
  });

  it('ends the line at the right edge and puts the top value on the top gridline', () => {
    const geometry = chartGeometry([20, 40], [1, 1], [0]);
    const last = geometry.points.at(-1);
    expect(last?.x).toBe(CHART.width - CHART.right);
    expect(last?.y).toBe(geometry.grid[1]?.y);
    expect(geometry.grid.map((line) => line.value)).toEqual([20, 40]);
    expect(geometry.errors[0]).toBeCloseTo(CHART.left + (CHART.width - CHART.left - CHART.right) / 4);
  });

  it('finds the nearest point to the pointer', () => {
    const geometry = chartGeometry([10, 20, 30, 40], [1, 1, 1, 1], []);
    expect(nearestPoint(geometry, 1)).toBe(3);
    expect(nearestPoint(geometry, 0)).toBe(0);
  });
});
