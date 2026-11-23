import type { SupabaseClient } from '@supabase/supabase-js';
import { useQuery } from '@tanstack/react-query';
import { gamesKey } from '../games/games';
import type { LeaderboardFilters } from '../leaderboard/filters';
import { isUuid } from '../popups/routes';
import { filterArgs, filtersKey } from './playerStatsData';

/**
 * Rekordy osobiste gracza (PRD USR-4) z funkcji SQL
 * `player_records(profile_id, date_from, date_to, game_ids)`: najlepsza wartość kategorii
 * decydującej gracza w każdej grze kolekcji, z tymi samymi zasadami co rekord gry w statystykach
 * gry (GAME-11, Q25). Gra bez wyniku gracza też jest na liście (`value` `null`).
 */
export interface PlayerRecord {
  readonly game_id: string;
  readonly title: string;
  readonly cover_path: string | null;
  readonly game_deleted: boolean;
  /** Kierunek notesu: `asc` = „mniej = lepiej”; `null` bez zapisanych partii gry. */
  readonly dir: 'asc' | 'desc' | null;
  readonly value: number | null;
  readonly play_id: string | null;
  readonly meeting_id: string | null;
  readonly meeting_title: string | null;
  /** Termin spotkania partii z rekordem. */
  readonly starts_at: string | null;
  /** Rekord osobisty równa się rekordowi klubu w tej grze (z całej historii). */
  readonly club_record: boolean;
}

/** Widok listy rekordów: wszystkie gry, tylko z wynikiem albo tylko rekordy klubu. */
export type RecordsView = 'all' | 'played' | 'club';

export function visibleRecords(
  records: readonly PlayerRecord[],
  view: RecordsView,
): readonly PlayerRecord[] {
  if (view === 'played') return records.filter((r) => r.value !== null);
  if (view === 'club') return records.filter((r) => r.club_record);
  return records;
}

/**
 * Klucz w `gamesKey`: odświeża go zarówno zapis i usunięcie partii (`PLAY_DEPENDENT_KEYS`,
 * §5.6.5), jak i zmiany kolekcji (tytuł, okładka, nowa gra).
 */
export const playerRecordsKey = (id: string, filters: LeaderboardFilters) =>
  [...gamesKey, 'player-records', id, ...filtersKey(filters)] as const;

export function usePlayerRecords(client: SupabaseClient, id: string, filters: LeaderboardFilters) {
  return useQuery({
    queryKey: playerRecordsKey(id, filters),
    queryFn: async (): Promise<readonly PlayerRecord[]> => {
      if (!isUuid(id)) return [];
      const { data, error } = await client.rpc('player_records', {
        profile_id: id,
        ...filterArgs(filters),
      });
      if (error) throw error;
      return (data ?? []) as PlayerRecord[];
    },
    placeholderData: (previous, query) => (query?.queryKey[2] === id ? previous : undefined),
  });
}
