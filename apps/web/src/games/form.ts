/**
 * Formularz gry (PRD GAME-4, GAME-5): stan pól, walidacja i zamiana na wiersz `games`.
 * Logika jest czysta, żeby dało się ją testować bez przeglądarki. Te same reguły wymusza baza
 * (CHECK `games_players_range`, `games_placement_points_check`, `games_complexity_range`,
 * `games_title_*`, wyzwalacz `games_require_complexity`).
 *
 * Skomplikowanie gry (1…5, do dwóch miejsc po przecinku) jest wymagane. Jego wpisanie, a potem
 * każda zmiana skomplikowania albo max. liczby graczy, przelicza punktację miejsc ze wzoru
 * (`complexityPoints`); punkty można potem poprawić ręcznie.
 */
import { COMPLEXITY_MAX, COMPLEXITY_MIN, complexityPoints } from '@bg-club/scoring';

/** Najdłuższy tytuł (CHECK `games_title_length`). */
export const GAME_TITLE_MAX = 120;
/** Największa liczba punktów za miejsce (rozsądny limit pola formularza). */
export const POINTS_MAX = 999_999.99;

/** Wartości formularza. Punkty i skomplikowanie są tekstem pól (puste pole = brak wartości). */
export interface GameFormValues {
  readonly title: string;
  readonly minPlayers: number;
  readonly maxPlayers: number;
  /** Skomplikowanie gry 1…5 (np. „2,75”). */
  readonly complexity: string;
  /** Długość = `maxPlayers`: pole dla każdego miejsca 1…max (GAME-5). */
  readonly points: readonly string[];
  /** Dostępna (do wyboru w głosowaniu i partii) albo niedostępna. */
  readonly available: boolean;
}

export type PointsError = 'required' | 'invalid' | 'tooLarge';
export type ComplexityError = 'required' | 'invalid' | 'range';

export interface GameFormErrors {
  readonly title?: 'required' | 'tooLong' | undefined;
  readonly minPlayers?: 'min' | undefined;
  readonly maxPlayers?: 'range' | undefined;
  readonly complexity?: ComplexityError | undefined;
  /** Błąd pola punktów dla miejsca `i + 1`; `undefined` = poprawne. */
  readonly points: readonly (PointsError | undefined)[];
}

/** Liczba w zapisie polskim: przecinek dziesiętny, bez zbędnych zer („12,5”, „8”). */
export function formatDecimal(value: number): string {
  return String(Math.round(value * 100) / 100).replace('.', ',');
}

/** Liczba z pola: cyfry z najwyżej dwoma miejscami po przecinku (przecinek albo kropka). */
function parseDecimal(text: string): number | 'required' | 'invalid' {
  const value = text.trim();
  if (value === '') return 'required';
  if (!/^\d+([.,]\d{1,2})?$/.test(value)) return 'invalid';
  return Number(value.replace(',', '.'));
}

/** Nowa gra: 2–4 graczy, bez skomplikowania i z pustymi polami punktów (GAME-5). */
export function emptyGameForm(): GameFormValues {
  return {
    title: '',
    minPlayers: 2,
    maxPlayers: 4,
    complexity: '',
    points: ['', '', '', ''],
    available: true,
  };
}

/** Wartości formularza z zapisanej gry. */
export function gameFormFrom(game: {
  readonly title: string;
  readonly min_players: number;
  readonly max_players: number;
  readonly complexity?: number | null | undefined;
  readonly placement_points: readonly number[];
  readonly available?: boolean | undefined;
}): GameFormValues {
  return {
    title: game.title,
    minPlayers: game.min_players,
    maxPlayers: game.max_players,
    complexity: game.complexity == null ? '' : formatDecimal(game.complexity),
    points: resizePoints(game.placement_points.map(formatDecimal), game.max_players),
    available: game.available ?? true,
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

/** Skomplikowanie z pola albo błąd: 1…5, najwyżej dwa miejsca po przecinku. */
export function parseComplexity(text: string): number | ComplexityError {
  const value = parseDecimal(text);
  if (typeof value !== 'number') return value;
  return value < COMPLEXITY_MIN || value > COMPLEXITY_MAX ? 'range' : value;
}

/** Liczba punktów z pola albo błąd: liczba ≥ 0 z najwyżej dwoma miejscami po przecinku. */
export function parsePoints(text: string): number | PointsError {
  const value = parseDecimal(text);
  if (typeof value !== 'number') return value;
  return value > POINTS_MAX ? 'tooLarge' : value;
}

/**
 * Punktacja ze wzoru dla bieżącego skomplikowania i max. liczby graczy; `null`, gdy
 * skomplikowanie albo liczba graczy są niepoprawne (pola zostają bez zmian).
 */
export function formulaPoints(complexity: string, maxPlayers: number): string[] | null {
  const value = parseComplexity(complexity);
  if (typeof value !== 'number' || !Number.isInteger(maxPlayers) || maxPlayers < 1) return null;
  return complexityPoints(value, maxPlayers).map(formatDecimal);
}

/** Zmiana skomplikowania: przelicza punktację ze wzoru, gdy wartość jest poprawna. */
export function withComplexity(values: GameFormValues, complexity: string): GameFormValues {
  return {
    ...values,
    complexity,
    points: formulaPoints(complexity, values.maxPlayers) ?? values.points,
  };
}

/** Zmiana „max”: punktacja ze wzoru (przy poprawnym skomplikowaniu) albo zmiana liczby pól. */
export function withMaxPlayers(values: GameFormValues, maxPlayers: number): GameFormValues {
  return {
    ...values,
    maxPlayers,
    points: formulaPoints(values.complexity, maxPlayers) ?? resizePoints(values.points, maxPlayers),
  };
}

/** Czy punkty różnią się od wyliczonych ze wzoru (ręczna poprawka administratora). */
export function pointsEdited(values: GameFormValues): boolean {
  const formula = formulaPoints(values.complexity, values.maxPlayers);
  if (!formula) return false;
  return values.points.some((text, i) => parsePoints(text) !== parsePoints(formula[i] ?? ''));
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
  const complexity = parseComplexity(values.complexity);
  return {
    // Długość w znakach (code points), jak `char_length` w CHECK bazy, a nie w jednostkach UTF-16.
    title:
      title === '' ? 'required' : Array.from(title).length > GAME_TITLE_MAX ? 'tooLong' : undefined,
    minPlayers: values.minPlayers >= 1 ? undefined : 'min',
    maxPlayers: values.maxPlayers >= values.minPlayers ? undefined : 'range',
    complexity: typeof complexity === 'number' ? undefined : complexity,
    points,
  };
}

export function hasErrors(errors: GameFormErrors): boolean {
  return (
    errors.title !== undefined ||
    errors.minPlayers !== undefined ||
    errors.maxPlayers !== undefined ||
    errors.complexity !== undefined ||
    errors.points.some((error) => error !== undefined)
  );
}

/** Pola wiersza `games` z poprawnego formularza (po `validateGameForm` bez błędów). */
export function gameRow(values: GameFormValues) {
  const complexity = parseComplexity(values.complexity);
  if (typeof complexity !== 'number') throw new Error(`invalid complexity: ${values.complexity}`);
  return {
    title: values.title.trim(),
    min_players: values.minPlayers,
    max_players: values.maxPlayers,
    complexity,
    available: values.available,
    placement_points: values.points.map((text) => {
      const value = parsePoints(text);
      if (typeof value !== 'number') throw new Error(`invalid points: ${text}`);
      return value;
    }),
  };
}
