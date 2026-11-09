import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { AstroIntegration } from 'astro';

const STYLESHEET = /<link[^>]+href="(\/_astro\/style\.[^"]+\.css)"[^>]*>/g;

/** The hrefs of the bundled stylesheets a page links. */
export function linkedSheets(html: string): string[] {
  return [...html.matchAll(STYLESHEET)].map((match) => match[1] ?? '');
}

/** Removes the links to every bundled stylesheet except `keep`. */
export function keepOnlySheet(html: string, keep: string): string {
  return html.replace(STYLESHEET, (tag, href: string) => (href === keep ? tag : ''));
}

async function htmlFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.html'))
    .map((entry) => join(entry.parentPath, entry.name));
}

/**
 * The build emits one stylesheet for static pages and another for on-demand ones, and links
 * both everywhere. The on-demand one repeats the shell's rules, and on a static page it is
 * only render-blocking weight, so static pages keep just the largest (their own).
 */
export function staticCss(): AstroIntegration {
  return {
    name: 'tw:static-css',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const outDir = fileURLToPath(dir);
        const files = await htmlFiles(outDir);
        // Not just the first file: public/ holds plain HTML too (Search Console verification).
        let sheets: string[] = [];
        for (const file of files) {
          sheets = linkedSheets(await readFile(file, 'utf8'));
          if (sheets.length >= 2) break;
        }
        if (sheets.length < 2) return;
        const sizes = await Promise.all(sheets.map((sheet) => stat(join(outDir, sheet))));
        const largest = Math.max(...sizes.map((size) => size.size));
        const keep = sheets[sizes.findIndex((size) => size.size === largest)];
        if (!keep) return;
        await Promise.all(
          files.map(async (file) => {
            const html = await readFile(file, 'utf8');
            await writeFile(file, keepOnlySheet(html, keep));
          }),
        );
        logger.info(`${files.length} static page(s) now link only ${keep}`);
      },
    },
  };
}
