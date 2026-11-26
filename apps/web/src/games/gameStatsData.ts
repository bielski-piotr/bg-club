import type { SupabaseClient } from '@supabase/supabase-js';
import { isUuid } from '../popups/routes';
import { gamesKey } from './games';

/**
 * Statystyki gry z funkcji SQL `game_stats(game_id)` (migracja
 * `20261113001800_game_stats.sql`). Baza liczy wszystko z zapisanych partii (szkice się nie
 * liczą), więc zapis i usunięcie partii zmieniają je od razu.
 */

/** Gracz z największą liczbą wygranych w tej grze (przy remisie wszyscy). */
export interface TopWinner {
  readonly profile_id: string;
  readonly wins: number;
}

/** Rekordzista z pierwszą partią, w której osiągnął rekord (kto i kiedy). */
export interface RecordHolder {
  readonly profile_id: string;
  readonly play_id: string;
  readonly meeting_id: string;
  /** Termin spotkania partii. */
  readonly starts_at: string;
  /** Dodatki partii rekordu (rekord gry z dodatkami trafia do gry podstawowej z ich listą). */
  readonly expansions?: readonly { readonly id: string; readonly title: string }[] | undefined;
}

/** Rekord gry: najlepsza wartość kategorii decydującej w kierunku notesu. */
export interface GameRecord {
  readonly value: number;
  /** `asc` = „mniej = lepiej”. */
  readonly dir: 'asc' | 'desc';
  readonly holders: readonly RecordHolder[];
}

/** Wiersz rankingu graczy w grze: wygrane, potem punkty (1, 1, 3; usunięci na końcu). */
export interface GameRankingEntry {
  readonly place: number;
  readonly profile_id: string;
  readonly deleted: boolean;
  readonly wins: number;
  readonly points: number;
  readonly plays: number;
}

export interface GameStats {
  readonly play_count: number;
  /** Termin spotkania ostatniej zapisanej partii; `null` bez partii. */
  readonly last_played_at: string | null;
  readonly top_winners: readonly TopWinner[];
  /** `null`, gdy żadna partia nie ma wartości kategorii decydującej. */
  readonly record: GameRecord | null;
  /** Średnia wartość decydująca zwycięzców; `null` bez wartości. */
  readonly winner_average: number | null;
  readonly ranking: readonly GameRankingEntry[];
}

/**
 * Klucz w `gamesKey`: zapis i usunięcie partii odświeżają statystyki razem z kolekcją
 * (`PLAY_DEPENDENT_KEYS`).
 */
export const gameStatsKey = (id: string) => [...gamesKey, 'stats', id] as const;

/** Statystyki gry; `null` = gry nie ma (albo brak dostępu). */
export function gameStatsQuery(client: SupabaseClient, id: string) {
  return {
    queryKey: gameStatsKey(id),
    queryFn: async (): Promise<GameStats | null> => {
      if (!isUuid(id)) return null;
      const { data, error } = await client.rpc('game_stats', { game_id: id });
      if (error) throw error;
      return (data ?? null) as GameStats | null;
    },
  };
}

/**
 * Wynik po polsku z przecinkiem dziesiętnym. Rekord pokazujemy z dokładnością notesu (do 2
 * miejsc), a średnią zaokrąglamy do 1 miejsca („28,8”).
 */
export function formatScore(value: number, fractionDigits = 2): string {
  return new Intl.NumberFormat('pl-PL', { maximumFractionDigits: fractionDigits }).format(value);
}
