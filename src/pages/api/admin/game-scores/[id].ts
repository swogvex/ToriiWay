import type { APIRoute } from 'astro';

import { gameDeps } from '../../../../lib/server/context';
import { adminScoreHandler } from '../../../../lib/server/game-api';
import { handle, methodNotAllowed } from '../../../../lib/server/http';

export const prerender = false;

/** Hide / show / delete / block name (form post from /admin/leaderboard). */
export const POST: APIRoute = (context) =>
  handle(async () =>
    adminScoreHandler(context.request, context.params.id ?? '', await gameDeps(context)),
  );

export const ALL: APIRoute = () => methodNotAllowed('POST');
