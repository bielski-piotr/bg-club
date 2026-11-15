import type { SupabaseClient } from '@supabase/supabase-js';
import { useQuery } from '@tanstack/react-query';
import { profilesKey } from '../profile/profiles';
import type { LeaderboardKind } from './kinds';

/**
 * Dane rankingu (PRD LB-1…LB-7) z funkcji SQL `leaderboard(kind, year)` i `leaderboard_years()`
 * (migracja `20261113001700_leaderboard.sql`). Baza liczy miejsca, remisy (1, 1, 3, alfabetycznie)
 * i usuniętych na końcu bez podium; tu tylko dzielimy wynik na stopnie podium i listę.
 */

export { LEADERBOARD_KINDS, isLeaderboardKind, type LeaderboardKind } from './kinds';

/** Wiersz `leaderboard(kind, year)` w kolejności wyświetlania. */
export interface LeaderboardEntry {
  readonly place: number;
  readonly profile_id: string;
  readonly first_name: string;
  readonly last_name: string;
  readonly avatar_path: string | null;
  readonly deleted: boolean;
  readonly podium: boolean;
  readonly value: number;
}

/** Jeden stopień podium: miejsce i wszyscy, którzy je dzielą (LB-6), alfabetycznie. */
export interface PodiumStep {
  readonly place: number;
  readonly entries: readonly LeaderboardEntry[];
}

export interface LeaderboardLayout {
  /** Stopnie od najlepszego; najwyżej trzy (miejsca 1–3), mniej przy 1–2 graczach albo remisie. */
  readonly steps: readonly PodiumStep[];
  /** Pozostali od 4. miejsca, a na końcu usunięci członkowie (LB-7). */
  readonly rows: readonly LeaderboardEntry[];
}

/**
 * Dzieli ranking na podium i listę (LB-2, LB-6). Flagę `podium` ustawia baza (miejsce ≤ 3,
 * nigdy usunięty), więc remis 1, 1, 3 daje dwa stopnie: dwie osoby na 1. i jedną na 3.
 */
export function leaderboardLayout(entries: readonly LeaderboardEntry[]): LeaderboardLayout {
  const steps: { place: number; entries: LeaderboardEntry[] }[] = [];
  const rows: LeaderboardEntry[] = [];
  for (const entry of entries) {
    if (!entry.podium) {
      rows.push(entry);
      continue;
    }
    const step = steps.find((s) => s.place === entry.place);
    if (step) step.entries.push(entry);
    else steps.push({ place: entry.place, entries: [entry] });
  }
  steps.sort((a, b) => a.place - b.place);
  return { steps, rows };
}

/** Widżet pokazuje pod podium najwyżej tyle wierszy (domyślnie miejsca 4–7, LB-3). */
export const WIDGET_ROWS = 4;

/**
 * Wiersze listy w widżecie: pierwsze {@link WIDGET_ROWS}, a gdy bieżący użytkownik jest dalej,
 * także jego wiersz na końcu (`own`), żeby zawsze widział swoje miejsce.
 */
export function widgetRows(
  rows: readonly LeaderboardEntry[],
  meId: string,
): { readonly shown: readonly LeaderboardEntry[]; readonly own: LeaderboardEntry | undefined } {
  const shown = rows.slice(0, WIDGET_ROWS);
  const own = rows.slice(WIDGET_ROWS).find((row) => row.profile_id === meId);
  return { shown, own };
}

/** Wartość filtru roku: `all` = cała historia (LB-4, domyślnie) albo rok, np. `2026`. */
export type YearFilter = 'all' | `${number}`;

export function filterYear(filter: YearFilter): number | null {
  return filter === 'all' ? null : Number(filter);
}

/**
 * Klucze w `profilesKey`: zapis i usunięcie partii odświeżają ranking razem z profilami
 * (`PLAY_DEPENDENT_KEYS`, §5.6.5).
 */
export const leaderboardRootKey = [...profilesKey, 'leaderboard'] as const;
export const leaderboardKey = (kind: LeaderboardKind, year: number | null) =>
  [...leaderboardRootKey, kind, year ?? 'all'] as const;
export const leaderboardYearsKey = [...leaderboardRootKey, 'years'] as const;

export function useLeaderboard(
  client: SupabaseClient,
  kind: LeaderboardKind,
  year: number | null = null,
) {
  return useQuery({
    queryKey: leaderboardKey(kind, year),
    queryFn: async (): Promise<readonly LeaderboardEntry[]> => {
      const { data, error } = await client.rpc('leaderboard', { kind, year });
      if (error) throw error;
      return (data ?? []) as LeaderboardEntry[];
    },
    // Przy zmianie roku w tej samej zakładce poprzedni wynik zostaje do czasu nowego (bez
    // migania); po zmianie zakładki nie, bo miałby jednostki innej klasyfikacji.
    placeholderData: (previous, query) => (query?.queryKey[2] === kind ? previous : undefined),
  });
}

/** Lata z zapisanymi partiami (w strefie klubu, NFR-10), od najnowszego: opcje filtru roku. */
export function useLeaderboardYears(client: SupabaseClient) {
  return useQuery({
    queryKey: leaderboardYearsKey,
    queryFn: async (): Promise<readonly number[]> => {
      const { data, error } = await client.rpc('leaderboard_years');
      if (error) throw error;
      return (data ?? []) as number[];
    },
  });
}
