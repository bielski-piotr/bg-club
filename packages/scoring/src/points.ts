/**
 * Punkty leaderboardu za miejsca (PRD §5.6.2, §5.6.3). Te same reguły liczy w bazie
 * `public.play_points` (migracja `…_scoring.sql`); obie wersje przechodzą `cases/play-cases.json`.
 *
 * - Gracz na miejscu k (bez remisu) dostaje `punktacja[k]`.
 * - Gracze zremisowani na miejscach k…k+m−1 dostają `floor((punktacja[k] + … + punktacja[k+m−1]) / m)`.
 * - Wygraną dostaje każdy gracz na miejscu 1.
 */

/**
 * Czy miejsca tworzą poprawną numerację z remisami („1, 1, 3”): każde miejsce jest o jeden
 * większe od liczby graczy na lepszych miejscach. Kolejność elementów nie ma znaczenia.
 */
export function isValidPlacing(places: readonly number[]): boolean {
  return places.every(
    (place) => Number.isInteger(place) && place === 1 + places.filter((p) => p < place).length,
  );
}

/** Czy punktacja miejsc jest poprawna: liczby całkowite ≥ 0 (GAME-5, `is_valid_points`). */
export function isValidPointsTable(points: readonly number[]): boolean {
  return points.every((p) => Number.isInteger(p) && p >= 0);
}

/**
 * Punkty kolejnych graczy (w kolejności `places`). Rzuca `RangeError`, gdy miejsca nie tworzą
 * poprawnej numeracji, punktacja jest niepoprawna albo ma mniej pozycji niż graczy.
 */
export function placementPoints(places: readonly number[], points: readonly number[]): number[] {
  if (!isValidPlacing(places)) throw new RangeError(`Niepoprawne miejsca: ${places.join(', ')}.`);
  if (!isValidPointsTable(points))
    throw new RangeError(`Niepoprawna punktacja miejsc: ${points.join(', ')}.`);
  if (places.length > points.length)
    throw new RangeError(`Punktacja ma ${points.length} miejsc, a graczy jest ${places.length}.`);
  return places.map((place) => {
    const tied = places.filter((p) => p === place).length;
    const sum = points.slice(place - 1, place - 1 + tied).reduce((a, b) => a + b, 0);
    return Math.floor(sum / tied);
  });
}

/** Wygrana: każdy gracz na miejscu 1, także przy wspólnym 1. miejscu (D8). */
export const isWin = (place: number): boolean => place === 1;
