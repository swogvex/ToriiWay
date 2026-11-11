/**
 * One page per template, in both languages, for the site-wide checks (CSP, axe, sideways
 * scroll). On-demand pages work without a database: e2e runs with the memory store and the
 * dictionary fixtures.
 */
const PAGES = [
  '/',
  '/learn/hiragana',
  '/learn/katakana',
  '/learn/kana/%E3%81%8B',
  '/learn/guide/what-is-hiragana',
  '/learn/kanji',
  '/learn/kanji/%E4%B8%80',
  '/learn/word/1160790',
  '/learn/search?q=ichi',
  '/game',
  '/game/play',
  '/game/leaderboard',
  '/jlpt',
  '/jlpt/run',
  '/library',
  '/library/kanji-para-recordar-1',
  '/community',
  '/credits',
  '/help/japanese-voice',
  '/privacy',
  '/legal',
  '/accessibility',
  '/terms',
  '/this-page-does-not-exist',
];

export const SITE_ROUTES = [
  ...PAGES,
  ...PAGES.map((path) => (path === '/' ? '/es' : `/es${path}`)),
];
