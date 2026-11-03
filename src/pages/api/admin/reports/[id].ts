import type { APIRoute } from 'astro';

import { jlptDeps } from '../../../../lib/server/context';
import { assertSameOrigin, fail, handle, methodNotAllowed } from '../../../../lib/server/http';

export const prerender = false;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Marks a report as resolved (plain form post from /admin, same origin only). */
export const POST: APIRoute = (context) =>
  handle(async () => {
    const deps = await jlptDeps(context);
    assertSameOrigin(context.request, deps.site);
    const id = context.params.id ?? '';
    if (!UUID.test(id) || !(await deps.store.resolveReport(id))) return fail('not-found', 404);
    return context.redirect('/admin', 303);
  });

export const ALL: APIRoute = () => methodNotAllowed('POST');
