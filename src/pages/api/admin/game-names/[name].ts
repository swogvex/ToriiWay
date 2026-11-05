import type { APIRoute } from 'astro';

import { gameDeps } from '../../../../lib/server/context';
import { adminUnblockHandler } from '../../../../lib/server/game-api';
import { handle, methodNotAllowed } from '../../../../lib/server/http';

export const prerender = false;

/** Unblocks a leaderboard name (form post from /admin/leaderboard). */
export const POST: APIRoute = (context) =>
  handle(async () =>
    adminUnblockHandler(context.request, context.params.name ?? '', await gameDeps(context)),
  );

export const ALL: APIRoute = () => methodNotAllowed('POST');
