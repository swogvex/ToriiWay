import type { APIRoute, GetStaticPaths } from 'astro';

import { LOCALES, type Locale } from '../../../i18n';
import { getKana, kanaDataUrl, panelKana, SCRIPTS, type Script } from '../../../lib/kana/data';

/**
 * Detail panel data for every kana of a script, prerendered per locale to
 * /data/kana/<script>.json and /data/kana/es/<script>.json (the mnemonics differ).
 * The chart fetches it after load instead of inlining it, which keeps the page HTML small.
 */
export const getStaticPaths = (() =>
  LOCALES.flatMap((locale) =>
    SCRIPTS.map((script) => ({
      params: { file: kanaDataUrl(script, locale).slice('/data/kana/'.length, -'.json'.length) },
      props: { script, locale },
    })),
  )) satisfies GetStaticPaths;

interface Props {
  script: Script;
  locale: Locale;
}

export const GET: APIRoute<Props> = async ({ props }) => {
  const items = await getKana(props.script);
  return new Response(
    JSON.stringify(items.map((kana) => panelKana(kana, props.script, props.locale))),
    { headers: { 'Content-Type': 'application/json; charset=utf-8' } },
  );
};
