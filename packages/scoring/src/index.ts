/**
 * Pakiet `@bg-club/scoring`: logika wyników współdzielona przez notes, aplikację i testy
 * (PRD §5.6, §8.3).
 *
 * - `template.ts`: kontrakt formatu notesu w części wyników (kategorie, `ranking`, EDT-7),
 * - `totals.ts`: sumy bez cykli (EDT-13),
 * - `ranking.ts`: miejsca z kierunkami i remisami hierarchicznymi (EDT-2…EDT-4, §5.6.1),
 * - `points.ts`: punkty leaderboardu z `floor` i wygrane (§5.6.2, §5.6.3),
 * - `validate.ts`: walidacja referencji, cykli i zakresów,
 * - `save.ts`: wyniki partii dla RPC `save_play` (bez punktów, które liczy baza),
 * - `achievements.ts`: katalog osiągnięć i ich warunki z historii (§5.10, ACH-1).
 *
 * Punkty liczy też baza (`public.play_points`). Obie implementacje przechodzą ten sam zestaw
 * przypadków `cases/play-cases.json`; test pgTAP jest z niego generowany (`sql.ts`).
 * Osiągnięcia liczy też baza (`private.computed_achievement_unlocks`) na wspólnych przypadkach
 * `cases/achievements.ts`.
 */
export * from './template';
export * from './totals';
export * from './ranking';
export * from './points';
export * from './validate';
export * from './save';
export * from './achievements';
