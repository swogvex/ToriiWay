import type { APIRoute } from 'astro';
import { CRON_SECRET } from 'astro:env/server';

import { jlptDeps } from '../../../lib/server/context';
import { cleanupHandler } from '../../../lib/server/email-api';
import { handle, methodNotAllowed } from '../../../lib/server/http';

export const prerender = false;

export const GET: APIRoute = (context) =>
  handle(async () => cleanupHandler(context.request, await jlptDeps(context), CRON_SECRET));

export const ALL: APIRoute = () => methodNotAllowed('GET');
