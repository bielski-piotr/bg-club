// Typy modułu `@bg-club/score-pad/template` widziane przez aplikację (implementacja:
// `template-tools.ts`, zgodność sprawdza `contract.ts`). Moduł ładuje się leniwie.
import type { ScoringIssue } from '@bg-club/scoring';
import type { ScorePadTemplate } from './index';

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
      /** Liczba miejsc dla graczy zdefiniowana w notesie (PAD-3, EDT-8). */
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
