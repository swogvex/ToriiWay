import type { APIRoute } from 'astro';

import { jlptDeps } from '../../../../lib/server/context';
import { handle, methodNotAllowed } from '../../../../lib/server/http';
import { createRunHandler } from '../../../../lib/server/jlpt-api';

export const prerender = false;

export const POST: APIRoute = (context) =>
  handle(async () => createRunHandler(context.request, await jlptDeps(context)));

export const ALL: APIRoute = () => methodNotAllowed('POST');
