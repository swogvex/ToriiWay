import type { APIRoute } from 'astro';

import { gameDeps } from '../../../lib/server/context';
import { createRunHandler } from '../../../lib/server/game-api';
import { handle, methodNotAllowed } from '../../../lib/server/http';

export const prerender = false;

export const POST: APIRoute = (context) =>
  handle(async () => createRunHandler(context.request, await gameDeps(context)));

export const ALL: APIRoute = () => methodNotAllowed('POST');
