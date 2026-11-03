import type { APIRoute } from 'astro';

import { jlptDeps } from '../../../../../lib/server/context';
import { handle, methodNotAllowed } from '../../../../../lib/server/http';
import { emailHandler } from '../../../../../lib/server/email-api';

export const prerender = false;

export const POST: APIRoute = (context) =>
  handle(async () =>
    emailHandler(context.request, context.params.id ?? '', await jlptDeps(context)),
  );

export const ALL: APIRoute = () => methodNotAllowed('POST');
