import type { APIRoute } from 'astro';

import { LEVELS } from '../../../../lib/jlpt/levels';
import { renderReportPng } from '../../../../lib/jlpt/og';
import { jlptDeps } from '../../../../lib/server/context';
import { fail, handle, HttpError, methodNotAllowed } from '../../../../lib/server/http';

export const prerender = false;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// English scoring section names; the image is shared across languages.
const SCORING: Record<string, string> = {
  hiragana: 'Hiragana',
  katakana: 'Katakana & numbers',
  dictation: 'Dictation',
  'language-reading': 'Language knowledge · Reading',
  language: 'Language knowledge',
  reading: 'Reading',
  listening: 'Listening',
};

/** PNG of a finished run's score report, for sharing and the results email. */
export const GET: APIRoute = (context) =>
  handle(async () => {
    const id = context.params.id ?? '';
    if (!UUID.test(id)) return fail('not-found', 404);
    const deps = await jlptDeps(context);
    const run = await deps.store.getRun(id);
    if (!run) return fail('not-found', 404);
    if (Date.now() >= run.expiresAt) return fail('gone', 410);
    if (run.status !== 'finished' || !run.scores) throw new HttpError('conflict', 409, 'open run');
    const png = await renderReportPng({
      level: run.level === 'kana' ? 'Kana' : run.level,
      name: run.name,
      date: new Date(run.finishedAt ?? run.createdAt).toISOString().slice(0, 10),
      scores: run.scores,
      labels: LEVELS[run.level].scoring.map((section) => SCORING[section.id] ?? section.id),
      reference: `${deps.site.host} · Run #${run.id.slice(0, 8).toUpperCase()}`,
    });
    return new Response(new Blob([new Uint8Array(png)], { type: 'image/png' }), {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600',
        'X-Robots-Tag': 'noindex, nofollow',
        'Content-Disposition': `inline; filename="toriiway-${run.level.toLowerCase()}-report.png"`,
      },
    });
  });

export const ALL: APIRoute = () => methodNotAllowed('GET');
