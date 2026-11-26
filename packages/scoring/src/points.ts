/**
 * Punkty leaderboardu za miejsca (PRD §5.6.2, §5.6.3). Te same reguły liczy w bazie
 * `public.play_points` (`supabase/migrations`).
 *
 * - Punktacja gry ma pozycję dla każdego miejsca 1…max graczy. W partii z *n* stronami
 *   (graczami albo zespołami) liczą się jej **ostatnie** *n* pozycje: zwycięzca dostaje punkty
 *   za miejsce `max − n + 1`, ostatni za miejsce `max` (np. gra 2–6, partia 4 graczy: miejsca
 *   3…6 punktacji).
 * - Strona na miejscu k (bez remisu) dostaje `punktacja[k + max − n]`.
 * - Strony zremisowane na miejscach k…k+m−1 dostają średnią ich punktów zaokrągloną w dół do
 *   setnych (`floor(100 · suma / m) / 100`).
 * - Punkty są liczbami ≥ 0 z najwyżej dwoma miejscami po przecinku.
 * - Wygraną dostaje każdy gracz na miejscu 1 (także każdy członek zwycięskiego zespołu).
 */

/** Najwięcej miejsc po przecinku w punktacji miejsc (`numeric(…, 2)` w bazie). */
export const POINTS_DECIMALS = 2;
const SCALE = 10 ** POINTS_DECIMALS;

/** Liczba w setnych, gdy ma najwyżej dwa miejsca po przecinku; inaczej `null`. */
function hundredths(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  const scaled = Math.round(value * SCALE);
  return Math.abs(scaled - value * SCALE) < 1e-6 ? scaled : null;
}

/**
 * Czy miejsca tworzą poprawną numerację z remisami („1, 1, 3”): każde miejsce jest o jeden
 * większe od liczby stron na lepszych miejscach. Kolejność elementów nie ma znaczenia.
 */
export function isValidPlacing(places: readonly number[]): boolean {
  return places.every(
    (place) => Number.isInteger(place) && place === 1 + places.filter((p) => p < place).length,
  );
}

/**
 * Czy punktacja miejsc jest poprawna: liczby ≥ 0 z najwyżej dwoma miejscami po przecinku
 * (GAME-5, `is_valid_points`).
 */
export function isValidPointsTable(points: readonly number[]): boolean {
  return points.every((p) => p >= 0 && hundredths(p) !== null);
}

/**
 * Punkty kolejnych stron (w kolejności `places`). Rzuca `RangeError`, gdy miejsca nie tworzą
 * poprawnej numeracji, punktacja jest niepoprawna albo ma mniej pozycji niż stron.
 */
export function placementPoints(places: readonly number[], points: readonly number[]): number[] {
  if (!isValidPlacing(places)) throw new RangeError(`Niepoprawne miejsca: ${places.join(', ')}.`);
  if (!isValidPointsTable(points))
    throw new RangeError(`Niepoprawna punktacja miejsc: ${points.join(', ')}.`);
  if (places.length > points.length)
    throw new RangeError(`Punktacja ma ${points.length} miejsc, a stron jest ${places.length}.`);
  // Pomijamy najwyżej punktowane pozycje, których partia nie obsadziła.
  const shift = points.length - places.length;
  const table = points.map((p) => hundredths(p) ?? 0);
  return places.map((place) => {
    const tied = places.filter((p) => p === place).length;
    const start = shift + place - 1;
    const sum = table.slice(start, start + tied).reduce((a, b) => a + b, 0);
    return Math.floor(sum / tied) / SCALE;
  });
}

/** Wygrana: każdy gracz na miejscu 1, także przy wspólnym 1. miejscu (D8). */
export const isWin = (place: number): boolean => place === 1;

/** Stałe wzoru punktacji ze skomplikowania gry (GAME-5). */
export const COMPLEXITY_FORMULA = {
  /** Punkty zwycięzcy w grze o skomplikowaniu 1 przed premią za liczbę graczy. */
  base: 20,
  /** Wzrost mnożnika między skomplikowaniem 1 a 5 (M(5) = 1 + k). */
  k: 2,
  /** Premia za każdego gracza ponad dwóch (maksymalnych). */
  bonus: 0.03,
  /** Udział punktów zwycięzcy, który dostaje ostatnie miejsce. */
  floor: 0.1,
} as const;

/** Najmniejsze i największe skomplikowanie gry (1,00…5,00). */
export const COMPLEXITY_MIN = 1;
export const COMPLEXITY_MAX = 5;

/** Czy skomplikowanie jest liczbą 1…5 z najwyżej dwoma miejscami po przecinku. */
export function isValidComplexity(value: number): boolean {
  return value >= COMPLEXITY_MIN && value <= COMPLEXITY_MAX && hundredths(value) !== null;
}

/** Zaokrąglenie do jednego miejsca po przecinku, połówki od zera (jak `round(numeric, 1)`). */
function round1(value: number): number {
  const scaled = value * 10;
  // Poprawka na błąd zapisu binarnego (np. 2.25 · 10 = 22.499999…).
  return Math.round(scaled + Math.sign(scaled) * 1e-9) / 10;
}

/**
 * Punktacja miejsc 1…`maxPlayers` ze skomplikowania gry `w` (1…5):
 *
 *     points = round( M(w) × Z × [0.1 + 0.9 × (n − p) / (n − 1)] × (1 + bonus × (n − 2)), 1 )
 *     M(w)   = 1 + k × (w − 1) / 4
 *
 * gdzie Z = 20, k = 2, bonus = 0.03, n = max. liczba graczy, p = miejsce (1 = zwycięzca).
 * Dla gry z jednym miejscem (n = 1) ułamek miejsca wynosi 1.
 */
export function complexityPoints(complexity: number, maxPlayers: number): number[] {
  if (!isValidComplexity(complexity))
    throw new RangeError(`Niepoprawne skomplikowanie gry: ${complexity}.`);
  if (!Number.isInteger(maxPlayers) || maxPlayers < 1)
    throw new RangeError(`Niepoprawna liczba graczy: ${maxPlayers}.`);
  const { base, k, bonus, floor } = COMPLEXITY_FORMULA;
  const n = maxPlayers;
  const multiplier = 1 + (k * (complexity - 1)) / 4;
  const players = 1 + bonus * (n - 2);
  return Array.from({ length: n }, (_, i) => {
    const p = i + 1;
    const share = n === 1 ? 1 : floor + ((1 - floor) * (n - p)) / (n - 1);
    return round1(multiplier * base * share * players);
  });
}
