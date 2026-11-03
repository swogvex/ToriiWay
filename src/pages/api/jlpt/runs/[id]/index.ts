import type { APIRoute } from 'astro';

import { jlptDeps } from '../../../../../lib/server/context';
import { handle, methodNotAllowed } from '../../../../../lib/server/http';
import { getRunHandler } from '../../../../../lib/server/jlpt-api';

export const prerender = false;

export const GET: APIRoute = (context) =>
  handle(async () => getRunHandler(context.params.id ?? '', await jlptDeps(context)));

export const ALL: APIRoute = () => methodNotAllowed('GET');
