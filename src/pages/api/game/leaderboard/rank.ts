import type { APIRoute } from 'astro';

import { gameDeps } from '../../../../lib/server/context';
import { rankHandler } from '../../../../lib/server/game-api';
import { handle, methodNotAllowed } from '../../../../lib/server/http';

export const prerender = false;

export const GET: APIRoute = (context) =>
  handle(async () => rankHandler(context.url, await gameDeps(context)));

export const ALL: APIRoute = () => methodNotAllowed('GET');
