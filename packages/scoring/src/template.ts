/**
 * Kontrakt formatu notesu w części, której potrzebuje liczenie wyników.
 *
 * Pełny szablon (`PadTemplate` w `@bg-club/score-pad`) ma też zdjęcie, siatkę i pola. Tutaj są
 * tylko kategorie i reguła miejsc, więc pakiet działa na szablonie z bazy bez kodu notesu.
 */

/**
 * Typ kategorii. `input` to punktacja, `total` suma (w tym końcowa), `sum` suma częściowa
 * i `bonus` premia z notesów POC; `names` to imiona graczy, `skip` puste pole.
 */
export type LineKind = 'input' | 'names' | 'sum' | 'bonus' | 'total' | 'skip';

/** Kategoria notesu (`LineDef` w `core/templates.ts`). */
export interface ScoringLine {
  readonly id: string;
  readonly kind: LineKind;
  /** Dla sum i premii: identyfikatory sumowanych kategorii (brak = domyślne z POC). */
  readonly of?: readonly string[] | undefined;
  /** Punktacja: lista dozwolonych wartości. */
  readonly values?: readonly number[] | undefined;
  /** Punktacja: zakres od,, co ile. */
  readonly min?: number | undefined;
  readonly max?: number | undefined;
  readonly step?: number | undefined;
  /** Punktacja: dowolna liczba całkowita. */
  readonly free?: boolean | undefined;
  /** Premia: próg sumy i wartość premii. */
  readonly threshold?: number | undefined;
  readonly bonus?: number | undefined;
  /**
   * Nazwa gracza: pole przyjmuje kilku graczy, którzy grają jako zespół (jedno miejsce
   * kartce, wspólny wynik; każdy członek dostaje pełne punkty i wygraną, bez dzielenia).
   */
  readonly team?: boolean | undefined;
}

/** Kierunek kategorii: `desc` = więcej lepiej (domyślnie), `asc` = mniej lepiej. */
export type Direction = 'desc' | 'asc';

/** Reguła rozstrzygania remisu. */
export type TiebreakRule =
  | { readonly type: 'line'; readonly line: string; readonly dir: Direction }
  /** „Rozstrzyga prowadzący”: kończy automatyczne reguły. */
  | { readonly type: 'manual' }
  | { readonly type: 'shared' };

/** `template.ranking` z pliku notesu. */
export interface Ranking {
  /** Kategoria decydująca o miejscu: punktacja albo suma. */
  readonly line: string;
  readonly dir: Direction;
  /** Reguły stosowane hierarchicznie; za ostatnią jest niejawne wspólne miejsce. */
  readonly tiebreak: readonly TiebreakRule[];
}

/** Szablon notesu z punktu widzenia wyników. */
export interface ScoringTemplate {
  readonly lines: readonly ScoringLine[];
  /** Starsze pliki nie mają reguły: wtedy decyduje najwyższa suma końcowa. */
  readonly ranking?: Ranking | undefined;
}

/** Wartości kategorii punktowych jednego gracza (`null` = puste pole). */
export type LineValues = Readonly<Record<string, number | null | undefined>>;

/**
 * Klucz wyniku końcowego w wyniku `computeTotals`: wartość sumy końcowej albo, gdy notes nie ma
 * żadnej sumy `total`, suma wszystkich punktacji i premii (zachowanie notesu z POC).
 */
export const FINAL_TOTAL = '__total';

export const isComputed = (kind: LineKind): boolean =>
  kind === 'sum' || kind === 'bonus' || kind === 'total';

/** Kategoria z wartością liczbową, czyli taka, która może decydować o miejscu. */
export const isNumeric = (kind: LineKind): boolean => kind === 'input' || isComputed(kind);

/** Czy notes pozwala sadzać kilku graczy (zespół) na jednym miejscu kartki. */
export const hasTeams = (t: { readonly lines: readonly ScoringLine[] }): boolean =>
  t.lines.some((l) => l.kind === 'names' && l.team === true);
