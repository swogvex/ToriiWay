import {
  CDN_CACHE,
  isKanjiGroup,
  isKanjiParam,
  isWordParam,
  type KanjiDetail,
  type KanjiGroup,
  type WordDetail,
} from '../dictionary/detail';
import { getDictionaryDetailStore } from './context';

/**
 * Loaders for the on-demand dictionary pages. They run in the page itself, the only
 * place where the response status and headers can still be set.
 */

export type DetailView = 'ok' | 'missing' | 'unavailable';
type PageResponse = { status?: number; readonly headers: Headers };

const STATUS: Record<DetailView, number> = { ok: 200, missing: 404, unavailable: 503 };

function finish(response: PageResponse, view: DetailView): void {
  response.status = STATUS[view];
  response.headers.set('Cache-Control', view === 'ok' ? CDN_CACHE : 'no-store');
}

export async function loadKanji(
  char: string | undefined,
  response: PageResponse,
): Promise<{ kanji: KanjiDetail | null; view: DetailView }> {
  let kanji: KanjiDetail | null = null;
  let view: DetailView = 'missing';
  if (isKanjiParam(char)) {
    try {
      kanji = await (await getDictionaryDetailStore()).getKanji(char);
      view = kanji ? 'ok' : 'missing';
    } catch (error) {
      console.error('[dictionary] kanji page', error);
      view = 'unavailable';
    }
  }
  finish(response, view);
  return { kanji, view };
}

export async function loadWord(
  id: string | undefined,
  response: PageResponse,
): Promise<{ word: WordDetail | null; view: DetailView }> {
  let word: WordDetail | null = null;
  let view: DetailView = 'missing';
  if (isWordParam(id)) {
    try {
      word = await (await getDictionaryDetailStore()).getWord(Number(id));
      view = word ? 'ok' : 'missing';
    } catch (error) {
      console.error('[dictionary] word page', error);
      view = 'unavailable';
    }
  }
  finish(response, view);
  return { word, view };
}

export async function loadKanjiGroup(
  param: string | undefined,
  response: PageResponse,
): Promise<{ group: KanjiGroup | undefined; literals: string[]; view: DetailView }> {
  const group = isKanjiGroup(param) ? param : undefined;
  let literals: string[] = [];
  let view: DetailView = group ? 'ok' : 'missing';
  if (group) {
    try {
      literals = await (await getDictionaryDetailStore()).kanjiByGroup(group);
    } catch (error) {
      console.error('[dictionary] kanji index', error);
      view = 'unavailable';
    }
  }
  finish(response, view);
  return { group, literals, view };
}
