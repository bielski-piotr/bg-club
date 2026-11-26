// Typy modułu `@bg-club/score-pad/template` widziane przez aplikację (implementacja:
// `template-tools.ts`, zgodność sprawdza `contract.ts`). Moduł ładuje się leniwie.
import type { ScoringIssue } from '@bg-club/scoring';
import type { ScorePadSheet, ScorePadTemplate } from './index';

/**
 * Powód odrzucenia szablonu: `format` (to nie jest notes v2), `many` (plik ma kilka notesów
 * i żaden nie jest wskazany), `shape` (brak pól, siatki albo miejsc dla graczy), `scoring`
 * (błędne kategorie, sumy albo reguła miejsc, `issues`).
 */
export type ReadTemplateFailure = 'format' | 'many' | 'shape' | 'scoring';

export type ReadTemplateResult =
  | {
      readonly ok: true;
      /** Szablon po walidacji, z uzupełnionymi wartościami domyślnymi. */
      readonly template: ScorePadTemplate;
      /** Liczba miejsc dla graczy zdefiniowana w notesie. */
      readonly playerSlots: number;
    }
  | {
      readonly ok: false;
      readonly reason: ReadTemplateFailure;
      readonly issues?: readonly ScoringIssue[] | undefined;
    };

/** Sprawdza szablon notesu v2 (z edytora albo pliku). */
export declare function readTemplate(raw: unknown): ReadTemplateResult;

/** Sprawdza plik notesu v2 i zwraca jego szablon. */
export declare function readScorePadFile(raw: unknown): ReadTemplateResult;

/** Opcje kartki testowej kreatora. */
export interface TestSheetOptions {
  /** Losowe wpisy zgodne z zakresami kategorii; bez tego kartka ma tylko imiona graczy. */
  readonly fill?: boolean | undefined;
  /** Drugi gracz remisuje z liderem na kategorii decydującej (sprawdzenie reguł remisów). */
  readonly tie?: boolean | undefined;
  /** Losowanie jak `Math.random` (w testach deterministyczne). */
  readonly random?: (() => number) | undefined;
}

/** Wynik gracza kartki testowej. */
export interface SheetResult {
  readonly seat: number;
  readonly name: string;
  readonly place: number;
  readonly tied: boolean;
  /** Wartość kategorii decydującej. */
  readonly value: number | null;
  /** Kategoria reguły remisu, która rozstrzygnęła remis gracza, albo null. */
  readonly decidedBy: string | null;
}

/** Kartka testowa z graczami „Gracz 1…n”; `null` dla złego szablonu. */
export declare function testSheet(raw: unknown, opt?: TestSheetOptions): ScorePadSheet | null;

/** Miejsca graczy kartki według reguł notesu (jak w partii); pusta lista dla złego szablonu. */
export declare function sheetResults(raw: unknown, sheet: ScorePadSheet): readonly SheetResult[];

/** Kategoria decydująca o miejscu (jawna reguła albo domyślna suma końcowa); pusta dla złego szablonu. */
export declare function rankingLine(raw: unknown): string;
