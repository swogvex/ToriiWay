import type { APIRoute } from 'astro';

import { DEFAULT_LOCALE, localizePath } from '../i18n';
import { kanjiHref, wordHref } from '../lib/dictionary/client';
import { CDN_CACHE, KANJI_GROUPS, kanjiGroupHref } from '../lib/dictionary/detail';
import { getDictionaryDetailStore } from '../lib/server/context';

export const prerender = false;

/**
 * On-demand pages, which the static sitemap cannot list. Only kanji in a JLPT level or
 * school grade and common words: every crawled page wakes the database once, and the free
 * plan's compute hours would not cover all 219,000 entries.
 */
export const GET: APIRoute = async ({ site, url }) => {
  try {
    const { kanji, words } = await (await getDictionaryDetailStore()).sitemapEntries();
    const learn = localizePath('/learn', DEFAULT_LOCALE);
    const base = site ?? url;
    const paths = [
      `${learn}/kanji`,
      localizePath('/credits', DEFAULT_LOCALE),
      ...KANJI_GROUPS.map((group) => kanjiGroupHref(learn, group)),
      ...kanji.map((literal) => kanjiHref(learn, literal)),
      ...words.map((id) => wordHref(learn, id)),
    ];
    // Every path is built from encoded characters and digits, so none needs XML escaping.
    const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths
      .map((path) => `<url><loc>${new URL(path, base).href}</loc></url>`)
      .join('')}</urlset>\n`;
    return new Response(body, {
      headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': CDN_CACHE },
    });
  } catch (error) {
    console.error('[dictionary] sitemap', error);
    return new Response(null, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
};
