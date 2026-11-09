// What the credits page lists besides the imported dictionary data.

export interface Credit {
  name: string;
  license: string;
  url: string;
}

export const FONTS_AND_ICONS: readonly Credit[] = [
  {
    name: 'Schibsted Grotesk',
    license: 'SIL OFL 1.1',
    url: 'https://fonts.google.com/specimen/Schibsted+Grotesk',
  },
  {
    name: 'Zen Kaku Gothic New',
    license: 'SIL OFL 1.1',
    url: 'https://fonts.google.com/specimen/Zen+Kaku+Gothic+New',
  },
  {
    name: 'IBM Plex Mono',
    license: 'SIL OFL 1.1',
    url: 'https://fonts.google.com/specimen/IBM+Plex+Mono',
  },
  { name: 'Lucide', license: 'ISC', url: 'https://lucide.dev' },
];

export const LIBRARIES: readonly Credit[] = [
  { name: 'Astro', license: 'MIT', url: 'https://astro.build' },
  { name: 'Preact', license: 'MIT', url: 'https://preactjs.com' },
  { name: 'WanaKana', license: 'MIT', url: 'https://wanakana.com' },
  { name: 'cuelume', license: 'MIT', url: 'https://www.npmjs.com/package/cuelume' },
  { name: 'Drizzle ORM', license: 'Apache-2.0', url: 'https://orm.drizzle.team' },
  { name: 'Neon serverless', license: 'MIT', url: 'https://github.com/neondatabase/serverless' },
  { name: 'Pagefind', license: 'MIT', url: 'https://pagefind.app' },
  { name: 'Satori', license: 'MPL-2.0', url: 'https://github.com/vercel/satori' },
  { name: 'resvg-js', license: 'MPL-2.0', url: 'https://github.com/thx/resvg-js' },
];
