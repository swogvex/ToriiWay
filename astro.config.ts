import preact from '@astrojs/preact';
import sitemap from '@astrojs/sitemap';
import vercel from '@astrojs/vercel';
import { defineConfig } from 'astro/config';

import { pagefind } from './src/integrations/pagefind';

// Until the final domain exists, Vercel builds fall back to the project's production URL.
const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;
const site =
  process.env.PUBLIC_SITE_URL ?? (vercelUrl ? `https://${vercelUrl}` : 'http://localhost:4321');

export default defineConfig({
  site,
  trailingSlash: 'never',
  output: 'static',
  // Spanish pages live under /es (16-i18n); English has no prefix.
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'es'],
    routing: { prefixDefaultLocale: false },
  },
  adapter: vercel(),
  integrations: [
    preact(),
    sitemap({
      filter: (page) => {
        const { pathname } = new URL(page);
        // /learn duplicates /learn/hiragana (canonical), so only the canonical is listed.
        return !pathname.startsWith('/dev/') && pathname !== '/learn';
      },
    }),
    pagefind(),
  ],
  build: {
    format: 'file',
    // Keep CSS in external files so `style-src 'self'` works without inline hashes.
    inlineStylesheets: 'never',
  },
  // Astro inlines scripts smaller than this limit; keep every script external so
  // `script-src 'self'` needs no per-script hashes.
  vite: { build: { assetsInlineLimit: 0, cssCodeSplit: false } },
});
