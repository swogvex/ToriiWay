import type { APIRoute } from 'astro';

import { jlptDeps } from '../../../lib/server/context';
import { handle, methodNotAllowed } from '../../../lib/server/http';
import { recentHandler } from '../../../lib/server/jlpt-api';

export const prerender = false;

export const GET: APIRoute = (context) =>
  handle(async () => recentHandler(await jlptDeps(context)));

export const ALL: APIRoute = () => methodNotAllowed('GET');
