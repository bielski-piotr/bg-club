/**
 * Formularz gry (PRD GAME-4, GAME-5): stan pól, walidacja i zamiana na wiersz `games`.
 * Logika jest czysta, żeby dało się ją testować bez przeglądarki. Te same reguły wymusza baza
 * (CHECK `games_players_range`, `games_placement_points_check`, `games_title_*`).
 */

/** Najdłuższy tytuł (CHECK `games_title_length`). */
export const GAME_TITLE_MAX = 120;
/** Największa liczba punktów, jaką przyjmie kolumna `int[]`. */
export const POINTS_MAX = 2_147_483_647;

/** Wartości formularza. Punkty są tekstem pól (puste pole = brak wartości). */
export interface GameFormValues {
  readonly title: string;
  readonly minPlayers: number;
  readonly maxPlayers: number;
  /** Długość = `maxPlayers`: pole dla każdego miejsca 1…max (GAME-5). */
  readonly points: readonly string[];
}

export type PointsError = 'required' | 'invalid' | 'tooLarge';

export interface GameFormErrors {
  readonly title?: 'required' | 'tooLong' | undefined;
  readonly minPlayers?: 'min' | undefined;
  readonly maxPlayers?: 'range' | undefined;
  /** Błąd pola punktów dla miejsca `i + 1`; `undefined` = poprawne. */
  readonly points: readonly (PointsError | undefined)[];
}

/** Nowa gra: 2–4 graczy i puste pola punktów (do wpisania, GAME-5). */
export function emptyGameForm(): GameFormValues {
  return { title: '', minPlayers: 2, maxPlayers: 4, points: ['', '', '', ''] };
}

/** Wartości formularza z zapisanej gry. */
export function gameFormFrom(game: {
  readonly title: string;
  readonly min_players: number;
  readonly max_players: number;
  readonly placement_points: readonly number[];
}): GameFormValues {
  return {
    title: game.title,
    minPlayers: game.min_players,
    maxPlayers: game.max_players,
    points: resizePoints(game.placement_points.map(String), game.max_players),
  };
}

/**
 * Pola punktów po zmianie „max” (GAME-5): dłuższa lista dostaje puste pola na końcu, krótsza
 * traci ostatnie. Wartości dla pozostałych miejsc zostają.
 */
export function resizePoints(points: readonly string[], maxPlayers: number): string[] {
  const length = Math.max(0, Math.floor(maxPlayers));
  return Array.from({ length }, (_, i) => points[i] ?? '');
}

/** Liczba punktów z pola albo błąd. Dozwolone są tylko cyfry (liczba całkowita ≥ 0). */
export function parsePoints(text: string): number | PointsError {
  const value = text.trim();
  if (value === '') return 'required';
  if (!/^\d+$/.test(value)) return 'invalid';
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number > POINTS_MAX) return 'tooLarge';
  return number;
}

/**
 * Czy punktacja rośnie gdzieś w dół tabeli, tj. niższe miejsce ma więcej punktów niż wyższe.
 * Formularz pokazuje wtedy ostrzeżenie, ale nie blokuje zapisu (GAME-5). Puste i błędne pola
 * są pomijane.
 */
export function pointsIncrease(points: readonly string[]): boolean {
  let previous: number | undefined;
  for (const text of points) {
    const value = parsePoints(text);
    if (typeof value !== 'number') continue;
    if (previous !== undefined && value > previous) return true;
    previous = value;
  }
  return false;
}

export function validateGameForm(values: GameFormValues): GameFormErrors {
  const title = values.title.trim();
  const points = values.points.map((text) => {
    const value = parsePoints(text);
    return typeof value === 'number' ? undefined : value;
  });
  return {
    // Długość w znakach (code points), jak `char_length` w CHECK bazy, a nie w jednostkach UTF-16.
    title:
      title === '' ? 'required' : Array.from(title).length > GAME_TITLE_MAX ? 'tooLong' : undefined,
    minPlayers: values.minPlayers >= 1 ? undefined : 'min',
    maxPlayers: values.maxPlayers >= values.minPlayers ? undefined : 'range',
    points,
  };
}

export function hasErrors(errors: GameFormErrors): boolean {
  return (
    errors.title !== undefined ||
    errors.minPlayers !== undefined ||
    errors.maxPlayers !== undefined ||
    errors.points.some((error) => error !== undefined)
  );
}

/** Pola wiersza `games` z poprawnego formularza (po `validateGameForm` bez błędów). */
export function gameRow(values: GameFormValues) {
  return {
    title: values.title.trim(),
    min_players: values.minPlayers,
    max_players: values.maxPlayers,
    placement_points: values.points.map((text) => {
      const value = parsePoints(text);
      if (typeof value !== 'number') throw new Error(`invalid points: ${text}`);
      return value;
    }),
  };
}
