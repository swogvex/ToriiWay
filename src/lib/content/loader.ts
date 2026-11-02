import { globSync } from 'node:fs';

import { glob } from 'astro/loaders';
import type { Loader } from 'astro/loaders';

/**
 * Astro's glob loader, but silent while a collection has no files yet.
 * Restart the dev server after adding the first file to a collection.
 */
export function contentGlob(pattern: string, base: string): Loader {
  const loader = glob({ pattern, base });
  return {
    name: 'content-glob',
    load: async (context) => {
      if (globSync(pattern, { cwd: base }).length === 0) {
        context.store.clear();
        return;
      }
      await loader.load(context);
    },
  };
}
