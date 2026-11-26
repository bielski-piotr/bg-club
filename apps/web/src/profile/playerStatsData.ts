import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeGames, type LeaderboardFilters } from '../leaderboard/filters';
import { isUuid } from '../popups/routes';
import { profilesKey } from './profileQueries';

/**
 * Statystyki gracza w profilu (PRD STAT-1–STAT-3) z funkcji SQL
 * `player_stats(profile_id, date_from, date_to, game_ids)` (migracja
 * `20261113001800_game_stats.sql`). Baza liczy wszystko z zapisanych
 * partii (szkice się nie liczą), więc zapis i usunięcie partii zmieniają je od razu (§5.6.5).
 *
 * Trzy grupy: statystyki profilu z filtrami jak w rankingu (`meetings`, `plays`, `wins`),
 * ranking z całej historii (miejsca, punkty, wygrane, serie) i ulubione gry z całej historii;
 * do tego 5 ostatnich spotkań gracza.
 */

/** Gra w statystykach gracza: ulubiona albo najlepsza (STAT-2, Q21). */
export interface PlayerGame {
  readonly game_id: string;
  readonly title: string;
  readonly cover_path: string | null;
  readonly plays: number;
  readonly wins: number;
}

/** Spotkanie z partiami gracza na liście ostatnich (od najnowszego, §5.6.6). */
export interface RecentMeeting {
  readonly meeting_id: string;
  readonly title: string;
  /** Termin spotkania. */
  readonly starts_at: string;
  readonly plays: number;
  readonly wins: number;
  readonly points: number;
}

/** Miejsca w dwóch rankingach (LB-1); `null` = gracz nie jest klasyfikowany (albo usunięty). */
export interface PlayerPlaces {
  readonly points: number | null;
  readonly wins: number | null;
}

export interface PlayerStats {
  /** Z filtrami: spotkania z ≥ 1 partią gracza. */
  readonly meetings: number;
  /** Z filtrami. */
  readonly plays: number;
  /** Z filtrami (także wspólne 1. miejsce, §5.6.3). */
  readonly wins: number;
  /** Cała historia: punkty rankingu (§5.6.2). */
  readonly points: number;
  /** Cała historia: wszystkie wygrane. */
  readonly wins_total: number;
  readonly streak_record: number;
  readonly streak_current: number;
  /** Cała historia. */
  readonly places: PlayerPlaces;
  readonly favorite_game: PlayerGame | null;
  /** `null` = brak gry z ≥ 3 partiami gracza (pusty stan, Q21). */
  readonly best_game: PlayerGame | null;
  /** Najwyżej 5 ostatnich spotkań z partiami gracza (bez filtrów). */
  readonly recent_meetings: readonly RecentMeeting[];
}

/** Próg partii gry do „najlepszej gry” (Q21). Baza stosuje ten sam próg. */
export const BEST_GAME_MIN_PLAYS = 3;

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
 * (`PLAY_DEPENDENT_KEYS`, §5.6.5).
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
