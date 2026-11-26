import type { LeaderboardEntry } from './leaderboard';

/**
 * Rozstrzygnięcia równych wyników (baza: `leaderboard`, migracja
 * `20261113001700_leaderboard.sql`). Miejsc ex aequo nie ma; równy wynik
 * rozstrzygają kolejno kryteria z {@link TIE_CRITERIA}. Tu tylko odtwarzamy, które z nich
 * zdecydowało o kolejności sąsiadów w grupie.
 */
export const TIE_CRITERIA = ['reached', 'points', 'wins', 'name'] as const;
export type TieCriterion = (typeof TIE_CRITERIA)[number];

/** Gracz w grupie i kryterium, które postawiło go przed następnym (`null` dla ostatniego). */
export interface TieMember {
  readonly entry: LeaderboardEntry;
  readonly decidedBy: TieCriterion | null;
}

export interface TieGroup {
  readonly value: number;
  readonly members: readonly TieMember[];
}

/** Kryterium, które stawia `above` przed `below` przy tym samym wyniku. */
export function decidingCriterion(above: LeaderboardEntry, below: LeaderboardEntry): TieCriterion {
  if (above.reached_meeting_id !== below.reached_meeting_id) return 'reached';
  if ((above.reached_points ?? 0) !== (below.reached_points ?? 0)) return 'points';
  if (above.wins !== below.wins) return 'wins';
  return 'name';
}

/**
 * Grupy aktywnych graczy z tym samym wynikiem (co najmniej dwie osoby), w kolejności rankingu.
 * Usunięci członkowie nie mają miejsc, więc nie tworzą grup.
 */
export function tieGroups(entries: readonly LeaderboardEntry[]): TieGroup[] {
  const groups: TieGroup[] = [];
  let current: LeaderboardEntry[] = [];
  const flush = () => {
    if (current.length > 1) {
      groups.push({
        value: current[0]?.value ?? 0,
        members: current.map((entry, index) => {
          const next = current[index + 1];
          return { entry, decidedBy: next ? decidingCriterion(entry, next) : null };
        }),
      });
    }
    current = [];
  };
  for (const entry of entries) {
    if (entry.deleted) continue;
    if (current.length > 0 && current[0]?.value !== entry.value) flush();
    current.push(entry);
  }
  flush();
  return groups;
}
