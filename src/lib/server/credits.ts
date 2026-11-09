import { CDN_CACHE, type DataSource } from '../dictionary/detail';
import { getDictionaryDetailStore } from './context';

/** Data versions for the credits page; sets its cache header. Empty when the database fails. */
export async function loadCreditSources(headers: Headers): Promise<DataSource[]> {
  try {
    const sources = await (await getDictionaryDetailStore()).dataSources();
    headers.set('Cache-Control', CDN_CACHE);
    return sources;
  } catch (error) {
    console.error('[credits] data sources', error);
    headers.set('Cache-Control', 'no-store');
    return [];
  }
}
