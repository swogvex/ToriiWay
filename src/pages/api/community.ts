import type { APIRoute } from 'astro';

import { communityData } from '../../lib/community/data';
import { toPublic } from '../../lib/community/public';
import { handle, methodNotAllowed } from '../../lib/server/http';

export const prerender = false;

// Discord counts refresh every 10 minutes at the edge; the feed itself is cached 1 h in
// the function (source.ts), so a cache miss here rarely reaches YouTube.
const CACHE = 'public, max-age=0, s-maxage=600, stale-while-revalidate=3600';

export const GET: APIRoute = () =>
  handle(async () => {
    const body = JSON.stringify(toPublic(await communityData()));
    return new Response(body, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': CACHE,
        'X-Robots-Tag': 'noindex, nofollow',
      },
    });
  });

export const ALL: APIRoute = () => methodNotAllowed('GET');
