// Server-rendered PNG of a JLPT score report (09-spec-jlpt: report image), 1200×630 for
// sharing and email. Satori lays out the element tree to SVG; resvg rasterizes it.

import { Resvg } from '@resvg/resvg-js';
import satori from 'satori';

import mono from '../../assets/og/ibm-plex-mono-latin-400-normal.woff?inline';
import sans700 from '../../assets/og/schibsted-grotesk-latin-700-normal.woff?inline';
import sans400 from '../../assets/og/schibsted-grotesk-latin-400-normal.woff?inline';
import ja400 from '../../assets/og/zen-kaku-gothic-new-og-400.ttf?inline';
import ja700 from '../../assets/og/zen-kaku-gothic-new-og-700.ttf?inline';
import type { ScoreReport } from './scoring';

/** Light-theme values of src/styles/tokens.css (the image cannot read CSS variables). */
const COLOR = {
  bg: '#f5f4f0',
  surface: '#ffffff',
  ink: '#141414',
  muted: '#5e5e58',
  line: '#cfcdc5',
  accent: '#c8402e',
  info: '#1f6f8b',
  infoSoft: '#d7eaf1',
} as const;

export interface ReportImage {
  level: string;
  name: string | null;
  date: string;
  scores: ScoreReport;
  /** English label of each scoring section, in order. */
  labels: string[];
  /** Short footer reference, e.g. "toriiway.xyz · Run #6F1C2F9E". */
  reference: string;
}

type Style = Record<string, string | number>;
interface Node {
  type: string;
  props: { style?: Style; children?: (Node | string)[] | Node | string };
}

const h = (style: Style, ...children: (Node | string)[]): Node => ({
  type: 'div',
  props: { style: { display: 'flex', ...style }, children },
});

const toBuffer = (dataUrl: string) =>
  Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');

let fonts: Parameters<typeof satori>[1]['fonts'] | undefined;

function loadFonts() {
  fonts ??= [
    { name: 'Sans', data: toBuffer(sans400), weight: 400, style: 'normal' },
    { name: 'Sans', data: toBuffer(sans700), weight: 700, style: 'normal' },
    { name: 'Mono', data: toBuffer(mono), weight: 400, style: 'normal' },
    { name: 'JA', data: toBuffer(ja400), weight: 400, style: 'normal' },
    { name: 'JA', data: toBuffer(ja700), weight: 700, style: 'normal' },
  ];
  return fonts;
}

function score(label: string, scaled: number, max: number, highlight: boolean): Node {
  return h(
    {
      flexDirection: 'column',
      flex: 1,
      gap: 6,
      padding: '18px 24px',
      borderLeft: `2px solid ${COLOR.line}`,
      backgroundColor: highlight ? COLOR.bg : COLOR.surface,
    },
    h({ fontSize: 20, color: COLOR.muted }, label),
    h(
      { alignItems: 'baseline', gap: 10 },
      h({ fontSize: 60, fontWeight: 700, color: COLOR.ink }, String(scaled)),
      h({ fontFamily: 'Mono', fontSize: 24, color: COLOR.muted }, `/ ${max}`),
    ),
  );
}

export function reportTree(report: ReportImage): Node {
  const { scores } = report;
  const passed = scores.passed;
  return h(
    {
      width: 1200,
      height: 630,
      padding: 36,
      backgroundColor: COLOR.bg,
      fontFamily: 'Sans, JA',
      color: COLOR.ink,
    },
    h(
      {
        position: 'relative',
        flexDirection: 'column',
        width: 1128,
        height: 558,
        overflow: 'hidden',
        backgroundColor: COLOR.surface,
        border: `3px solid ${COLOR.ink}`,
        borderRadius: 24,
      },
      h(
        {
          position: 'absolute',
          right: 40,
          bottom: 30,
          fontFamily: 'JA',
          fontSize: 230,
          fontWeight: 700,
          color: COLOR.accent,
          opacity: 0.07,
          transform: 'rotate(-14deg)',
        },
        '模擬',
      ),
      h(
        {
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '26px 40px',
          backgroundColor: COLOR.ink,
          color: COLOR.bg,
        },
        h(
          { flexDirection: 'column', gap: 6 },
          h({ fontFamily: 'JA', fontSize: 40, fontWeight: 700 }, '日本語能力試験 模擬テスト'),
          h(
            { fontFamily: 'Mono', fontSize: 20 },
            'Japanese-Language Proficiency Test · Unofficial simulation',
          ),
        ),
        h({ fontSize: 64, fontWeight: 700 }, report.level),
      ),
      h(
        { alignItems: 'center', justifyContent: 'space-between', padding: '28px 40px', gap: 24 },
        h(
          { flexDirection: 'column', gap: 6 },
          h({ fontSize: 44, fontWeight: 700 }, report.name ?? 'JLPT simulation'),
          h({ fontFamily: 'Mono', fontSize: 22, color: COLOR.muted }, report.date),
        ),
        h(
          {
            alignItems: 'baseline',
            gap: 16,
            padding: '14px 28px',
            borderRadius: 16,
            backgroundColor: passed ? COLOR.infoSoft : COLOR.bg,
            color: passed ? COLOR.info : COLOR.ink,
          },
          h({ fontFamily: 'JA', fontSize: 64, fontWeight: 700 }, passed ? '合格' : '不合格'),
          h({ fontSize: 30, fontWeight: 700 }, passed ? 'PASSED' : 'NOT YET'),
        ),
      ),
      h(
        {
          marginLeft: 40,
          marginRight: 40,
          border: `2px solid ${COLOR.line}`,
          borderLeft: 'none',
          borderRadius: 12,
          overflow: 'hidden',
        },
        ...scores.sections.map((section, index) =>
          score(report.labels[index] ?? section.id, section.scaled, section.max, false),
        ),
        score('Total', scores.total, scores.max, true),
      ),
      h(
        {
          marginTop: 'auto',
          justifyContent: 'space-between',
          padding: '18px 40px',
          fontFamily: 'Mono',
          fontSize: 18,
          color: COLOR.muted,
        },
        h({}, `Pass mark ${scores.passMark} / ${scores.max} · Not an official JLPT result`),
        h({}, report.reference),
      ),
    ),
  );
}

export async function renderReportPng(report: ReportImage): Promise<Uint8Array> {
  const svg = await satori(reportTree(report) as unknown as Parameters<typeof satori>[0], {
    width: 1200,
    height: 630,
    fonts: loadFonts(),
  });
  return new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();
}
