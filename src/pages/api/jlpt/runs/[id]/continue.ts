import type { APIRoute } from 'astro';

import { jlptDeps } from '../../../../../lib/server/context';
import { handle, methodNotAllowed } from '../../../../../lib/server/http';
import { continueHandler } from '../../../../../lib/server/jlpt-api';

export const prerender = false;

export const POST: APIRoute = (context) =>
  handle(async () =>
    continueHandler(context.request, context.params.id ?? '', await jlptDeps(context)),
  );

export const ALL: APIRoute = () => methodNotAllowed('POST');
