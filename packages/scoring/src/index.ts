/**
 * Pakiet `@bg-club/scoring`: logika miejsc i remisów współdzielona przez notes
 * i testy (PRD §8.3). Punkty i serie liczy SQL, ale oba miejsca przechodzą
 * ten sam zestaw przypadków z `src/cases/`.
 *
 * Funkcje domenowe dochodzą w zadaniach [014] (ranking i sumy), [029] (zapis
 * wyników) i [032] (serie). Tu jest tylko wspólny typ porównania.
 */

/** Kierunek kategorii decydującej i reguł remisu (PRD Q6). */
export type Direction = 'higher' | 'lower';

/**
 * Porównuje dwie wartości tak, że wynik ujemny oznacza lepszy wynik `a`.
 * Nadaje się wprost do `Array.prototype.sort`.
 */
export function compareByDirection(a: number, b: number, direction: Direction): number {
  return direction === 'higher' ? b - a : a - b;
}
