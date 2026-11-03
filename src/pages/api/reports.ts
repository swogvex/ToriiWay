import type { APIRoute } from 'astro';

import { jlptDeps } from '../../lib/server/context';
import { handle, methodNotAllowed } from '../../lib/server/http';
import { reportHandler } from '../../lib/server/reports-api';

export const prerender = false;

export const POST: APIRoute = (context) =>
  handle(async () => reportHandler(context.request, await jlptDeps(context)));

export const ALL: APIRoute = () => methodNotAllowed('POST');
