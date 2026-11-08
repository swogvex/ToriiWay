import type { APIRoute } from 'astro';

import { dictionaryDeps } from '../../../lib/server/context';
import { dictionarySearchHandler } from '../../../lib/server/dictionary-api';
import { handle, methodNotAllowed } from '../../../lib/server/http';

export const prerender = false;

export const GET: APIRoute = (context) =>
  handle(async () => dictionarySearchHandler(context.url, await dictionaryDeps(context)));

export const ALL: APIRoute = () => methodNotAllowed('GET');
