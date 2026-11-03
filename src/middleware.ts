import { defineMiddleware } from 'astro:middleware';
import { ADMIN_PASSWORD_HASH, ADMIN_USER } from 'astro:env/server';

import { ADMIN_HEADERS, adminDenied, checkAdmin } from './lib/server/admin';
import { jlptDeps } from './lib/server/context';

const isAdmin = (path: string) =>
  path === '/admin' || path.startsWith('/admin/') || path.startsWith('/api/admin/');

/** Basic auth in front of the admin page and its API; every other route passes through. */
export const onRequest = defineMiddleware(async (context, next) => {
  if (!isAdmin(context.url.pathname)) return next();
  const deps = await jlptDeps(context);
  const check = await checkAdmin(
    context.request,
    { user: ADMIN_USER, passwordHash: ADMIN_PASSWORD_HASH },
    deps.store,
    await deps.clientKey(),
    deps.now(),
  );
  if (check !== 'ok') return adminDenied(check);
  const response = await next();
  for (const [name, value] of Object.entries(ADMIN_HEADERS)) response.headers.set(name, value);
  return response;
});
