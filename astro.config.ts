import preact from '@astrojs/preact';
import sitemap from '@astrojs/sitemap';
import vercel from '@astrojs/vercel';
import { defineConfig } from 'astro/config';

// Until the final domain exists, Vercel builds fall back to the project's production URL.
const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;
const site =
  process.env.PUBLIC_SITE_URL ?? (vercelUrl ? `https://${vercelUrl}` : 'http://localhost:4321');

export default defineConfig({
  site,
  trailingSlash: 'never',
  output: 'static',
  adapter: vercel(),
  integrations: [
    preact(),
    sitemap({ filter: (page) => !new URL(page).pathname.startsWith('/dev/') }),
  ],
  build: {
    format: 'file',
    // Keep CSS in external files so `style-src 'self'` works without inline hashes.
    inlineStylesheets: 'never',
  },
});
