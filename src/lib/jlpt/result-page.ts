import { jlptDeps } from '../server/context';
import { buildReport, percentileOf, type ReportData } from './report';
import type { RunRecord } from './run';

export type ResultView = 'report' | 'missing' | 'gone' | 'open' | 'unavailable';

export interface ResultData {
  id: string;
  view: ResultView;
  run: RunRecord | null;
  report: ReportData | null;
  percentile: number | null;
  now: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUS: Record<ResultView, number> = {
  report: 200,
  open: 200,
  missing: 404,
  gone: 410,
  unavailable: 503,
};

/** Loads a run for the result page and sets the response status and headers on `response`. */
export async function loadResult(
  context: Parameters<typeof jlptDeps>[0],
  response: { status?: number; readonly headers: Headers },
  id: string,
): Promise<ResultData> {
  const now = Date.now();
  let view: ResultView = 'missing';
  let run: RunRecord | null = null;
  let report: ReportData | null = null;
  let percentile: number | null = null;

  try {
    const deps = await jlptDeps(context);
    run = UUID.test(id) ? await deps.store.getRun(id) : null;
    if (!run) view = 'missing';
    else if (now >= run.expiresAt) view = 'gone';
    else if (run.status !== 'finished' || !run.scores) view = 'open';
    else {
      view = 'report';
      report = buildReport(run.level, run.seed, await deps.store.getAnswers(run.id), deps.bank);
      const { runs, below } = await deps.store.percentile(run.level, run.scores.total);
      percentile = percentileOf(runs, below);
    }
  } catch (error) {
    console.error('[jlpt] result page', error);
    view = 'unavailable';
  }

  response.status = STATUS[view];
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  response.headers.set(
    'Cache-Control',
    view === 'report' ? 'private, max-age=300' : 'private, no-store',
  );
  return { id, view, run, report, percentile, now };
}
