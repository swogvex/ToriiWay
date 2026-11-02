/**
 * Copies the self-hosted UI and mono woff2 files from Fontsource into public/fonts/.
 * Run with `pnpm fonts:copy` after bumping a @fontsource package; commit the output.
 */
import { copyFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const FONTS = [
  { family: 'schibsted-grotesk', weights: [400, 500, 700] },
  { family: 'ibm-plex-mono', weights: [400, 500] },
] as const;

// latin covers English and Spanish; latin-ext adds the macrons used in rōmaji.
const SUBSETS = ['latin', 'latin-ext'] as const;

const OUT_DIR = join('public', 'fonts');

await mkdir(OUT_DIR, { recursive: true });
for (const { family, weights } of FONTS) {
  // OFL 1.1 asks for the license to travel with the font files.
  await copyFile(
    join('node_modules', '@fontsource', family, 'LICENSE'),
    join(OUT_DIR, `${family}-OFL.txt`),
  );
  for (const weight of weights) {
    for (const subset of SUBSETS) {
      const name = `${family}-${subset}-${weight}-normal.woff2`;
      await copyFile(
        join('node_modules', '@fontsource', family, 'files', name),
        join(OUT_DIR, name),
      );
      console.log(name);
    }
  }
}
