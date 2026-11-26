import type { SupabaseClient } from '@supabase/supabase-js';
import { useQuery } from '@tanstack/react-query';
import { allExpansionsQuery, gameQuery, gameSearchQuery, gameTitlesQuery } from '../games/games';

/*
 * Hooki React gier dla obszarów jeszcze w React (do etapu 8 migracji na Solid,
 * docs/solidjs-2-migration.md). Typy, klucze i opcje zapytań są w `games/games.ts` (bez
 * frameworka, wspólne z kodem Solid).
 */

/** Wyszukiwanie w kolekcji (`gameSearchQuery`). */
export function useGameSearch(client: SupabaseClient, query: string, enabled = true) {
  return useQuery(gameSearchQuery(client, query, enabled));
}

/** Aktywna gra (`gameQuery`); `null` = nie ma takiej gry albo została usunięta. */
export function useGame(client: SupabaseClient, id: string) {
  return useQuery(gameQuery(client, id));
}

/** Wszystkie aktywne dodatki (`allExpansionsQuery`). */
export function useAllExpansions(client: SupabaseClient, enabled = true) {
  return useQuery(allExpansionsQuery(client, enabled));
}

/** Tytuły gier i dodatków po id (`gameTitlesQuery`). */
export function useGameTitles(client: SupabaseClient, ids: readonly string[]) {
  return useQuery(gameTitlesQuery(client, ids));
}
