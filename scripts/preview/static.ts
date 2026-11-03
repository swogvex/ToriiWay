// Serves the prerendered pages in dist/client the way Vercel serves static files:
// clean URLs (/path → path/index.html), brotli or gzip, immutable /_astro assets and a
// real 404 page. Lighthouse CI uses it so its numbers match production; `astro preview`
// (Node adapter) sends uncompressed HTML. Usage: node scripts/preview/static.ts [port]

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { constants, createBrotliCompress, createGzip } from 'node:zlib';

const root = resolve('dist/client');
const port = Number(process.argv[2] ?? 4321);

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.webmanifest': 'application/manifest+json',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
};
const COMPRESSIBLE = new Set(['.html', '.css', '.js', '.mjs', '.json', '.svg', '.xml', '.txt']);

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

/** The file for a URL path, or null. Paths never leave dist/client. */
async function locate(pathname: string): Promise<string | null> {
  const clean = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, '');
  const base = join(root, clean);
  if (!base.startsWith(root)) return null;
  for (const candidate of [base, join(base, 'index.html'), `${base}.html`]) {
    if (await isFile(candidate)) return candidate;
  }
  return null;
}

createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    response.writeHead(308, { Location: url.pathname.slice(0, -1) + url.search }).end();
    return;
  }
  const found = await locate(url.pathname);
  const file = found ?? join(root, '404.html');
  const extension = extname(file);
  const accept = String(request.headers['accept-encoding'] ?? '');
  const encoding = !COMPRESSIBLE.has(extension)
    ? null
    : accept.includes('br')
      ? 'br'
      : accept.includes('gzip')
        ? 'gzip'
        : null;
  response.writeHead(found ? 200 : 404, {
    'Content-Type': TYPES[extension] ?? 'application/octet-stream',
    'Cache-Control': url.pathname.startsWith('/_astro/')
      ? 'public, max-age=31536000, immutable'
      : 'public, max-age=0, must-revalidate',
    ...(encoding ? { 'Content-Encoding': encoding, Vary: 'Accept-Encoding' } : {}),
  });
  const stream = createReadStream(file);
  if (encoding === 'br') {
    const brotli = createBrotliCompress({ params: { [constants.BROTLI_PARAM_QUALITY]: 5 } });
    stream.pipe(brotli).pipe(response);
  } else if (encoding === 'gzip') {
    stream.pipe(createGzip()).pipe(response);
  } else {
    stream.pipe(response);
  }
}).listen(port, () => console.log(`static preview on http://localhost:${port}`));
