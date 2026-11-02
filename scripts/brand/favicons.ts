/**
 * Renders the raster favicons from public/brand/favicon.svg with Playwright's Chromium:
 * public/favicon.ico (16/32/48, PNG-in-ICO) and public/apple-touch-icon.png (180).
 * Run with `pnpm brand:favicons` after changing the favicon SVG; commit the output.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const ICO_SIZES = [16, 32, 48];
const APPLE_SIZE = 180;
// iOS masks its own rounded corners, so the touch icon is full-bleed vermilion.
const APPLE_BACKGROUND = '#C8402E';

const svg = await readFile(join('public', 'brand', 'favicon.svg'));
const src = `data:image/svg+xml;base64,${svg.toString('base64')}`;

const browser = await chromium.launch();
const page = await browser.newPage();

async function render(size: number, background = 'transparent'): Promise<Buffer> {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<body style="margin:0;background:${background}"><img src="${src}" width="${size}" height="${size}" style="display:block"></body>`,
  );
  await page.locator('img').evaluate((img: HTMLImageElement) => img.decode());
  return page.screenshot({ omitBackground: background === 'transparent' });
}

function ico(images: { size: number; png: Buffer }[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const entries = images.map(({ size, png }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size, 0);
    entry.writeUInt8(size, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...images.map(({ png }) => png)]);
}

const icoImages = [];
for (const size of ICO_SIZES) icoImages.push({ size, png: await render(size) });
await writeFile(join('public', 'favicon.ico'), ico(icoImages));
await writeFile(join('public', 'apple-touch-icon.png'), await render(APPLE_SIZE, APPLE_BACKGROUND));
await browser.close();
console.log('favicon.ico, apple-touch-icon.png');
