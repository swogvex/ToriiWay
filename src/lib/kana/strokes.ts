import { GLYPH_SIZE, type GlyphLayout } from './glyph';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Restarts the stroke animation of a StrokeOrder SVG (components/learn/StrokeOrder.astro). */
export function playStrokes(svg: SVGSVGElement): void {
  svg.classList.remove('strokes--playing');
  // Reading layout flushes styles, so re-adding the class starts the animation again.
  void svg.getBoundingClientRect();
  svg.classList.add('strokes--playing');
}

/** Redraws a StrokeOrder SVG for another kana, with the same structure as the component. */
export function drawStrokes(svg: SVGSVGElement, glyph: GlyphLayout, label: string): void {
  const group = (name: string) => {
    const element = document.createElementNS(SVG_NS, 'g');
    element.setAttribute('class', `strokes__${name}`);
    return element;
  };
  const guide = group('guide');
  const ink = group('ink');
  const numbers = group('numbers');

  for (const stroke of glyph.strokes) {
    for (const parent of [guide, ink]) {
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', stroke.d);
      if (stroke.x) path.setAttribute('transform', `translate(${stroke.x} 0)`);
      if (parent === ink) path.setAttribute('pathLength', '1');
      parent.append(path);
    }
  }
  glyph.numbers.forEach((number, index) => {
    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('x', String(number.x));
    text.setAttribute('y', String(number.y));
    text.textContent = String(index + 1);
    numbers.append(text);
  });

  svg.setAttribute('viewBox', `0 0 ${glyph.width} ${GLYPH_SIZE}`);
  svg.setAttribute('aria-label', label);
  svg.replaceChildren(guide, ink, numbers);
}
