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

export { scorePadFileName } from './file-name';

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

/** Rodzaj kategorii notesu. */
export type ScorePadLineKind = ScorePadLine['kind'];

/** Sposób wyznaczenia obszaru kartki (EDT-10). */
export type ScorePadAreaMode = 'full' | 'auto' | 'manual';

/** Ustawienia kroku 2 „Obszar kartki” (EDT-10) w stanie edytora. */
export interface ScorePadEditorArea {
  readonly name: string;
  /** Kolor grzbietu `#rrggbb`. */
  readonly tape: string;
  readonly mode: ScorePadAreaMode;
  /** Liczba punktów obszaru. */
  readonly points: number;
  readonly smoothing: boolean;
  /** Siła wygładzania 0…10. */
  readonly strength: number;
  /** Rozmiar kartki w centymetrach. */
  readonly size: { readonly w: number; readonly h: number };
  readonly binding: 'top' | 'left';
  /** Jest zmiana obszaru do cofnięcia. */
  readonly canUndo: boolean;
  /** Wynik ostatniego wykrywania: nieregularny kształt, kartka, nic albo brak wykrywania. */
  readonly detected: 'shape' | 'sheet' | 'missing' | null;
}

/** Zmiana ustawień kroku 2 (`setArea`). */
export interface ScorePadEditorAreaPatch {
  readonly name?: string;
  readonly tape?: string;
  readonly mode?: ScorePadAreaMode;
  readonly smoothing?: boolean;
  readonly strength?: number;
  readonly size?: { readonly w?: number; readonly h?: number };
  readonly binding?: 'top' | 'left';
}

/** Sposób mapowania pól (EDT-11): prostokąty rysowane ręcznie albo wykryta tabela. */
export type ScorePadMappingMode = 'rects' | 'table';

/** Stan kroku 3 „Mapowanie pól” (EDT-11, EDT-6). */
export interface ScorePadEditorMapping {
  readonly mode: ScorePadMappingMode;
  /** Tabela: gracze w kolumnach albo w wierszach. */
  readonly players: 'cols' | 'rows';
  /** Liczba miejsc dla graczy. */
  readonly seats: number;
  /** Liczba kategorii. */
  readonly categories: number;
  /** Tabela: liczba wierszy (albo kolumn) kategorii w tabeli. */
  readonly rows: number;
  /** Tabela: kolumny (albo wiersze) opisu przed miejscami graczy. */
  readonly labels: number;
  /** Tabela: najwięcej kolumn (albo wierszy) opisu. */
  readonly maxLabels: number;
  /** Prostokąty: miejsce, dla którego rysuje się pola (od 0). */
  readonly activeSeat: number;
  /** Prostokąty: kategoria następnego pola (od 0; równa `categories` oznacza nową kategorię). */
  readonly activeCategory: number;
  /** Prostokąty: liczba zaznaczonych pól. */
  readonly selected: number;
  /** Prostokąty: pola bieżącego miejsca można powielić dla następnego. */
  readonly canDuplicate: boolean;
  /** Jest zmiana mapowania do cofnięcia. */
  readonly canUndo: boolean;
  /** Zmiana sposobu mapowania usunie pola lub kategorie (trzeba zapytać). */
  readonly hasContent: boolean;
  /** Wynik ostatniego wykrywania tabeli na prośbę (null: nie było). */
  readonly detected: boolean | null;
  /** Powód, dla którego mapowanie nie jest jeszcze gotowe, albo null. */
  readonly problem: string | null;
  /** Widok kartki jest powiększony. */
  readonly zoomed: boolean;
}

/** Zmiana mapowania (`editMapping`). */
export type ScorePadEditorMappingAction =
  | { readonly type: 'mode'; readonly mode: ScorePadMappingMode }
  | { readonly type: 'players'; readonly players: 'cols' | 'rows' }
  | { readonly type: 'seat'; readonly seat: number }
  | { readonly type: 'category'; readonly category: number }
  | { readonly type: 'seats'; readonly delta: 1 | -1 }
  | { readonly type: 'categories'; readonly delta: 1 | -1 }
  | { readonly type: 'labels'; readonly delta: 1 | -1 }
  | { readonly type: 'detect' }
  | { readonly type: 'duplicate' }
  | { readonly type: 'delete' }
  | { readonly type: 'removeCategory' }
  | { readonly type: 'undo' }
  | { readonly type: 'fit' };

/** Stan `<score-pad-editor>` w trybie kreatora (EDT-9). */
export interface ScorePadEditorStatus {
  /** Bieżący krok edytora: 1 zdjęcie, 2 obszar kartki, 3 pola. */
  readonly step: 1 | 2 | 3;
  /** Trwa wczytywanie zdjęcia albo prostowanie kartki. */
  readonly busy: boolean;
  readonly photo: boolean;
  /** Zmniejszony podgląd zdjęcia (data URL) albo pusty napis. */
  readonly photoUrl: string;
  /** Obszar kartki jest poprawny. */
  readonly area: boolean;
  /** Powód, dla którego pól i kategorii nie da się jeszcze zapisać, albo null. */
  readonly fields: string | null;
  /** Wyprostowana kartka (data URL) po wejściu w krok pól, albo pusty napis. */
  readonly sheetUrl: string;
  readonly seats: number;
  readonly lines: readonly { readonly label: string; readonly kind: ScorePadLineKind }[];
  /** Ustawienia kroku 2: obszar, rozmiar, grzbiet, nazwa i kolor grzbietu. */
  readonly settings: ScorePadEditorArea;
  /** Stan kroku 3: sposób mapowania, miejsca, kategorie i problem do poprawy. */
  readonly mapping: ScorePadEditorMapping;
  /** Zmiany od otwarcia edytora. */
  readonly dirty: boolean;
  /** Nie udało się wczytać zdjęcia notesu otwartego do edycji. */
  readonly openFailed: boolean;
}

/** Zdarzenia `<score-pad-editor>`. */
export interface ScorePadEditorEventMap {
  'scorepad-editor:export': CustomEvent<{
    readonly config: ScorePadFile;
    readonly via: 'file' | 'clipboard';
  }>;
  'scorepad-editor:change': CustomEvent<ScorePadEditorStatus>;
}

/** Metody notesu używane przez aplikację (`ScorePad` w `core/viewer.ts`). */
export interface ScorePadApi {
  setTheme(theme: ScorePadTheme | undefined): void;
  setTemplate(id: string): Promise<void>;
  exportConfig(opt?: { sheet?: boolean }): ScorePadFile;
  /** Wczytuje plik notesu v2; w trybie klubowym tylko do pamięci tego osadzenia. */
  importConfig(raw: unknown, persist?: boolean): Promise<string>;
  /** Płynnie przywraca widok domyślny z góry po obrocie lub zoomie (PAD-12). */
  resetView(): void;
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
  /** Tryb kreatora aplikacji (EDT-9); ustawiany przed dołączeniem elementu do strony. */
  wizard: boolean;
  exportConfig(): ScorePadFile | null;
  /** Stan edytora; null przed dołączeniem do strony. */
  status(): ScorePadEditorStatus | null;
  /**
   * Wczytuje zdjęcie kartki. Odrzuca (`reason`: `type`, `image`, `busy`), gdy plik nie jest
   * obrazem, jest uszkodzony albo edytor jest zajęty.
   */
  loadPhoto(file: Blob): Promise<void>;
  /** Wczytuje notes z pliku `.json` (szablon ze zdjęciem); odrzuca jak `loadPhoto`. */
  loadTemplate(template: ScorePadTemplate): Promise<void>;
  /** Przechodzi do kroku edytora, jeśli jest dostępny. */
  goStep(step: 1 | 2 | 3): void;
  /** Zmienia ustawienia kroku 2 (EDT-10). */
  setArea(patch: ScorePadEditorAreaPatch): void;
  /** Obraca zdjęcie o 90° (1 w prawo, -1 w lewo). */
  rotatePhoto(dir: 1 | -1): void;
  /** Cofa ostatnią zmianę obszaru. */
  undoArea(): void;
  /** Zmienia mapowanie pól (krok 3, EDT-11); zmiana sposobu kasuje pola bez pytania. */
  editMapping(action: ScorePadEditorMappingAction): void;
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
