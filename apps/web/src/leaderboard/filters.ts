/**
 * Filtry rankingu: zakres dni w strefie klubu i zestaw gier. Każdy jest opcjonalny,
 * a razem się łączą; brak filtrów = cała historia i wszystkie gry. Bez zależności, bo filtry
 * są też częścią adresu popupu rankingu (`leaderboard/points/from:2026-01-01/to:2026-03-31/games:<uuid>,<uuid>`).
 */
export interface LeaderboardFilters {
  /** Pierwszy dzień `RRRR-MM-DD` (włącznie); `null` = od początku historii. */
  readonly from: string | null;
  /** Ostatni dzień `RRRR-MM-DD` (włącznie); `null` = do dziś i dalej. */
  readonly to: string | null;
  /** Identyfikatory gier posortowane rosnąco; pusta lista = wszystkie gry. */
  readonly games: readonly string[];
}

export const NO_FILTERS: LeaderboardFilters = { from: null, to: null, games: [] };

export function hasDateFilter(filters: LeaderboardFilters): boolean {
  return filters.from !== null || filters.to !== null;
}

export function hasFilters(filters: LeaderboardFilters): boolean {
  return hasDateFilter(filters) || filters.games.length > 0;
}

/** Lista gier bez powtórzeń, małymi literami i rosnąco (ten sam filtr = ten sam klucz i adres). */
export function normalizeGames(games: readonly string[]): readonly string[] {
  return [...new Set(games.map((id) => id.toLowerCase()))].sort();
}

/** Zakres z kalendarza: jeden wybrany dzień to zakres jednego dnia; dni w złej kolejności są zamieniane. */
export function withDates(
  filters: LeaderboardFilters,
  start: string | null,
  end: string | null,
): LeaderboardFilters {
  if (start === null) return { ...filters, from: null, to: null };
  const last = end ?? start;
  return last < start
    ? { ...filters, from: last, to: start }
    : { ...filters, from: start, to: last };
}

export function withGames(
  filters: LeaderboardFilters,
  games: readonly string[],
): LeaderboardFilters {
  return { ...filters, games: normalizeGames(games) };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

/** Segmenty adresu filtrów (po zakładce); bez filtrów brak segmentów. */
export function filterSegments(filters: LeaderboardFilters): string[] {
  const segments: string[] = [];
  if (filters.from) segments.push(`from:${filters.from}`);
  if (filters.to) segments.push(`to:${filters.to}`);
  if (filters.games.length > 0) segments.push(`games:${filters.games.join(',')}`);
  return segments;
}

/** Filtry z segmentów adresu; `null` = segment nieznany, powtórzony albo z błędną wartością. */
export function parseFilterSegments(segments: readonly string[]): LeaderboardFilters | null {
  let from: string | null = null;
  let to: string | null = null;
  let games: readonly string[] | null = null;
  for (const segment of segments) {
    const split = segment.indexOf(':');
    if (split < 0) return null;
    const key = segment.slice(0, split);
    const value = segment.slice(split + 1);
    if (key === 'from' && from === null && isIsoDate(value)) from = value;
    else if (key === 'to' && to === null && isIsoDate(value)) to = value;
    else if (key === 'games' && games === null) {
      const ids = value.split(',');
      if (ids.length === 0 || !ids.every((id) => UUID.test(id))) return null;
      games = normalizeGames(ids);
    } else return null;
  }
  if (from !== null && to !== null && from > to) return null;
  return { from, to, games: games ?? [] };
}
