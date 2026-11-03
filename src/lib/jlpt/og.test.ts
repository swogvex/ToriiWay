import { writeFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { renderReportPng } from './og';
import { scoreRun } from './scoring';

const answers = (
  subArea: 'vocabulary' | 'grammar' | 'reading' | 'listening',
  right: number,
  total: number,
) => Array.from({ length: total }, (_, index) => ({ subArea, correct: index < right }));

describe('renderReportPng', () => {
  it('renders a 1200×630 PNG of the report', async () => {
    const scores = scoreRun('N5', [
      ...answers('vocabulary', 18, 21),
      ...answers('grammar', 12, 17),
      ...answers('reading', 3, 5),
      ...answers('listening', 12, 24),
    ]);
    const png = await renderReportPng({
      level: 'N5',
      name: 'swogvex',
      date: '2026-11-03',
      scores,
      labels: ['Language knowledge · Reading', 'Listening'],
      reference: 'toriiway.xyz · Run #6F1C2F9E',
    });
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
    expect([...png.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect([view.getUint32(16), view.getUint32(20)]).toEqual([1200, 630]);
    if (process.env.OG_PREVIEW) await writeFile(process.env.OG_PREVIEW, png);
  }, 20_000);
});
