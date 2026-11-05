import type { APIRoute } from 'astro';

import { gameDeps } from '../../../../../lib/server/context';
import { reportScoreHandler } from '../../../../../lib/server/game-api';
import { handle, methodNotAllowed } from '../../../../../lib/server/http';

export const prerender = false;

export const POST: APIRoute = (context) =>
  handle(async () =>
    reportScoreHandler(context.request, context.params.id ?? '', await gameDeps(context)),
  );

export const ALL: APIRoute = () => methodNotAllowed('POST');
