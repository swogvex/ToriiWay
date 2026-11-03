// WPM-over-time chart for the results screen: one ink line, × marks for seconds with errors.
// Geometry is pure (tested); the renderer builds SVG nodes so no inline style is needed.

export const CHART = { width: 640, height: 220, left: 36, right: 8, top: 12, plot: 150 } as const;

export interface ChartGeometry {
  /** Line points in viewBox units, one per sample. */
  points: { x: number; y: number }[];
  /** Gridlines at half and full scale. */
  grid: { value: number; y: number }[];
  /** × positions (middle of each second with errors). */
  errors: number[];
  /** Y of the × row, under the plot. */
  errorY: number;
  /** Y of the baseline. */
  baseY: number;
}

/** A round top for the scale: the next multiple of 10, at least 10. */
export function niceMax(value: number): number {
  return Math.max(10, Math.ceil(value / 10) * 10);
}

/**
 * Lays out the series. `durations` are the sample lengths (the last one may be
 * shorter than a second), so the line ends exactly at the run's time.
 */
export function chartGeometry(
  series: readonly number[],
  durations: readonly number[],
  errorSeconds: readonly number[],
): ChartGeometry {
  const { width, left, right, top, plot } = CHART;
  const total = durations.reduce((sum, seconds) => sum + seconds, 0) || 1;
  const max = niceMax(Math.max(0, ...series));
  const span = width - left - right;
  const x = (time: number) => left + (time / total) * span;
  const y = (value: number) => top + plot - (value / max) * plot;
  let time = 0;
  const points = series.map((value, index) => {
    time += durations[index] ?? 1;
    return { x: x(time), y: y(value) };
  });
  return {
    points,
    grid: [max / 2, max].map((value) => ({ value, y: y(value) })),
    errors: errorSeconds.map((second) => x(Math.min(second + 0.5, total))),
    errorY: top + plot + 24,
    baseY: top + plot + 44,
  };
}

const SVG = 'http://www.w3.org/2000/svg';

function node<K extends keyof SVGElementTagNameMap>(
  name: K,
  attributes: Record<string, string | number>,
  className?: string,
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attributes)) el.setAttribute(key, String(value));
  if (className) el.setAttribute('class', className);
  return el;
}

/** Draws the chart into `svg` (clearing it) and returns the crosshair line for hover. */
export function renderChart(svg: SVGSVGElement, geometry: ChartGeometry): SVGLineElement {
  const { width, height, left, right } = CHART;
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  for (const child of [...svg.children]) {
    if (child.tagName !== 'title' && child.tagName !== 'desc') child.remove();
  }
  const end = width - right;
  for (const { value, y } of geometry.grid) {
    svg.append(node('line', { x1: left, x2: end, y1: y, y2: y }, 'chart__grid'));
    const label = node('text', { x: left - 8, y: y + 4, 'text-anchor': 'end' }, 'chart__label');
    label.textContent = String(value);
    svg.append(label);
  }
  svg.append(
    node('line', { x1: left, x2: end, y1: geometry.baseY, y2: geometry.baseY }, 'chart__axis'),
  );
  if (geometry.points.length > 0) {
    const d = geometry.points
      .map(({ x, y }, index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`)
      .join(' ');
    svg.append(node('path', { d, fill: 'none' }, 'chart__line'));
  }
  const size = 5;
  for (const x of geometry.errors) {
    const mark = node('g', {}, 'chart__error');
    const y = geometry.errorY;
    mark.append(
      node('line', { x1: x - size, y1: y - size, x2: x + size, y2: y + size }),
      node('line', { x1: x - size, y1: y + size, x2: x + size, y2: y - size }),
    );
    svg.append(mark);
  }
  const cross = node('line', { x1: 0, x2: 0, y1: 0, y2: geometry.baseY }, 'chart__cross');
  cross.setAttribute('visibility', 'hidden');
  svg.append(cross);
  return cross;
}

/** The point nearest to a pointer position given as a share (0–1) of the chart's width. */
export function nearestPoint(geometry: ChartGeometry, share: number): number {
  const x = share * CHART.width;
  let best = -1;
  let distance = Infinity;
  geometry.points.forEach((point, index) => {
    const d = Math.abs(point.x - x);
    if (d < distance) {
      distance = d;
      best = index;
    }
  });
  return best;
}
