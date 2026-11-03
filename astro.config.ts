import node from '@astrojs/node';
import preact from '@astrojs/preact';
import sitemap from '@astrojs/sitemap';
import vercel from '@astrojs/vercel';
import { defineConfig, envField } from 'astro/config';

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
  // Vercel builds set VERCEL=1. Everywhere else (CI, local) the Node adapter keeps
  // `astro preview` working for e2e and Lighthouse, which the Vercel adapter cannot serve.
  adapter: process.env.VERCEL ? vercel() : node({ mode: 'standalone' }),
  // Server secrets are read at runtime on Vercel; all are optional so static pages build without them.
  env: {
    schema: {
      DATABASE_URL: envField.string({ context: 'server', access: 'secret', optional: true }),
      IP_HASH_SALT: envField.string({ context: 'server', access: 'secret', optional: true }),
      TURNSTILE_SECRET_KEY: envField.string({
        context: 'server',
        access: 'secret',
        optional: true,
      }),
      ADMIN_USER: envField.string({ context: 'server', access: 'secret', optional: true }),
      ADMIN_PASSWORD_HASH: envField.string({ context: 'server', access: 'secret', optional: true }),
      /** e2e and local previews: keep JLPT runs in memory instead of Postgres. */
      JLPT_MEMORY_STORE: envField.boolean({ context: 'server', access: 'secret', default: false }),
    },
  },
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
    // Both adapters serve /path from path/index.html (Vercel forces this format anyway).
    format: 'directory',
    // Keep CSS in external files so `style-src 'self'` works without inline hashes.
    inlineStylesheets: 'never',
  },
  // Astro inlines scripts smaller than this limit; keep every script external so
  // `script-src 'self'` needs no per-script hashes.
  vite: {
    build: { assetsInlineLimit: 0, cssCodeSplit: false },
    // resvg loads a native binary per platform: keep it out of the bundle so the adapter
    // copies the right package into the function.
    ssr: { external: ['@resvg/resvg-js'] },
  },
});
