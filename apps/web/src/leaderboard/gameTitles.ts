import { createMemo, type Accessor } from 'solid-js';
import { createGameSearch } from '../games/gameData';

/**
 * Tytuły gier z kolekcji do opisów filtrów. Kolekcję pobieramy dopiero, gdy jest potrzebna
 * (wybrane gry albo otwarty panel), a nie przy każdym wyświetleniu rankingu.
 */
export function createGameTitles(enabled: Accessor<boolean>) {
  const games = createGameSearch(() => '', enabled);
  const titles = createMemo(
    () => new Map((games().data ?? []).map((game) => [game.id, game.title] as const)),
  );
  return { games, titles };
}
