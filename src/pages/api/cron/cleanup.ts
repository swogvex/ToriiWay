import type { APIRoute } from 'astro';
import { CRON_SECRET } from 'astro:env/server';

import { gameDeps, jlptDeps } from '../../../lib/server/context';
import { cleanupHandler } from '../../../lib/server/email-api';
import { gameCleanup } from '../../../lib/server/game-api';
import { handle, methodNotAllowed } from '../../../lib/server/http';

export const prerender = false;

export const GET: APIRoute = (context) =>
  handle(async () =>
    cleanupHandler(context.request, await jlptDeps(context), CRON_SECRET, async () => {
      const { runs } = await gameCleanup(await gameDeps(context));
      return { gameRuns: runs };
    }),
  );

export const ALL: APIRoute = () => methodNotAllowed('GET');
