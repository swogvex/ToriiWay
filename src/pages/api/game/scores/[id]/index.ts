import type { APIRoute } from 'astro';

import { gameDeps } from '../../../../../lib/server/context';
import { deleteScoreHandler } from '../../../../../lib/server/game-api';
import { handle, methodNotAllowed } from '../../../../../lib/server/http';

export const prerender = false;

export const DELETE: APIRoute = (context) =>
  handle(async () =>
    deleteScoreHandler(context.request, context.params.id ?? '', await gameDeps(context)),
  );

export const ALL: APIRoute = () => methodNotAllowed('DELETE');
