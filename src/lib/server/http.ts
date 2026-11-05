// Shared helpers for API routes: typed JSON responses, body validation and request checks.

import type { z } from 'astro/zod';

/** Error codes sent to the client. Details stay in the server logs. */
export type ErrorCode =
  | 'bad-request'
  | 'forbidden'
  | 'not-found'
  | 'gone'
  | 'method-not-allowed'
  | 'conflict'
  | 'too-many-requests'
  | 'unavailable'
  | 'server-error';

const BASE_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
};

/** Largest JSON body accepted by any route. */
export const MAX_BODY_BYTES = 32 * 1024;

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: BASE_HEADERS });
}

export function fail(code: ErrorCode, status: number, detail?: string): Response {
  if (detail) console.warn(`[api] ${code}: ${detail}`);
  return json({ error: code }, status);
}

export const methodNotAllowed = (allow: string) =>
  new Response(JSON.stringify({ error: 'method-not-allowed' }), {
    status: 405,
    headers: { ...BASE_HEADERS, Allow: allow },
  });

/** Thrown inside a handler to answer with an error code; see `handle`. */
export class HttpError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly status: number,
    readonly detail?: string,
  ) {
    super(code);
  }
}

/** Rejects cross-site browser requests: the Origin header, when present, must be ours. */
export function assertSameOrigin(request: Request, site: URL): void {
  const origin = request.headers.get('origin');
  if (origin !== null && origin !== site.origin && origin !== new URL(request.url).origin) {
    throw new HttpError('forbidden', 403, `origin ${origin}`);
  }
}

/** Parses a JSON body against a strict schema. */
export async function readJson<T extends z.ZodType>(
  request: Request,
  schema: T,
  maxBytes = MAX_BODY_BYTES,
): Promise<z.infer<T>> {
  const type = request.headers.get('content-type') ?? '';
  if (!type.toLowerCase().startsWith('application/json')) {
    throw new HttpError('bad-request', 415, 'content type');
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).length > maxBytes) {
    throw new HttpError('bad-request', 413, 'body too large');
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new HttpError('bad-request', 400, 'invalid JSON');
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new HttpError('bad-request', 400, parsed.error.message);
  return parsed.data;
}

/** Runs a handler and turns thrown errors into generic JSON errors. */
export async function handle(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof HttpError) return fail(error.code, error.status, error.detail);
    console.error('[api] unexpected error', error);
    return fail('server-error', 500);
  }
}

/** SHA-256 of the IP with a secret salt, so stored keys cannot be mapped back to people. */
export async function hashIp(ip: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest).slice(0, 16)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
