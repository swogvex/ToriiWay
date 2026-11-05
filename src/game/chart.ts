// WPM-over-time chart for the results screen: one ink line, × marks for seconds with errors.
// Geometry is pure (tested); the renderer builds SVG nodes so no inline style is needed.

export const CHART = { width: 640, height: 220, left: 36, right: 8, top: 12, plot: 150 } as const;

export interface ChartGeometry {
  /** Line points in viewBox units, one per sample. */
  points: { x: number; y: number }[];
  /** Gridlines every gridStep() up to the top of the scale. */
  grid: { value: number; y: number }[];
  /** × positions (middle of each second with errors). */
  errors: number[];
  /** Y of the × row, under the plot. */
  errorY: number;
  /** Y of the baseline. */
  baseY: number;
}

/**
 * Gridline step: every 15 WPM up to 60 (15 · 30 · 45 · 60), every 30 above, so fast runs
 * do not crowd the axis.
 */
export function gridStep(max: number): number {
  return max <= 60 ? 15 : 30;
}

/** Room above the peak: the top quarter stays free for the hover tooltip. */
const HEADROOM = 1.25;

/**
 * Top of the scale: at least 60 (owner, 2026-11-06), and high enough that the line stays
 * under the tooltip at the top; rounded up to a whole gridline.
 */
export function niceMax(value: number): number {
  const wanted = Math.max(60, value * HEADROOM);
  const step = gridStep(wanted);
  return Math.ceil(wanted / step) * step;
}

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
    grid: Array.from(
      { length: max / gridStep(max) },
      (_, index) => (index + 1) * gridStep(max),
    ).map((value) => ({ value, y: y(value) })),
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

/** Draws the chart into `svg` (clearing it) and returns the hover dot (hidden until hover). */
export function renderChart(svg: SVGSVGElement, geometry: ChartGeometry): SVGCircleElement {
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
  const dot = node('circle', { cx: 0, cy: 0, r: 6 }, 'chart__dot');
  dot.setAttribute('visibility', 'hidden');
  svg.append(dot);
  return dot;
}

/** Puts the hover dot on a point of the line. */
export function showDot(dot: SVGCircleElement, point: { x: number; y: number }): void {
  dot.setAttribute('cx', point.x.toFixed(1));
  dot.setAttribute('cy', point.y.toFixed(1));
  dot.setAttribute('visibility', 'visible');
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
