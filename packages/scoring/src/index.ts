/**
 * Pakiet `@bg-club/scoring`: logika wyników współdzielona przez notes i aplikację.
 *
 * - `template.ts`: kontrakt formatu notesu w części wyników (kategorie, `ranking`),
 * - `totals.ts`: sumy bez cykli,
 * - `ranking.ts`: miejsca z kierunkami i remisami hierarchicznymi,
 * - `points.ts`: punkty leaderboardu z `floor` i wygrane,
 * - `validate.ts`: walidacja referencji, cykli i zakresów,
 * - `save.ts`: wyniki partii dla RPC `save_play` (bez punktów, które liczy baza).
 *
 * Punkty liczy też baza (`public.play_points`) według tych samych reguł.
 */
export * from './template';
export * from './totals';
export * from './ranking';
export * from './manual';
export * from './points';
export * from './validate';
export * from './save';
