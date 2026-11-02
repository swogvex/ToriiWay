import type { APIRoute, GetStaticPaths } from 'astro';

import { DEFAULT_LOCALE } from '../../../i18n';
import { getKana, panelKana, SCRIPTS, type Script } from '../../../lib/kana/data';

/**
 * Detail panel data for every kana of a script, prerendered to /data/kana/<script>.json.
 * The chart fetches it after load instead of inlining it, which keeps the page HTML small.
 */
export const getStaticPaths = (() =>
  SCRIPTS.map((script) => ({ params: { script } }))) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ params }) => {
  const script = params.script as Script;
  const items = await getKana(script);
  return new Response(
    JSON.stringify(items.map((kana) => panelKana(kana, script, DEFAULT_LOCALE))),
    {
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    },
  );
};
