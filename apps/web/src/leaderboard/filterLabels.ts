import { useAuth } from '../auth/authContext';
import { useGameSearch } from '../games/games';
import { format, plural, t } from '../i18n';
import type { LeaderboardFilters } from './filters';

const dayFormat = new Intl.DateTimeFormat('pl-PL', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/** „12 mar 2026” dnia `RRRR-MM-DD`. */
export function shortDay(date: string): string {
  return dayFormat
    .format(new Date(`${date}T00:00:00Z`))
    .replace(/\.(?=\s|$)/g, '')
    .replace(/\s*r$/, '');
}

/** Opis zakresu dat: „Cała historia”, jeden dzień, „od …”, „do …” albo „… – …”. */
export function datesValue(filters: LeaderboardFilters): string {
  const text = t.leaderboard.filters;
  const { from, to } = filters;
  if (from && to)
    return from === to
      ? shortDay(from)
      : format(text.range, { from: shortDay(from), to: shortDay(to) });
  if (from) return format(text.from, { date: shortDay(from) });
  if (to) return format(text.to, { date: shortDay(to) });
  return text.datesAll;
}

/** Opis wyboru gier: „Wszystkie gry”, tytuł jednej gry albo „3 gry”. */
export function gamesValue(
  filters: LeaderboardFilters,
  titles: ReadonlyMap<string, string>,
): string {
  const text = t.leaderboard.filters;
  if (filters.games.length === 0) return text.gamesAll;
  if (filters.games.length === 1) return titles.get(filters.games[0] ?? '') ?? text.unknownGame;
  return plural(filters.games.length, text.gamesCount);
}

/**
 * Tytuły gier z kolekcji do opisów filtrów. Kolekcję pobieramy dopiero, gdy jest potrzebna
 * (wybrane gry albo otwarty panel), a nie przy każdym wyświetleniu rankingu.
 */
export function useGameTitles(enabled: boolean) {
  const { client } = useAuth();
  const games = useGameSearch(client, '', enabled);
  const titles = new Map((games.data ?? []).map((game) => [game.id, game.title] as const));
  return { games, titles };
}
