import type { Game } from '../games/games';
import { t } from '../i18n';
import { normalizeSearch } from '../ui/search';

export interface GameOption {
  readonly id: string;
  readonly title: string;
  readonly cover_path: string | null;
}

/**
 * Opcje listy: pasujące do wpisanego tekstu (bez polskich znaków, `normalizeSearch`), przy
 * pustym tekście najpierw wybrane. Wybrane gry spoza kolekcji (usunięte) też są na liście.
 */
export function gameOptions(
  games: readonly Pick<Game, 'id' | 'title' | 'cover_path'>[],
  selected: readonly string[],
  query: string,
): GameOption[] {
  const known = new Set(games.map((game) => game.id));
  const all: GameOption[] = [
    ...games.map((game) => ({ id: game.id, title: game.title, cover_path: game.cover_path })),
    ...selected
      .filter((id) => !known.has(id))
      .map((id) => ({ id, title: t.leaderboard.filters.unknownGame, cover_path: null })),
  ];
  const needle = normalizeSearch(query);
  if (needle !== '') return all.filter((option) => normalizeSearch(option.title).includes(needle));
  const chosen = new Set(selected);
  return [...all.filter((o) => chosen.has(o.id)), ...all.filter((o) => !chosen.has(o.id))];
}
