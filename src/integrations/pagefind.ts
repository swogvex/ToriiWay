import { fileURLToPath } from 'node:url';

import type { AstroIntegration } from 'astro';
import { close, createIndex } from 'pagefind';

/**
 * Builds the Pagefind index over the generated HTML (03-architecture: search). Only pages
 * that mark their content with `data-pagefind-body` are indexed (BaseLayout does it for
 * every indexable page). It runs before the Vercel adapter copies the output, so the
 * index ships to production and to `astro preview` alike.
 */
export function pagefind(): AstroIntegration {
  return {
    name: 'tw:pagefind',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const outDir = fileURLToPath(dir);
        const { index, errors } = await createIndex();
        if (!index) throw new Error(`Pagefind: ${errors.join('; ')}`);

        const added = await index.addDirectory({ path: outDir });
        if (added.errors.length > 0) throw new Error(`Pagefind: ${added.errors.join('; ')}`);

        const written = await index.writeFiles({ outputPath: `${outDir}/pagefind` });
        if (written.errors.length > 0) throw new Error(`Pagefind: ${written.errors.join('; ')}`);

        await close();
        logger.info(`Indexed ${added.page_count} page(s) into /pagefind`);
      },
    },
  };
}
