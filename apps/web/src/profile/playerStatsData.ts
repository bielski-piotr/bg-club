import type { SupabaseClient } from '@supabase/supabase-js';
import { useQuery } from '@tanstack/react-query';
import { isUuid } from '../popups/routes';
import { profilesKey } from './profiles';

/**
 * Statystyki gracza w profilu z funkcji SQL `player_stats(profile_id, year)`
 * (migracja `20261115223700_player_stats.sql`). Baza liczy wszystko z zapisanych partii (szkice
 * się nie liczą), więc zapis i usunięcie partii zmieniają je od razu.
 */

/** Gra w statystykach gracza: ulubiona albo najlepsza. */
export interface PlayerGame {
  readonly game_id: string;
  readonly title: string;
  readonly plays: number;
  readonly wins: number;
}

/** Partia gracza na liście ostatnich (od najnowszej). */
export interface RecentPlay {
  readonly play_id: string;
  readonly meeting_id: string;
  readonly meeting_title: string;
  /** Termin spotkania partii. */
  readonly starts_at: string;
  readonly game_id: string;
  readonly game_title: string;
  readonly place: number;
  readonly points: number;
  readonly is_win: boolean;
}

/** Miejsca w trzech rankingach; `null` = gracz nie jest klasyfikowany (albo usunięty). */
export interface PlayerPlaces {
  readonly points: number | null;
  readonly wins: number | null;
  readonly streak: number | null;
}

export interface PlayerStats {
  /** Lata (strefa klubu) z partiami gracza, od najnowszego; zawsze z całej historii. */
  readonly years: readonly number[];
  /** Obecność: spotkania z ≥ 1 partią gracza. */
  readonly meetings: number;
  readonly plays: number;
  readonly wins: number;
  readonly points: number;
  readonly streak_record: number;
  readonly streak_current: number;
  readonly places: PlayerPlaces;
  readonly favorite_game: PlayerGame | null;
  /** `null` = brak gry z ≥ 3 partiami gracza (pusty stan). */
  readonly best_game: PlayerGame | null;
  readonly recent_plays: readonly RecentPlay[];
}

/** Próg partii gry do „najlepszej gry”. Baza stosuje ten sam próg. */
export const BEST_GAME_MIN_PLAYS = 3;

/**
 * Klucz w `profilesKey`: zapis i usunięcie partii odświeżają statystyki razem z profilami
 * (`PLAY_DEPENDENT_KEYS`).
 */
export const playerStatsKey = (id: string, year: number | null) =>
  [...profilesKey, 'stats', id, year ?? 'all'] as const;

/** Statystyki gracza dla roku (`null` = cała historia); `null` w danych = nie ma profilu. */
export function usePlayerStats(client: SupabaseClient, id: string, year: number | null) {
  return useQuery({
    queryKey: playerStatsKey(id, year),
    queryFn: async (): Promise<PlayerStats | null> => {
      if (!isUuid(id)) return null;
      const { data, error } = await client.rpc('player_stats', { profile_id: id, year });
      if (error) throw error;
      return (data ?? null) as PlayerStats | null;
    },
    // Przy zmianie roku poprzedni wynik zostaje do czasu nowego (bez migania), jak w rankingu.
    placeholderData: (previous, query) => (query?.queryKey[2] === id ? previous : undefined),
  });
}

/** Procent wygranych zaokrąglony do całości; `null` bez partii. */
export function winRate(wins: number, plays: number): number | null {
  return plays > 0 ? Math.round((wins * 100) / plays) : null;
}
