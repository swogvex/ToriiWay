import type { APIRoute } from 'astro';

import { gameDeps } from '../../../../lib/server/context';
import { leaderboardHandler } from '../../../../lib/server/game-api';
import { handle, methodNotAllowed } from '../../../../lib/server/http';

export const prerender = false;

export const GET: APIRoute = (context) =>
  handle(async () => leaderboardHandler(context.url, await gameDeps(context)));

export const ALL: APIRoute = () => methodNotAllowed('GET');
