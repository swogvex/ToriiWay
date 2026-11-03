import type { APIRoute, GetStaticPaths } from 'astro';

import { DIFFICULTIES, GAME_SCRIPTS } from '../../../../game/config';
import { getGameItems } from '../../../../lib/game/items';

/**
 * Bubble items per script and difficulty, prerendered to /data/game/<script>/<difficulty>.json.
 * The play page fetches only the list it needs; lists that do not exist yet have no file.
 */
export const getStaticPaths = (async () => {
  const paths = await Promise.all(
    GAME_SCRIPTS.flatMap((script) =>
      DIFFICULTIES.map(async (difficulty) => {
        const items = await getGameItems(script, difficulty);
        return { params: { script, difficulty }, props: { items } };
      }),
    ),
  );
  return paths.filter((path) => path.props.items.length > 0);
}) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) =>
  new Response(JSON.stringify(props.items), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
