/** Klasyfikacje rankingu (LB-1): bez zależności, bo używają ich też adresy popupów. */
export const LEADERBOARD_KINDS = ['points', 'wins', 'streak'] as const;
export type LeaderboardKind = (typeof LEADERBOARD_KINDS)[number];

export function isLeaderboardKind(value: string): value is LeaderboardKind {
  return (LEADERBOARD_KINDS as readonly string[]).includes(value);
}
