/**
 * Publiczne API pakietu `@bg-club/score-pad` dla aplikacji (PRD §8.5).
 *
 * Ten moduł jest lekki: same typy, nazwy elementów i zdarzeń. Kod notesu i edytora (Three.js)
 * ładuje się leniwie przez `import('@bg-club/score-pad/pad')` i `import('@bg-club/score-pad/editor')`,
 * które rejestrują elementy `<score-pad>` i `<score-pad-editor>` (NFR-2).
 *
 * Źródła web componentów pochodzą z `digital-scorepad-poc` (wersja POC 2.4.0, commit `e6b7dd2`,
 * katalog `example/score-pad/score-pad/src/`): `core/` to notes, `editor/` to edytor.
 * Typy poniżej opisują tylko to, czego używa aplikacja; `contract.ts` sprawdza ich zgodność
 * z implementacją przy `pnpm typecheck`.
 */

/** Nazwy elementów rejestrowanych przez pakiet. */
export const SCORE_PAD_TAG = 'score-pad';
export const SCORE_PAD_EDITOR_TAG = 'score-pad-editor';

/** Wersja źródeł POC, z których pochodzą web componenty. */
export const SCORE_PAD_POC_VERSION = '2.4.0';

/** Motyw przekazywany do notesu i edytora (rozwiązany motyw aplikacji, bez „systemowego”). */
export type ScorePadTheme = 'light' | 'dark';

import type { Ranking, ScoringLine } from '@bg-club/scoring';

export type { Direction, Ranking, ScoringLine, TiebreakRule } from '@bg-club/scoring';

/** Kategoria notesu (`LineDef` w `core/templates.ts`): pola liczenia i opis na kartce. */
export interface ScorePadLine extends ScoringLine {
  readonly label: string;
  /** Opis kategorii (chmurka w notesie). */
  readonly hint?: string | undefined;
  /** Punktację można skreślić („x”). */
  readonly scratch?: boolean | undefined;
  /** Ikona z notesów wbudowanych. */
  readonly icon?: string | undefined;
}

/**
 * Szablon notesu (`PadTemplate` w `core/templates.ts`) w formacie v2 z regułą miejsc (EDT-7).
 * Aplikacja zapisuje go w bazie (`scorepad_versions.template`) i przekazuje notesowi; wygląd
 * i pola zna tylko notes, a kategorie i `ranking` czyta też `@bg-club/scoring`.
 *
 * Zgodność wstecz: plik bez `ranking` działa jak dotąd (najwyższa suma końcowa). Notes przy
 * wczytaniu pomija błędną regułę (`parseRanking`); przed zapisem w bazie aplikacja sprawdza
 * szablon przez `validateScoring`.
 */
export interface ScorePadTemplate {
  readonly v: 2;
  readonly id: string;
  readonly name: string;
  /**
   * Zdjęcie kartki (data URL albo adres obrazu). W bazie szablon jest bez niego: obraz leży
   * w Storage (`scorepad_versions.image_path`, EDT-1), a aplikacja wstawia go przed osadzeniem
   * notesu i przy eksporcie do pliku.
   */
  readonly image?: string | undefined;
  /** Kategorie: imiona, punktacje, sumy, premie i puste pola (EDT-13). */
  readonly lines: readonly ScorePadLine[];
  /** Kategoria decydująca, kierunek i reguły remisów; brak = najwyższa suma końcowa. */
  readonly ranking?: Ranking | undefined;
}

/** Wpisy z kartki w pliku notesu: imiona i wartości (liczba, "x" = skreślone, null = puste). */
export interface ScorePadSheet {
  readonly game: number;
  readonly started?: string | null | undefined;
  readonly names: readonly (string | null)[];
  readonly cells: Readonly<Record<string, readonly (number | 'x' | null)[]>>;
  readonly free?: Readonly<Record<string, number | 'x' | null>> | undefined;
}

/** Plik notesu w formacie v2 (`PadConfig` w `core/settings.ts`). */
export interface ScorePadFile {
  readonly format: 'score-pad';
  readonly version: 2;
  readonly template?: ScorePadTemplate | undefined;
  readonly templates?: readonly ScorePadTemplate[] | undefined;
  readonly active?: string | undefined;
  readonly settings?: object | undefined;
  readonly sheet?: ScorePadSheet | undefined;
}

/**
 * Opcje notesu w trybie klubowym (podzbiór `ScorePadOptions` z `core/viewer.ts`).
 * Adapter ustawia je we właściwości `options` przed dołączeniem elementu do strony.
 */
export interface ScorePadClubOptions {
  /** Zawsze `true` w aplikacji: bez lokalnej biblioteki szablonów i historii POC (PAD-1). */
  readonly club: true;
  /** Plik notesu (szablon z bazy, opcjonalnie z wpisami kartki). */
  readonly config?: ScorePadFile | undefined;
  /** Dodatkowe szablony (obiekty z bazy). */
  readonly templates?: ScorePadTemplate[] | undefined;
  /** Identyfikator notesu pokazanego na start. */
  readonly template?: string | undefined;
  readonly theme?: ScorePadTheme | undefined;
  /** Pasek z wyborem notesu i dźwiękiem. */
  readonly controls?: boolean | undefined;
  /** Karta wskazówek. */
  readonly help?: boolean | undefined;
  readonly sound?: boolean | undefined;
}

/** Wynik po oderwaniu karteczki (`scorepad:save`); pełny wynik z miejscami przyniesie PAD-7. */
export interface ScorePadSaveDetail {
  readonly id: string;
  readonly tpl: string;
  readonly tplName: string;
  readonly game: number;
  readonly at: string;
  readonly players: readonly { readonly name: string; readonly total: number }[];
  readonly winners: readonly string[];
  readonly sheet: ScorePadSheet;
}

/** Zdarzenia `<score-pad>` (bąbelkują i przechodzą przez shadow DOM). */
export interface ScorePadEventMap {
  'scorepad:ready': CustomEvent<null>;
  'scorepad:template': CustomEvent<{ readonly id: string; readonly name: string }>;
  'scorepad:save': CustomEvent<ScorePadSaveDetail>;
}

/** Zdarzenia `<score-pad-editor>`. */
export interface ScorePadEditorEventMap {
  'scorepad-editor:export': CustomEvent<{
    readonly config: ScorePadFile;
    readonly via: 'file' | 'clipboard';
  }>;
}

/** Metody notesu używane przez aplikację (`ScorePad` w `core/viewer.ts`). */
export interface ScorePadApi {
  setTheme(theme: ScorePadTheme | undefined): void;
  setTemplate(id: string): Promise<void>;
  exportConfig(opt?: { sheet?: boolean }): ScorePadFile;
  /** Wczytuje plik notesu v2; w trybie klubowym tylko do pamięci tego osadzenia. */
  importConfig(raw: unknown, persist?: boolean): Promise<string>;
  destroy(): void;
}

type Listener<T, E> = (this: T, event: E) => unknown;

/** Element `<score-pad>` po rejestracji. */
export interface ScorePadElement extends HTMLElement {
  options: ScorePadClubOptions | undefined;
  readonly pad: ScorePadApi | null;
  addEventListener<K extends keyof ScorePadElementEventMap>(
    type: K,
    listener: Listener<ScorePadElement, ScorePadElementEventMap[K]>,
    options?: boolean | AddEventListenerOptions,
  ): void;
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener<K extends keyof ScorePadElementEventMap>(
    type: K,
    listener: Listener<ScorePadElement, ScorePadElementEventMap[K]>,
    options?: boolean | EventListenerOptions,
  ): void;
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions,
  ): void;
}

/** Element `<score-pad-editor>` po rejestracji. */
export interface ScorePadEditorElement extends HTMLElement {
  /** Notes do poprawienia; ustawiany przed dołączeniem elementu do strony. */
  template: ScorePadTemplate | undefined;
  exportConfig(): ScorePadFile | null;
  addEventListener<K extends keyof ScorePadEditorElementEventMap>(
    type: K,
    listener: Listener<ScorePadEditorElement, ScorePadEditorElementEventMap[K]>,
    options?: boolean | AddEventListenerOptions,
  ): void;
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener<K extends keyof ScorePadEditorElementEventMap>(
    type: K,
    listener: Listener<ScorePadEditorElement, ScorePadEditorElementEventMap[K]>,
    options?: boolean | EventListenerOptions,
  ): void;
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions,
  ): void;
}

export interface ScorePadElementEventMap extends HTMLElementEventMap, ScorePadEventMap {}
export interface ScorePadEditorElementEventMap
  extends HTMLElementEventMap, ScorePadEditorEventMap {}

declare global {
  interface HTMLElementTagNameMap {
    'score-pad': ScorePadElement;
    'score-pad-editor': ScorePadEditorElement;
  }
}
