import type { APIRoute } from 'astro';

import { counterDeps } from '../../lib/server/context';
import { counterHandler } from '../../lib/server/counters';
import { handle, methodNotAllowed } from '../../lib/server/http';

export const prerender = false;

/** Anonymous library click counter (sendBeacon from the book pages). */
export const POST: APIRoute = (context) =>
  handle(async () => counterHandler(context.request, await counterDeps(context)));

export const ALL: APIRoute = () => methodNotAllowed('POST');
