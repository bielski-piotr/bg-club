import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeGames, type LeaderboardFilters } from '../leaderboard/filters';
import { isUuid } from '../popups/routes';
import { profilesKey } from './profileQueries';

/**
 * Statystyki gracza w profilu z funkcji SQL
 * `player_stats(profile_id, date_from, date_to, game_ids)` (migracja
 * `20261127000100_profile_view.sql`). Baza liczy wszystko z zapisanych
 * partii (szkice się nie liczą), więc zapis i usunięcie partii zmieniają je od razu.
 *
 * Two groups: filtered like the leaderboard (`meetings`, `plays`, `wins`) and the whole history
 * (places, points, wins, streaks, favorite and best game).
 */

/** Gra w statystykach gracza: ulubiona (najwięcej partii) albo najlepsza (najwięcej wygranych). */
export interface PlayerGame {
  readonly game_id: string;
  readonly title: string;
  readonly cover_path: string | null;
  readonly plays: number;
  readonly wins: number;
}

/** Miejsca w dwóch rankingach; `null` = gracz nie jest klasyfikowany (albo usunięty). */
export interface PlayerPlaces {
  readonly points: number | null;
  readonly wins: number | null;
}

export interface PlayerStats {
  /** Z filtrami: spotkania z ≥ 1 partią gracza. */
  readonly meetings: number;
  /** Z filtrami. */
  readonly plays: number;
  /** Z filtrami (także wspólne 1. miejsce). */
  readonly wins: number;
  /** Cała historia: punkty rankingu. */
  readonly points: number;
  /** Cała historia: wszystkie wygrane. */
  readonly wins_total: number;
  readonly streak_record: number;
  readonly streak_current: number;
  /** Cała historia. */
  readonly places: PlayerPlaces;
  /** Cała historia; `null` = brak partii. */
  readonly favorite_game: PlayerGame | null;
  /** Cała historia; `null` = brak wygranej. */
  readonly best_game: PlayerGame | null;
}

/** Argumenty filtrów RPC: brak filtru to `null` (pusta lista gier też), jak w rankingu. */
export function filterArgs(filters: LeaderboardFilters) {
  return {
    date_from: filters.from,
    date_to: filters.to,
    game_ids: filters.games.length > 0 ? normalizeGames(filters.games) : null,
  };
}

/** Część klucza z filtrami: ten sam filtr = ten sam klucz. */
export const filtersKey = (filters: LeaderboardFilters) =>
  [filters.from ?? '', filters.to ?? '', normalizeGames(filters.games).join(',')] as const;

/**
 * Klucz w `profilesKey`: zapis i usunięcie partii odświeżają statystyki razem z profilami
 * (`PLAY_DEPENDENT_KEYS`).
 */
export const playerStatsKey = (id: string, filters: LeaderboardFilters) =>
  [...profilesKey, 'stats', id, ...filtersKey(filters)] as const;

/** Statystyki gracza z filtrami (opcje zapytania); `null` w danych = nie ma profilu. */
export function playerStatsQuery(client: SupabaseClient, id: string, filters: LeaderboardFilters) {
  return {
    queryKey: playerStatsKey(id, filters),
    queryFn: async (): Promise<PlayerStats | null> => {
      if (!isUuid(id)) return null;
      const { data, error } = await client.rpc('player_stats', {
        profile_id: id,
        ...filterArgs(filters),
      });
      if (error) throw error;
      return (data ?? null) as PlayerStats | null;
    },
    // Przy zmianie filtrów poprzedni wynik zostaje do czasu nowego (bez migania), jak w rankingu.
    placeholderData: (
      previous: PlayerStats | null | undefined,
      query: { readonly queryKey: readonly unknown[] } | undefined,
    ) => (query?.queryKey[2] === id ? previous : undefined),
  };
}

/** Procent wygranych zaokrąglony do całości; `null` bez partii. */
export function winRate(wins: number, plays: number): number | null {
  return plays > 0 ? Math.round((wins * 100) / plays) : null;
}
