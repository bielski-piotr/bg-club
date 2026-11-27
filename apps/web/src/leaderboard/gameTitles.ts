import { createMemo, useContext, type Accessor } from 'solid-js';
import { AuthContext } from '../auth/authContext';
import { COVERS_BUCKET } from '../club/club';
import { createGameSearch } from '../games/gameData';
import { gameSearchQuery } from '../games/games';
import { QueryClientContext } from '../lib/queryClient';
import { prefetchSignedUrls } from '../lib/storage';

/** How many covers from the top of the game list are downloaded before the panel opens. */
const PRELOADED_COVERS = 8;

/**
 * Tytuły gier z kolekcji do opisów filtrów. Kolekcję pobieramy dopiero, gdy jest potrzebna
 * (wybrane gry albo otwarty panel), a nie przy każdym wyświetleniu rankingu. Opisy nie czekają
 * na dane: do czasu wczytania (`.current()`) mapa jest pusta.
 */
export function createGameTitles(enabled: Accessor<boolean>) {
  const games = createGameSearch(() => '', enabled);
  const titles = createMemo(
    () => new Map((games.current() ?? []).map((game) => [game.id, game.title] as const)),
  );
  return { games, titles };
}

/**
 * Prefetch of the game filter panel, called when the user is about to open it (hover, focus,
 * touch): the collection, its cover URLs signed in one request and the first covers downloaded,
 * so the panel opens with the list and images in place instead of filling in.
 */
export function createGamesPrefetch() {
  const auth = useContext(AuthContext);
  const queryClient = useContext(QueryClientContext);
  let started = false;
  return () => {
    if (started) return;
    started = true;
    void queryClient
      .fetchQuery(gameSearchQuery(auth.client, ''))
      .then((games) =>
        prefetchSignedUrls(
          auth.client,
          queryClient,
          COVERS_BUCKET,
          games.map((game) => game.cover_path),
        ).then((urls) => {
          for (const game of games.slice(0, PRELOADED_COVERS)) {
            const url = game.cover_path ? urls.get(game.cover_path) : undefined;
            if (url) new Image().src = url;
          }
        }),
      )
      .catch(() => {
        // The panel loads the list itself and shows its own error.
        started = false;
      });
  };
}
