import type { PanelKana } from './data';

const cache = new Map<string, Promise<PanelKana[]>>();

/**
 * Panel data of a script (pages/data/kana/[script].json.ts), fetched once per page and
 * shared by the chart and practice, so neither needs the network again after load.
 */
export function loadKanaData(url: string): Promise<PanelKana[]> {
  let data = cache.get(url);
  if (!data) {
    data = fetch(url).then((response) => {
      if (!response.ok) throw new Error(`${url}: ${response.status}`);
      return response.json() as Promise<PanelKana[]>;
    });
    cache.set(url, data);
  }
  return data;
}
