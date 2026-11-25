import type { SupabaseClient } from '@supabase/supabase-js';
import { profilesKey } from '../profile/profileQueries';
import { normalizeGames, type LeaderboardFilters } from './filters';
import type { LeaderboardKind } from './kinds';

/**
 * Dane rankingu (PRD LB-1…LB-7) z funkcji SQL `leaderboard(kind, date_from, date_to, game_ids)`
 * (migracja `20261123000000_leaderboard_ties_filters.sql`). Baza liczy miejsca bez remisów
 * (rozstrzygnięcia: `ties.ts`) i usuniętych na końcu bez podium; tu tylko dzielimy wynik na
 * stopnie podium i listę.
 */

export { LEADERBOARD_KINDS, isLeaderboardKind, type LeaderboardKind } from './kinds';

/** Wiersz `leaderboard(…)` w kolejności wyświetlania. */
export interface LeaderboardEntry {
  readonly place: number;
  readonly profile_id: string;
  readonly first_name: string;
  readonly last_name: string;
  readonly avatar_path: string | null;
  readonly deleted: boolean;
  readonly podium: boolean;
  readonly value: number;
  /** Ktoś inny (aktywny albo usunięty, w tej samej grupie) ma ten sam wynik. */
  readonly tied: boolean;
  /** Spotkanie, na którym gracz osiągnął wynik (ostatnie, które go zmieniło); `null` przy 0. */
  readonly reached_meeting_id: string | null;
  readonly reached_meeting_title: string | null;
  readonly reached_at: string | null;
  /** Punkty zdobyte na tym spotkaniu (w zakresie filtrów). */
  readonly reached_points: number | null;
  /** Wszystkie wygrane gracza z całej historii, bez filtrów (3. kryterium rozstrzygnięcia). */
  readonly wins: number;
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

/**
 * Klucze w `profilesKey`: zapis i usunięcie partii odświeżają ranking razem z profilami
 * (`PLAY_DEPENDENT_KEYS`, §5.6.5).
 */
export const leaderboardRootKey = [...profilesKey, 'leaderboard'] as const;
export const leaderboardKey = (kind: LeaderboardKind, filters: LeaderboardFilters) =>
  [
    ...leaderboardRootKey,
    kind,
    filters.from ?? '',
    filters.to ?? '',
    normalizeGames(filters.games).join(','),
  ] as const;

/** Argumenty RPC: brak filtru to `null` (pusta lista gier też). */
export function leaderboardArgs(kind: LeaderboardKind, filters: LeaderboardFilters) {
  return {
    kind,
    date_from: filters.from,
    date_to: filters.to,
    game_ids: filters.games.length > 0 ? normalizeGames(filters.games) : null,
  };
}

/** Opcje zapytania rankingu (wspólny cache, `createQuery` w Solid). */
export function leaderboardQuery(
  client: SupabaseClient,
  kind: LeaderboardKind,
  filters: LeaderboardFilters,
) {
  return {
    queryKey: leaderboardKey(kind, filters),
    queryFn: async (): Promise<readonly LeaderboardEntry[]> => {
      const { data, error } = await client.rpc('leaderboard', leaderboardArgs(kind, filters));
      if (error) throw error;
      return (data ?? []) as LeaderboardEntry[];
    },
    // Przy zmianie filtrów w tej samej zakładce poprzedni wynik zostaje do czasu nowego (bez
    // migania); po zmianie zakładki nie, bo miałby jednostki innej klasyfikacji.
    placeholderData: (
      previous: readonly LeaderboardEntry[] | undefined,
      query: { readonly queryKey: readonly unknown[] } | undefined,
    ) => (query?.queryKey[2] === kind ? previous : undefined),
  };
}
