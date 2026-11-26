// Krok 3 edytora: mapowanie pól — prostokąty ręczne albo tabela ustawiana ręcznie — i kategorie.
//
// Tryby się wykluczają: notes ma albo tabelę (wiersze i kolumny, gracze w kolumnach lub
// wierszach), albo same prostokąty ręczne (pola kategorii dla kolejnych miejsc graczy). Zmiana
// trybu kasuje pola i kategorie; w kreatorze aplikacji pyta o to wcześniej popup.

import type { Ranking, ScoringIssue, TiebreakRule } from '@bg-club/scoring';
import { FINAL_TOTAL, isNumeric, parseRanking, validateScoring } from '@bg-club/scoring';
import type { FreeField, GridDef, LineDef, LineKind, PadTemplate } from '../core/templates';
import {
  bounds,
  effectiveOf,
  inputLeaves,
  isComputed,
  padRanking,
  playerCount,
  trackCount,
  uniform,
} from '../core/templates';
import { clamp, esc, uid } from '../core/util';
import type { SheetShape } from '../core/shape';
import { shapeSvgPath } from '../core/shape';
import { icon } from './icons';

/** Sposób mapowania pól: prostokąty rysowane ręcznie albo tabela z liniami ustawianymi ręcznie. */
export type MappingMode = 'rects' | 'table';

export interface Draft {
  name: string;
  tape: string;
  /** Tabela (tryb `table`): wyznacza kolumny (albo wiersze) graczy i kategorie. */
  grid: GridDef;
  /** Liczba miejsc dla graczy w trybie prostokątów (w tabeli wynika z kolumn albo wierszy). */
  seats: number;
  /** Kategorie: w tabeli kolejne wiersze (albo kolumny), w prostokątach kategorie pól. */
  lines: LineDef[];
  fields: FreeField[];
  /** Jawna reguła miejsc: z wczytanego notesu albo ustawiona w kroku „Kategorie”. */
  ranking?: Ranking;
}

/** Stan mapowania dla panelu kreatora. */
export interface MappingState {
  readonly mode: MappingMode;
  /** Tabela: gracze w kolumnach albo w wierszach. */
  readonly players: 'cols' | 'rows';
  /** Liczba miejsc dla graczy. */
  readonly seats: number;
  /** Liczba kategorii. */
  readonly categories: number;
  /** Tabela: liczba wierszy (albo kolumn) kategorii w tabeli. */
  readonly rows: number;
  /** Tabela: liczba kolumn (albo wierszy) opisu przed miejscami graczy. */
  readonly labels: number;
  /** Tabela: najwięcej kolumn (albo wierszy) opisu (zostaje co najmniej jedno miejsce). */
  readonly maxLabels: number;
  /** Prostokąty: miejsce, dla którego rysuje się pola (od 0). */
  readonly activeSeat: number;
  /** Prostokąty: kategoria następnego pola (od 0; `categories` oznacza nową kategorię). */
  readonly activeCategory: number;
  /** Prostokąty: liczba zaznaczonych pól. */
  readonly selected: number;
  /** Prostokąty: pola bieżącego miejsca można powielić dla następnego. */
  readonly canDuplicate: boolean;
  /** Jest zmiana mapowania do cofnięcia. */
  readonly canUndo: boolean;
  /** Są pola lub kategorie, które przepadną przy zmianie trybu (pytanie o potwierdzenie). */
  readonly hasContent: boolean;
  /** Powód, dla którego mapowanie nie jest jeszcze gotowe, albo null. */
  readonly problem: string | null;
}

/** Zmiana mapowania z panelu kreatora. */
export type MappingAction =
  | { readonly type: 'mode'; readonly mode: MappingMode }
  | { readonly type: 'players'; readonly players: 'cols' | 'rows' }
  | { readonly type: 'seat'; readonly seat: number }
  | { readonly type: 'category'; readonly category: number }
  /** Tabela: kolumny (wiersze) graczy; prostokąty: nowe miejsce albo usunięcie ostatniego. */
  | { readonly type: 'seats'; readonly delta: 1 | -1 }
  /** Tabela: wiersze (kolumny) kategorii. */
  | { readonly type: 'categories'; readonly delta: 1 | -1 }
  /** Tabela: kolumny (wiersze) opisu. */
  | { readonly type: 'labels'; readonly delta: 1 | -1 }
  /** Prostokąty: powiela pola bieżącego miejsca dla następnego. */
  | { readonly type: 'duplicate' }
  /** Prostokąty: usuwa zaznaczone pola. */
  | { readonly type: 'delete' }
  /** Prostokąty: usuwa bieżącą kategorię razem z jej polami. */
  | { readonly type: 'removeCategory' }
  | { readonly type: 'undo' };

/** Zakładka kroku 4 kreatora: szczegóły kategorii albo wygrana i remisy. */
export type CategoriesView = 'lines' | 'ranking';

/** Zakres wartości punktacji: dowolny, od–do co krok albo lista wartości. */
export type RangeMode = 'free' | 'range' | 'list';

/** Kategoria w kroku 4 „Kategorie”. */
export interface CategoryState {
  readonly id: string;
  readonly label: string;
  readonly kind: LineKind;
  /** Opis kategorii (chmurka w notesie); pusty napis, gdy brak. */
  readonly hint: string;
  /** Punktacja: rodzaj zakresu i jego wartości. */
  readonly range: RangeMode;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly values: readonly number[];
  /** Suma: sumowane kategorie (jawna lista albo domyślna), w kolejności notesu. */
  readonly of: readonly string[];
  /** Suma: kategorie, które może sumować bez cyklu (punktacje i inne sumy). */
  readonly sumOptions: readonly string[];
  /** Kategoria ma pola na kartce (wiersz tabeli albo prostokąty). */
  readonly placed: boolean;
  /** Nazwa gracza: pole przyjmuje zespół (kilku graczy na jednym miejscu). */
  readonly team: boolean;
}

/** Stan kroku 4 „Kategorie”. */
export interface CategoriesState {
  readonly view: CategoriesView;
  /** Wybrana kategoria (indeks). */
  readonly active: number;
  readonly lines: readonly CategoryState[];
  /**
   * Obowiązująca reguła miejsc: jawna (`explicit`) albo domyślna (suma, której nie sumuje żadna
   * inna; bez sum `line` to `__total`, czyli suma wszystkich punktacji).
   */
  readonly ranking: Ranking;
  readonly explicit: boolean;
  /** Problemy walidatora (`validateScoring`) dla kategorii i reguły miejsc; pusta = poprawne. */
  readonly issues: readonly ScoringIssue[];
}

/** Zmiana jednej kategorii w kroku 4. */
export interface CategoryPatch {
  readonly label?: string;
  readonly kind?: LineKind;
  readonly hint?: string;
  readonly range?: RangeMode;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly values?: readonly number[];
  /** Suma: sumowane kategorie (zastępuje domyślną listę). */
  readonly of?: readonly string[];
  /** Nazwa gracza: zespoły (kilku graczy na jednym miejscu kartki). */
  readonly team?: boolean;
}

/** Zmiana kroku 4 z panelu kreatora. */
export type CategoriesAction =
  | { readonly type: 'view'; readonly view: CategoriesView }
  | { readonly type: 'select'; readonly index: number }
  | { readonly type: 'update'; readonly index: number; readonly patch: CategoryPatch }
  /** Reguła miejsc w formacie `template.ranking`. */
  | { readonly type: 'ranking'; readonly ranking: Ranking };

/** To, czego krok potrzebuje od edytora. */
export interface FieldsHost {
  readonly svg: SVGSVGElement;
  readonly toolbar: HTMLElement;
  readonly panel: HTMLElement;
  readonly sheet: HTMLCanvasElement | null;
  readonly sheetUrl: string;
  shape(): SheetShape | undefined;
  scale(w: number): number;
  toSvg(e: PointerEvent): { x: number; y: number };
  capture(e: PointerEvent): void;
  render(): void;
  /** Coś się zmieniło w notesie (np. poprawność do zapisu). */
  changed(): void;
  toast(msg: string, kind?: 'err' | 'ok'): void;
  /** Potwierdzenie zmiany trybu w samodzielnym edytorze (w kreatorze pyta aplikacja). */
  confirm?(msg: string): boolean;
  /** Tryb kreatora: pasek i panel kroku prowadzi aplikacja. */
  readonly wizard?: boolean;
  /** Przyciski powiększenia podglądu do paska narzędzi i ich obsługa. */
  zoomTools?(): string;
  bindZoomTools?(tb: HTMLElement): void;
}

type Box = { x: number; y: number; w: number; h: number };
type FreeDrag =
  | { kind: 'new'; x0: number; y0: number; box: Box | null }
  | { kind: 'move'; x0: number; y0: number; orig: Map<string, Box>; moved: boolean }
  | { kind: 'resize'; id: string };

/** Stan mapowania do cofnięcia (bez nazwy i koloru grzbietu, które należą do kroku 2). */
interface Snapshot {
  draft: string;
  mode: MappingMode;
  sel: number;
  activeP: number;
}

/**
 * Rodzaje kategorii w edytorze. „Suma” to jeden rodzaj: sumuje wybrane kategorie (także inne sumy),
 * a o zwycięzcy rozstrzyga suma, której nie sumuje żadna inna. W pliku zapisuje się jako `total`;
 * dawne `sum` (suma odcinka) i `bonus` ze starszych plików działają dalej.
 */
export const KINDS: [LineKind, string][] = [
  ['input', 'Punkty'],
  ['names', 'Imiona'],
  ['total', 'Suma'],
  ['skip', 'Bez wpisu'],
];
export const KIND_COLOR: Record<LineKind, string> = {
  input: '#3f63e0',
  names: '#d08a00',
  sum: '#139267',
  bonus: '#8a4fd8',
  total: '#139267',
  skip: '#8a8f98',
};
const PLAYER_COLORS = [
  '#3f63e0',
  '#e5484d',
  '#1f9d6b',
  '#d08a00',
  '#8a4fd8',
  '#0b8fb3',
  '#c2418b',
  '#6b7280',
];
const GAP = 0.008;
const UNDO_LIMIT = 60;
/** Tabela startowa: do dopasowania liniami na kartce. */
const FALLBACK_TABLE = { lines: 6, players: 4, labels: 1 };
const FALLBACK_FRAME = { x0: 0.06, y0: 0.06, x1: 0.94, y1: 0.62 };
/** Automatyczna nazwa kategorii: numer zmienia się razem z kolejnością. */
const AUTO_LABEL = /^Kategoria \d+$/;

export function freshDraft(): Draft {
  return {
    name: 'Mój notes',
    tape: '#161a2b',
    grid: { x: [0.06, 0.94], y: [0.05, 0.11], players: 'cols', labels: 1 },
    seats: 1,
    lines: [],
    fields: [],
  };
}

export class FieldsStep {
  draft: Draft = freshDraft();
  mode: MappingMode = 'table';
  /** Czy krok był już otwarty (tabela startowa tylko za pierwszym razem). */
  ready = false;
  /** Aktywna kategoria (indeks; w prostokątach `lines.length` = nowa kategoria). */
  private sel = 0;
  /** Miejsce gracza, dla którego rysuje się prostokąty. */
  private activeP = 0;
  private fsel = new Set<string>();
  private fdrag: FreeDrag | null = null;
  private gdrag: { axis: 'x' | 'y'; i: number } | null = null;
  /** Wciśnięty znacznik miejsca nad tabelą (przełączenie „bez wpisu” po puszczeniu). */
  private pendingTrack: number | null = null;
  /** Stan sprzed przeciągania (cofanie i przerwanie drugim palcem). */
  private dragSnap: Snapshot | null = null;
  private lastSize = { w: 0.06, h: 0.04 };
  private dupOffset: { dx: number; dy: number } | null = null;
  private lastDup: string[] = [];
  private open = new Set<string>();
  /** Świeżo dodane pole lub kategoria (krótka animacja). */
  private fresh = '';
  private undoStack: Snapshot[] = [];
  private undoKind = '';
  private undoAt = 0;
  /** Tabela startowa jeszcze bez zmian: nie ma czego tracić. */
  private untouchedFallback = false;
  /**
   * Krok 4 kreatora: kartka pokazuje kategorie (numery, wybór, reguła miejsc) zamiast
   * narzędzi mapowania, a kliknięcie pola wybiera jego kategorię.
   */
  review = false;
  /** Zakładka kroku 4: szczegóły kategorii albo wygrana i remisy. */
  private catView: CategoriesView = 'lines';
  /** Ostatni stan kroku 4 (`categoriesState(true)`); kasowany przy wczytaniu i nowym zdjęciu. */
  private catCache: CategoriesState | null = null;

  constructor(private h: FieldsHost) {
    this.resetGrid(1, 4, 1, { x0: 0.06, y0: 0.05, x1: 0.94, y1: 0.11 });
  }

  /** Nowe zdjęcie: tabela i pola od nowa (nazwa i kolor grzbietu zostają). */
  reset(): void {
    const { name, tape } = this.draft;
    this.draft = { ...freshDraft(), name, tape };
    this.mode = 'table';
    this.resetGrid(1, 4, 1, { x0: 0.06, y0: 0.05, x1: 0.94, y1: 0.11 });
    this.ready = false;
    this.sel = 0;
    this.activeP = 0;
    this.fsel.clear();
    this.open.clear();
    this.dupOffset = null;
    this.lastDup = [];
    this.undoStack = [];
    this.catView = 'lines';
    this.catCache = null;
  }

  // ─────────────────────────────────────────────── model

  tpl(): PadTemplate {
    const d = this.draft;
    const table = this.mode === 'table';
    return {
      v: 2,
      id: 'draft',
      name: d.name,
      size: { w: 10, h: 14 },
      tape: d.tape,
      grid: table ? d.grid : undefined,
      lines: d.lines,
      fields: d.fields,
      players: table ? undefined : d.seats,
      ranking: d.ranking,
    };
  }

  private catAxis(): number[] {
    const g = this.draft.grid;
    return g.players === 'cols' ? g.y : g.x;
  }

  private plAxis(): number[] {
    const g = this.draft.grid;
    return g.players === 'cols' ? g.x : g.y;
  }

  /** Liczba wierszy (kategorii) tabeli; w prostokątach 0. */
  rows(): number {
    return this.mode === 'table' ? this.catAxis().length - 1 : 0;
  }

  players(): number {
    return playerCount(this.tpl());
  }

  private newLine(i: number, kind: LineKind = 'input'): LineDef {
    const l: LineDef = {
      id: `l${uid()}`,
      label: kind === 'names' ? 'Gracze' : kind === 'total' ? 'Suma' : `Kategoria ${i + 1}`,
      kind,
    };
    if (kind === 'input') Object.assign(l, { min: 0, max: 50, step: 1 });
    return l;
  }

  /** Automatyczne nazwy („Kategoria 3”) idą za kolejnością kategorii. */
  private renumber(): void {
    this.draft.lines.forEach((l, i) => {
      if (AUTO_LABEL.test(l.label)) l.label = `Kategoria ${i + 1}`;
    });
  }

  /** Dopasowuje liczbę kategorii-wierszy (było `old`, ma być `n`); kategorie spoza tabeli zostają na końcu. */
  private setRowCount(old: number, n: number): void {
    const ls = this.draft.lines;
    const rows = ls.slice(0, old);
    const extra = ls.slice(old);
    if (!rows.length)
      for (let i = 0; i < n; i++) rows.push(this.newLine(i, i === 0 ? 'names' : 'input'));
    while (rows.length < n) rows.push(this.newLine(rows.length));
    const gone = rows.splice(n);
    this.draft.lines = [...rows, ...extra];
    for (const g of gone) this.forget(g.id);
    this.sel = clamp(this.sel, 0, Math.max(0, this.draft.lines.length - 1));
  }

  /** Usuwa ślady kategorii (sumy, pola, reguła miejsc). */
  private forget(id: string): void {
    for (const l of this.draft.lines) if (l.of) l.of = l.of.filter((x) => x !== id);
    this.draft.fields = this.draft.fields.filter((f) => f.line !== id);
    this.sanitizeRanking();
  }

  private frame(): { x0: number; y0: number; x1: number; y1: number } {
    const g = this.draft.grid;
    return { x0: g.x[0], y0: g.y[0], x1: g.x[g.x.length - 1], y1: g.y[g.y.length - 1] };
  }

  /** Rozkłada linie równo w ramce. */
  private resetGrid(lines: number, players: number, labels: number, fr = this.frame()): void {
    const g = this.draft.grid;
    const old = this.draft.lines.length ? this.catAxis().length - 1 : 0;
    g.labels = labels;
    const along = (a: number, b: number): number[] => {
      if (!labels) return uniform(a, b, players);
      const split = a + (b - a) * (g.players === 'cols' ? 0.3 : 0.14) * Math.min(1, labels);
      const lab = uniform(a, split, labels);
      return [...lab.slice(0, -1), ...uniform(split, b, players)];
    };
    if (g.players === 'cols') {
      g.y = uniform(fr.y0, fr.y1, lines);
      g.x = along(fr.x0, fr.x1);
    } else {
      g.x = uniform(fr.x0, fr.x1, lines);
      g.y = along(fr.y0, fr.y1);
    }
    this.setRowCount(old, lines);
  }

  /** Dokłada odcinek na początku albo końcu osi (poszerza ramkę; gdy brak miejsca, dzieli skrajny). */
  private extend(arr: number[], where: 'start' | 'end'): void {
    const avg = arr.length > 1 ? (arr[arr.length - 1] - arr[0]) / (arr.length - 1) : 0.08;
    if (where === 'end') {
      const room = 0.997 - arr[arr.length - 1];
      if (room > avg * 0.35) arr.push(arr[arr.length - 1] + Math.min(avg, room));
      else arr.splice(arr.length - 1, 0, (arr[arr.length - 2] + arr[arr.length - 1]) / 2);
    } else {
      const room = arr[0] - 0.003;
      if (room > avg * 0.35) arr.unshift(arr[0] - Math.min(avg, room));
      else arr.splice(1, 0, (arr[0] + arr[1]) / 2);
    }
  }

  /** Pierwsze wejście w krok: tabela startowa, którą dopasowuje się liniami do kartki. */
  enter(): void {
    if (!this.ready) {
      this.ready = true;
      this.startTable();
    }
    this.activeP = clamp(this.activeP, 0, Math.max(0, this.players() - 1));
    this.renderAll();
  }

  /** Tabela od zera: równo rozłożone linie do przeciągnięcia na kartce, kategorie od nowa. */
  private startTable(): void {
    this.mode = 'table';
    this.draft.lines = [];
    this.draft.fields = [];
    delete this.draft.ranking;
    this.sel = 0;
    this.activeP = 0;
    this.draft.grid.blank = [];
    this.resetGrid(
      FALLBACK_TABLE.lines,
      FALLBACK_TABLE.players,
      FALLBACK_TABLE.labels,
      FALLBACK_FRAME,
    );
    this.untouchedFallback = true;
  }

  /** Prostokąty od zera: jedno miejsce, bez kategorii i pól. */
  private startRects(): void {
    this.mode = 'rects';
    this.draft.lines = [];
    this.draft.fields = [];
    this.draft.seats = 1;
    delete this.draft.ranking;
    this.sel = 0;
    this.activeP = 0;
  }

  /** Wczytuje istniejący notes do edycji. */
  load(t: PadTemplate): void {
    const lines: LineDef[] = JSON.parse(JSON.stringify(t.lines));
    const fields: FreeField[] = JSON.parse(JSON.stringify(t.fields ?? []));
    const ranking = t.ranking ? (JSON.parse(JSON.stringify(t.ranking)) as Ranking) : undefined;
    // Notes z tabelą to tryb tabeli (starsze notesy z tabelą i polami dowolnymi zachowują pola,
    // dopóki tryb się nie zmieni); notes bez tabeli to prostokąty ręczne.
    const grid: GridDef = t.grid ? JSON.parse(JSON.stringify(t.grid)) : freshDraft().grid;
    this.draft = {
      name: t.name,
      tape: t.tape,
      grid,
      seats: playerCount(t),
      lines,
      fields,
      ranking,
    };
    this.mode = t.grid ? 'table' : 'rects';
    this.ready = true;
    this.sel = 0;
    this.activeP = 0;
    this.fsel.clear();
    this.open.clear();
    this.dupOffset = null;
    this.lastDup = [];
    this.undoStack = [];
    this.catView = 'lines';
    this.catCache = null;
  }

  // ─────────────────────────────────────────────── cofanie

  private snapshot(): Snapshot {
    // nazwa i kolor grzbietu należą do kroku 2: cofanie mapowania ich nie zmienia
    const rest: Partial<Draft> = { ...this.draft };
    delete rest.name;
    delete rest.tape;
    return {
      draft: JSON.stringify(rest),
      mode: this.mode,
      sel: this.sel,
      activeP: this.activeP,
    };
  }

  /** Zapamiętuje stan do cofnięcia; `kind` łączy serię zmian (np. strzałki) w jeden krok. */
  private pushUndo(snap = this.snapshot(), kind = ''): void {
    const now = Date.now();
    if (kind && kind === this.undoKind && now - this.undoAt < 900) {
      this.undoAt = now;
      return;
    }
    this.undoKind = kind;
    this.undoAt = now;
    this.untouchedFallback = false;
    this.undoStack.push(snap);
    if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
  }

  private restore(s: Snapshot): void {
    const rest = JSON.parse(s.draft) as Omit<Draft, 'name' | 'tape'>;
    this.draft = { ...rest, name: this.draft.name, tape: this.draft.tape };
    this.mode = s.mode;
    this.sel = s.sel;
    this.activeP = s.activeP;
    this.untouchedFallback = false;
    this.fsel.clear();
    this.fdrag = null;
    this.gdrag = null;
    this.dragSnap = null;
  }

  /** Cofa ostatnią zmianę mapowania (Ctrl+Z). */
  undo(): boolean {
    const s = this.undoStack.pop();
    if (!s) return false;
    this.undoKind = '';
    this.restore(s);
    this.renderAll();
    return true;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  // ─────────────────────────────────────────────── tryb i akcje panelu

  /** Są pola lub kategorie, które przepadną przy zmianie trybu. */
  hasContent(): boolean {
    return this.mode === 'table'
      ? this.rows() > 0 && !this.untouchedFallback
      : this.draft.lines.length > 0 || this.draft.fields.length > 0;
  }

  /** Zmienia tryb mapowania: dotychczasowe pola i kategorie są usuwane. */
  setMode(m: MappingMode): void {
    if (m === this.mode) return;
    this.pushUndo();
    this.fsel.clear();
    this.dupOffset = null;
    this.lastDup = [];
    this.open.clear();
    if (m === 'rects') this.startRects();
    else this.startTable();
    this.renderAll();
  }

  /** Zmiana mapowania z panelu kreatora. Zwraca, czy coś się zmieniło. */
  apply(a: MappingAction): void {
    const table = this.mode === 'table';
    switch (a.type) {
      case 'mode':
        this.setMode(a.mode);
        return;
      case 'undo':
        this.undo();
        return;
      case 'players':
        if (table) this.setPlayersAxis(a.players);
        return;
      case 'labels':
        if (table) this.setLabels(this.draft.grid.labels + a.delta);
        return;
      case 'categories':
        if (!table) return;
        if (a.delta > 0) this.addCategory();
        else if (this.rows() > 1) this.removeLine(this.rows() - 1);
        return;
      case 'seats':
        if (table) {
          if (a.delta > 0) this.addTrack();
          else this.removeTrack();
        } else if (a.delta > 0) this.addSeat();
        else this.removeSeat();
        return;
      case 'seat':
        if (table) return;
        this.chooseSeat(a.seat);
        return;
      case 'category':
        this.sel = clamp(
          Math.round(a.category),
          0,
          table ? Math.max(0, this.draft.lines.length - 1) : this.draft.lines.length,
        );
        this.renderAll();
        return;
      case 'duplicate':
        if (!table) this.duplicateSeat();
        return;
      case 'delete':
        if (!table) this.deleteFields();
        return;
      case 'removeCategory':
        if (!table && this.draft.lines[this.sel]) this.removeLine(this.sel);
        return;
    }
  }

  /** Stan mapowania dla panelu kreatora. */
  state(): MappingState {
    const d = this.draft;
    const table = this.mode === 'table';
    return {
      mode: this.mode,
      players: d.grid.players,
      seats: this.players(),
      categories: d.lines.length,
      rows: this.mode === 'table' ? this.rows() : 0,
      labels: d.grid.labels,
      maxLabels: Math.max(0, this.plAxis().length - 2),
      activeSeat: table ? 0 : this.activeP,
      activeCategory: this.sel,
      selected: table ? 0 : this.fsel.size,
      canDuplicate: !table && this.duplicateSource().length > 0,
      canUndo: this.canUndo,
      hasContent: this.hasContent(),
      problem: this.mappingProblem(),
    };
  }

  // ─────────────────────────────────────────────── kategorie

  private addCategory(): void {
    this.pushUndo();
    const ls = this.draft.lines;
    if (this.mode === 'table') {
      const old = this.rows();
      this.extend(this.catAxis(), 'end');
      const l = this.newLine(old);
      ls.splice(old, 0, l);
      this.sel = old;
      this.fresh = l.id;
    } else {
      const l = this.newLine(ls.length);
      ls.push(l);
      this.sel = ls.length - 1;
      this.fresh = l.id;
    }
    this.renumber();
    this.renderAll();
    requestAnimationFrame(() =>
      this.h.panel
        .querySelector<HTMLInputElement>(`.spe-cat[data-i="${this.sel}"] .spe-cat-name`)
        ?.select(),
    );
  }

  private splitRow(i: number): void {
    this.pushUndo();
    const arr = this.catAxis();
    arr.splice(i + 1, 0, (arr[i] + arr[i + 1]) / 2);
    const l = this.newLine(i + 1);
    this.draft.lines.splice(i + 1, 0, l);
    this.sel = i + 1;
    this.fresh = l.id;
    this.renumber();
    this.renderAll();
  }

  private removeLine(i: number): void {
    const ls = this.draft.lines;
    const rows = this.rows();
    if (i < rows) {
      if (rows <= 1) return;
      this.pushUndo();
      const arr = this.catAxis();
      // pierwszy i ostatni wiersz zwężają ramkę; środkowy dołącza do poprzedniego
      if (i === 0) arr.splice(0, 1);
      else if (i === rows - 1) arr.splice(arr.length - 1, 1);
      else arr.splice(i, 1);
    } else this.pushUndo();
    const [gone] = ls.splice(i, 1);
    this.open.delete(gone.id);
    this.forget(gone.id);
    for (const id of [...this.fsel])
      if (!this.draft.fields.some((f) => f.id === id)) this.fsel.delete(id);
    const max = this.mode === 'rects' ? ls.length : ls.length - 1;
    this.sel = clamp(Math.min(this.sel, max), 0, Math.max(0, max));
    this.renumber();
    this.renderAll();
  }

  private addTrack(): void {
    this.pushUndo();
    this.extend(this.plAxis(), 'end');
    this.renderAll();
  }

  private removeTrack(): void {
    const g = this.draft.grid;
    const arr = this.plAxis();
    if (arr.length - 1 <= g.labels + 1) return;
    this.pushUndo();
    arr.pop();
    const n = arr.length - 1;
    g.blank = (g.blank ?? []).filter((k) => k < n);
    if (!this.players()) g.blank = [];
    this.activeP = clamp(this.activeP, 0, Math.max(0, this.players() - 1));
    this.renderAll();
  }

  private setLabels(n: number): void {
    const g = this.draft.grid;
    const tracks = this.plAxis().length - 1;
    const next = clamp(n, 0, Math.max(0, tracks - 1));
    if (next === g.labels) return;
    this.pushUndo();
    g.labels = next;
    g.blank = (g.blank ?? []).filter((k) => k >= g.labels);
    if (!this.players()) g.blank = [];
    this.renderAll();
  }

  private toggleBlank(k: number): void {
    const g = this.draft.grid;
    const set = new Set(g.blank ?? []);
    if (set.has(k)) set.delete(k);
    else {
      if (this.players() <= 1) return;
      set.add(k);
    }
    this.pushUndo();
    g.blank = [...set].sort((a, b) => a - b);
    this.activeP = clamp(this.activeP, 0, Math.max(0, this.players() - 1));
    this.renderAll();
  }

  private setPlayersAxis(pl: 'cols' | 'rows'): void {
    const g = this.draft.grid;
    if (pl === g.players) return;
    this.pushUndo();
    const old = this.rows();
    // linie tabeli zostają na miejscu — zmienia się tylko to, co jest kategorią, a co graczem
    g.players = pl;
    g.blank = [];
    const across = pl === 'cols' ? g.x : g.y;
    if (across.length - 1 - g.labels < 1) g.labels = 0;
    this.setRowCount(old, this.rows());
    this.renumber();
    this.renderAll();
  }

  /**
   * Następna kategoria (po `i`, potem od początku), której miejsce `p` nie ma jeszcze pola; gdy
   * miejsce ma już wszystkie — nowa kategoria.
   */
  private nextFor(p: number, i: number): number {
    const ls = this.draft.lines;
    const missing = (k: number): boolean =>
      ls[k].kind !== 'skip' && !this.draft.fields.some((f) => f.line === ls[k].id && f.p === p);
    for (let k = i + 1; k < ls.length; k++) if (missing(k)) return k;
    for (let k = 0; k <= Math.min(i, ls.length - 1); k++) if (missing(k)) return k;
    return ls.length;
  }

  // ─────────────────────────────────────────────── prostokąty ręczne

  /**
   * Miejsce, dla którego rysuje się pola. Z paska samodzielnego edytora (`move`) zaznaczone pola
   * przechodzą do tego miejsca; z panelu kreatora zaznaczenie jest tylko zdejmowane.
   */
  private chooseSeat(p: number, move = false): void {
    const seat = clamp(Math.round(p), 0, Math.max(0, this.players() - 1));
    if (!move && seat !== this.activeP) this.fsel.clear();
    if (move && this.fsel.size) {
      // zaznaczone pola przechodzą do wybranego miejsca
      this.pushUndo();
      for (const f of this.draft.fields) if (this.fsel.has(f.id)) f.p = seat;
    } else if (seat !== this.activeP) this.sel = this.nextFor(seat, -1);
    this.activeP = seat;
    this.renderAll();
  }

  private addSeat(): void {
    this.pushUndo();
    this.draft.seats = this.players() + 1;
    this.activeP = this.draft.seats - 1;
    this.fsel.clear();
    this.sel = this.nextFor(this.activeP, -1);
    this.renderAll();
  }

  /** Usuwa ostatnie miejsce razem z jego polami (zostaje co najmniej jedno). */
  private removeSeat(): void {
    const n = this.players();
    if (n <= 1) return;
    this.pushUndo();
    const gone = n - 1;
    this.draft.fields = this.draft.fields.filter((f) => f.p !== gone);
    this.draft.seats = n - 1;
    for (const id of [...this.fsel])
      if (!this.draft.fields.some((f) => f.id === id)) this.fsel.delete(id);
    if (this.activeP >= this.draft.seats) {
      this.activeP = this.draft.seats - 1;
      this.sel = this.nextFor(this.activeP, -1);
    }
    this.renderAll();
  }

  private addField(b: Box): FreeField | null {
    let l = this.draft.lines[this.sel];
    if (!l) {
      if (this.mode !== 'rects') return null;
      // kategoria powstaje z pierwszym polem; ma tylko numer i automatyczną nazwę
      l = this.newLine(this.draft.lines.length);
      this.draft.lines.push(l);
      this.sel = this.draft.lines.length - 1;
    }
    if (l.kind === 'skip') return null;
    const f: FreeField = { id: `f${uid()}`, line: l.id, p: this.activeP, ...clampBox(b) };
    this.draft.fields.push(f);
    if (this.activeP >= this.draft.seats) this.draft.seats = this.activeP + 1;
    this.fresh = f.id;
    return f;
  }

  private copyFields(dir: 'down' | 'right'): void {
    const d = this.draft;
    const src = d.fields.filter((f) => this.fsel.has(f.id));
    if (!src.length) return;
    const x0 = Math.min(...src.map((f) => f.x));
    const x1 = Math.max(...src.map((f) => f.x + f.w));
    const y0 = Math.min(...src.map((f) => f.y));
    const y1 = Math.max(...src.map((f) => f.y + f.h));
    const gap =
      0.15 * (dir === 'down' ? Math.min(...src.map((f) => f.h)) : Math.min(...src.map((f) => f.w)));
    const dx = dir === 'right' ? x1 - x0 + gap : 0;
    const dy = dir === 'down' ? y1 - y0 + gap : 0;
    if (x1 + dx > 1.001 || y1 + dy > 1.001) {
      this.h.toast('Brak miejsca na kartce w tym kierunku.', 'err');
      return;
    }
    this.pushUndo();
    const made = src.map((f) => ({
      ...f,
      id: `f${uid()}`,
      ...clampBox({ x: f.x + dx, y: f.y + dy, w: f.w, h: f.h }),
    }));
    d.fields.push(...made);
    this.fsel = new Set(made.map((f) => f.id));
    this.renderAll();
  }

  /** Pola bieżącego miejsca, których następne miejsce jeszcze nie ma (do powielenia). */
  private duplicateSource(): FreeField[] {
    const d = this.draft;
    const from = this.activeP;
    const have = new Set(d.fields.filter((f) => f.p === from + 1).map((f) => f.line));
    return d.fields.filter((f) => f.p === from && !have.has(f.line));
  }

  /** Przesunięcie kopii dla następnego miejsca: w prawo, a bez miejsca na kartce — w dół. */
  private defaultOffset(src: FreeField[]): { dx: number; dy: number } {
    const x0 = Math.min(...src.map((f) => f.x));
    const x1 = Math.max(...src.map((f) => f.x + f.w));
    const y0 = Math.min(...src.map((f) => f.y));
    const y1 = Math.max(...src.map((f) => f.y + f.h));
    const gapX = Math.min(0.02, (x1 - x0) * 0.15);
    const gapY = Math.min(0.02, (y1 - y0) * 0.15);
    if (x1 + (x1 - x0) + gapX <= 1.001) return { dx: x1 - x0 + gapX, dy: 0 };
    if (y1 + (y1 - y0) + gapY <= 1.001) return { dx: 0, dy: y1 - y0 + gapY };
    return { dx: 0.02, dy: 0.02 };
  }

  /**
   * Powiela pola bieżącego miejsca dla następnego. Ostatnie miejsce dostaje nowe miejsce
   * obok. Kopie są zaznaczone: przesunięcie ich poprawia też położenie kolejnych kopii.
   */
  private duplicateSeat(): void {
    const d = this.draft;
    const src = this.duplicateSource();
    if (!src.length) return;
    this.pushUndo();
    const to = this.activeP + 1;
    const off = this.dupOffset ?? this.defaultOffset(src);
    const made: FreeField[] = src.map((f) => ({
      ...f,
      id: `f${uid()}`,
      p: to,
      ...clampBox({ x: f.x + off.dx, y: f.y + off.dy, w: f.w, h: f.h }),
    }));
    d.fields.push(...made);
    if (to >= d.seats) d.seats = to + 1;
    this.fsel = new Set(made.map((f) => f.id));
    this.lastDup = made.map((f) => f.id);
    this.dupOffset = off;
    this.activeP = to;
    this.sel = this.nextFor(to, -1);
    this.renderAll();
  }

  private deleteFields(): void {
    if (!this.fsel.size) return;
    this.pushUndo();
    this.draft.fields = this.draft.fields.filter((f) => !this.fsel.has(f.id));
    this.fsel.clear();
    this.renderAll();
  }

  private nudge(dx: number, dy: number): void {
    this.pushUndo(this.snapshot(), 'nudge');
    for (const f of this.draft.fields) {
      if (!this.fsel.has(f.id)) continue;
      Object.assign(f, clampBox({ x: f.x + dx, y: f.y + dy, w: f.w, h: f.h }));
    }
    if (this.sameAsDup() && this.dupOffset)
      this.dupOffset = { dx: this.dupOffset.dx + dx, dy: this.dupOffset.dy + dy };
    this.h.render();
    this.h.changed();
  }

  private sameAsDup(): boolean {
    return (
      this.lastDup.length > 0 &&
      this.lastDup.length === this.fsel.size &&
      this.lastDup.every((id) => this.fsel.has(id))
    );
  }

  // ─────────────────────────────────────────────── klawiatura

  /** Zwraca true, gdy klawisz został obsłużony. */
  key(e: KeyboardEvent): boolean {
    if (e.key === 'Escape' && (this.fdrag || this.gdrag)) {
      this.cancel();
      return true;
    }
    if (this.mode !== 'rects') return false;
    if (e.key === 'Escape' && this.fsel.size) {
      this.fsel.clear();
      this.renderAll();
      return true;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && this.fsel.size) {
      this.deleteFields();
      return true;
    }
    if (e.key.startsWith('Arrow') && this.fsel.size) {
      const st = e.shiftKey ? 0.01 : 0.002;
      this.nudge(
        e.key === 'ArrowLeft' ? -st : e.key === 'ArrowRight' ? st : 0,
        e.key === 'ArrowUp' ? -st : e.key === 'ArrowDown' ? st : 0,
      );
      return true;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
      this.fsel = new Set(this.draft.fields.filter((f) => f.p === this.activeP).map((f) => f.id));
      this.renderAll();
      return true;
    }
    return false;
  }

  // ─────────────────────────────────────────────── pasek narzędzi (samodzielny edytor)

  renderAll(): void {
    // w kreatorze pasek i panel kroku są w aplikacji (ukryte tutaj), więc ich nie budujemy
    if (!this.h.wizard) {
      this.renderToolbar();
      this.renderPanel();
    }
    this.h.render();
    this.h.changed();
  }

  /** Zmiana trybu z paska samodzielnego edytora: z polami pyta o potwierdzenie. */
  private askMode(m: MappingMode): void {
    if (m === this.mode) return;
    const ok =
      !this.hasContent() ||
      (this.h.confirm?.(
        'Zmienić sposób mapowania? Dotychczasowe pola i kategorie zostaną usunięte.',
      ) ??
        true);
    if (ok) this.setMode(m);
    else this.renderToolbar();
  }

  renderToolbar(): void {
    const tb = this.h.toolbar;
    const g = this.draft.grid;
    const cols = g.players === 'cols';
    const n = this.players();
    const tracks = this.plAxis().length - 1;
    const tabs = `<div class="spe-seg" role="radiogroup" aria-label="Sposób mapowania">
        <button type="button" role="radio" data-mode="rects" aria-checked="${this.mode === 'rects'}">${icon('fields')}<span>Prostokąty</span></button>
        <button type="button" role="radio" data-mode="table" aria-checked="${this.mode === 'table'}">${icon('table')}<span>Tabela</span></button>
      </div>`;
    const undo = `<button type="button" class="spe-tb-btn" data-a="undo" title="Cofnij (Ctrl+Z)" ${this.canUndo ? '' : 'disabled'}>${icon('undo')}</button>`;
    let tools: string;
    if (this.mode === 'table') {
      tools = `
        <div class="spe-tb-group">
          <div class="spe-seg" role="radiogroup" aria-label="Gracze w tabeli">
            <button type="button" role="radio" data-pl="cols" aria-checked="${cols}" title="Gracze w kolumnach">${icon('cols')}</button>
            <button type="button" role="radio" data-pl="rows" aria-checked="${!cols}" title="Gracze w wierszach">${icon('rows')}</button>
          </div>
          <button type="button" class="spe-tb-btn" data-a="even" title="Rozłóż linie równo">${icon('even')}</button>
        </div>
        <span class="spe-tb-sep"></span>
        <div class="spe-tb-group">
          ${stepper('tracks', cols ? 'Kolumny graczy' : 'Wiersze graczy', 'Gracze', tracks - g.labels, tracks - g.labels <= 1, false)}
          ${stepper('labels', cols ? 'Kolumny opisu' : 'Wiersze opisu', 'Opis', g.labels, g.labels <= 0, g.labels >= tracks - 1)}
          ${undo}
        </div>`;
    } else {
      const sel = this.draft.fields.filter((f) => this.fsel.has(f.id));
      tools = `
        <div class="spe-tb-group spe-players" role="radiogroup" aria-label="Miejsce gracza">
          ${Array.from({ length: n }, (_, p) => `<button type="button" role="radio" class="spe-chip" data-p="${p}" aria-checked="${p === this.activeP}" style="--pc:${PLAYER_COLORS[p % PLAYER_COLORS.length]}" title="Rysuj pola miejsca ${p + 1}">${icon('user')}<span>${p + 1}</span></button>`).join('')}
          <button type="button" class="spe-tb-btn" data-a="seat+" title="Dodaj miejsce">${icon('plus')}</button>
        </div>
        <span class="spe-tb-sep"></span>
        <div class="spe-tb-group spe-pop">
          <button type="button" class="spe-tb-btn" data-a="dup" ${this.duplicateSource().length ? '' : 'disabled'} title="Powiel dla następnego miejsca">${icon('dupNext')}</button>
          ${
            sel.length
              ? `<button type="button" class="spe-tb-btn" data-a="down" title="Powiel w dół">${icon('dupDown')}</button>
          <button type="button" class="spe-tb-btn" data-a="right" title="Powiel w prawo">${icon('dupRight')}</button>
          <button type="button" class="spe-tb-btn danger" data-a="del" title="Usuń (Delete)">${icon('trash')}</button>`
              : ''
          }
          ${undo}
        </div>`;
    }
    const zoom = this.h.zoomTools ? `<span class="spe-tb-sep"></span>${this.h.zoomTools()}` : '';
    tb.innerHTML = `<div class="spe-tb-group">${tabs}</div><span class="spe-tb-sep"></span>${tools}${zoom}`;
    this.h.bindZoomTools?.(tb);
    tb.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((b) =>
      b.addEventListener('click', () => this.askMode(b.dataset.mode as MappingMode)),
    );
    tb.querySelectorAll<HTMLButtonElement>('[data-pl]').forEach((b) =>
      b.addEventListener('click', () => this.setPlayersAxis(b.dataset.pl as 'cols' | 'rows')),
    );
    tb.querySelectorAll<HTMLButtonElement>('[data-step]').forEach((b) =>
      b.addEventListener('click', () => {
        const [what, dir] = (b.dataset.step as string).split(':');
        if (what === 'tracks') {
          if (dir === '+') this.addTrack();
          else this.removeTrack();
        } else this.setLabels(this.draft.grid.labels + (dir === '+' ? 1 : -1));
      }),
    );
    tb.querySelectorAll<HTMLButtonElement>('[data-p]').forEach((b) =>
      b.addEventListener('click', () => this.chooseSeat(Number(b.dataset.p), true)),
    );
    tb.querySelectorAll<HTMLButtonElement>('[data-a]').forEach((b) =>
      b.addEventListener('click', () => {
        const a = b.dataset.a;
        if (a === 'even') {
          this.pushUndo();
          const tr = this.plAxis().length - 1;
          const keep = g.blank;
          this.resetGrid(this.rows(), tr - g.labels, g.labels);
          g.blank = keep;
          this.renderAll();
        } else if (a === 'dup') this.duplicateSeat();
        else if (a === 'seat+') this.addSeat();
        else if (a === 'down' || a === 'right') this.copyFields(a);
        else if (a === 'del') this.deleteFields();
        else if (a === 'undo') this.undo();
      }),
    );
  }

  // ─────────────────────────────────────────────── panel: notes i kategorie (samodzielny edytor)

  renderPanel(): void {
    const p = this.h.panel;
    const d = this.draft;
    const keep = p.querySelector('.spe-cats')?.scrollTop ?? 0;
    p.innerHTML = `
      <section class="spe-card">
        <label class="spe-field"><span>Nazwa notesu</span><input type="text" maxlength="40" data-name value="${esc(d.name)}"></label>
        <label class="spe-color" title="Kolor grzbietu (taśmy)">
          <span>Grzbiet</span>
          <span class="spe-swatch" style="--c:${esc(d.tape)}"><input type="color" data-tape value="${esc(d.tape)}" aria-label="Kolor grzbietu"></span>
          <code data-hex>${esc(d.tape)}</code>
        </label>
      </section>
      <section class="spe-card spe-cats-card">
        <header class="spe-card-head"><b>Kategorie</b><span class="spe-count">${d.lines.length}</span></header>
        <ol class="spe-cats">${d.lines.map((l, i) => this.lineHtml(l, i)).join('')}</ol>
        ${this.mode === 'rects' && this.sel >= d.lines.length ? `<p class="spe-muted">Następne pole utworzy kategorię ${d.lines.length + 1}.</p>` : ''}
        <button type="button" class="spe-add" data-add title="${this.mode === 'table' ? 'Nowy wiersz tabeli' : 'Nowa kategoria pól'}">${icon('plus')}<span>Dodaj kategorię</span></button>
      </section>`;
    const list = p.querySelector('.spe-cats') as HTMLElement;
    list.scrollTop = keep;
    (p.querySelector('[data-name]') as HTMLInputElement).addEventListener('input', (e) => {
      d.name = (e.target as HTMLInputElement).value;
    });
    const tape = p.querySelector('[data-tape]') as HTMLInputElement;
    tape.addEventListener('input', () => {
      d.tape = tape.value;
      (tape.parentElement as HTMLElement).style.setProperty('--c', tape.value);
      (p.querySelector('[data-hex]') as HTMLElement).textContent = tape.value;
      this.h.render();
    });
    p.querySelector('[data-add]')?.addEventListener('click', () => this.addCategory());
    list.querySelectorAll<HTMLElement>('.spe-cat').forEach((li) => this.bindLine(li));
    this.fresh = '';
  }

  /** Kategorie, które może sumować linia `i`: punkty i inne sumy (bez tych, które same ją sumują — bez pętli). */
  private sumOptions(i: number): LineDef[] {
    const t = this.tpl();
    const me = this.draft.lines[i];
    const isTotal = me.kind === 'total';
    const uses = (k: number, seen = new Set<number>()): boolean => {
      if (seen.has(k)) return false;
      seen.add(k);
      return effectiveOf(t, k).some((id) => {
        if (id === me.id) return true;
        const j = t.lines.findIndex((x) => x.id === id);
        return j >= 0 && isComputed(t.lines[j].kind) && uses(j, seen);
      });
    };
    return this.draft.lines.filter((l, k) => {
      if (k === i) return false;
      if (l.kind === 'input') return true;
      if (l.kind === 'sum' || l.kind === 'bonus' || (isTotal && l.kind === 'total'))
        return !uses(k);
      return false;
    });
  }

  private lineHtml(l: LineDef, i: number): string {
    const t = this.tpl();
    const row = i < this.rows();
    const on = this.open.has(l.id);
    // dawna „suma odcinka” ze starszego pliku też nazywa się tu po prostu „Suma”
    const kinds: [LineKind, string][] = KINDS.map(
      ([k, n]) => (k === 'total' && l.kind === 'sum' ? ['sum', n] : [k, n]) as [LineKind, string],
    ).concat(l.kind === 'bonus' ? [['bonus', 'Premia']] : []);
    const cnt =
      this.mode === 'rects'
        ? this.draft.fields.filter((f) => f.line === l.id && f.p === this.activeP).length
        : 0;
    let more = '';
    if (on) {
      if (l.kind !== 'skip') {
        more += `<label class="spe-note"><span>${l.kind === 'names' ? 'Opis' : 'Za co są punkty'}</span>
          <textarea data-f="hint" rows="2" maxlength="160" placeholder="${l.kind === 'names' ? 'np. imię albo kolor gracza' : 'np. 2 pkt za każdy ul na planszy'}">${esc(l.hint ?? '')}</textarea></label>`;
      }
      if (l.kind === 'input') {
        const { min, max, step } = bounds({ ...l, free: false });
        more += `<div class="spe-range3" ${l.free ? 'hidden' : ''}>
            <label>od<input type="number" data-f="min" value="${min}"></label>
            <label>do<input type="number" data-f="max" value="${max}"></label>
            <label>co<input type="number" min="1" data-f="step" value="${step}"></label>
          </div>
          <label class="spe-switch"><input type="checkbox" data-f="free" ${l.free ? 'checked' : ''}><span></span>Dowolna liczba</label>
          <label class="spe-switch"><input type="checkbox" data-f="scratch" ${l.scratch ? 'checked' : ''}><span></span>Skreślanie</label>`;
      } else if (isComputed(l.kind)) {
        const of = new Set(effectiveOf(t, i));
        const opts = this.sumOptions(i);
        const twice: string[] = [];
        for (const id of of) {
          const sub = t.lines.find((x) => x.id === id);
          if (!sub || sub.kind === 'input') continue;
          for (const leaf of inputLeaves(t, effectiveOf(t, t.lines.indexOf(sub))))
            if (of.has(leaf)) twice.push(t.lines.find((x) => x.id === leaf)?.label ?? '');
        }
        const decides =
          padRanking(t).line === l.id &&
          (!!t.ranking || t.lines.filter((x) => x.kind === 'total' || x.kind === 'sum').length > 1);
        more += `<div class="spe-of">
            <div class="spe-of-head"><span>Sumuje</span>${l.of ? `<button type="button" class="spe-link" data-f="of-reset">domyślnie</button>` : ''}</div>
            ${opts.length ? opts.map((o) => `<label class="spe-check"><input type="checkbox" data-of="${o.id}" ${of.has(o.id) ? 'checked' : ''}><span data-ofname="${o.id}">${esc(o.label)}</span></label>`).join('') : `<span class="spe-muted">Brak kategorii z punktami.</span>`}
            ${twice.length ? `<p class="spe-warn">${icon('alert')}„${esc(twice[0])}” liczy się dwa razy.</p>` : ''}
            ${decides ? `<p class="spe-muted">Rozstrzyga o zwycięzcy.</p>` : ''}
          </div>`;
        if (l.kind === 'bonus') {
          more += `<div class="spe-range3"><label>gdy ≥<input type="number" data-f="threshold" value="${l.threshold ?? 63}"></label><label>dodaj<input type="number" data-f="bonus" value="${l.bonus ?? 35}"></label></div>`;
        }
      }
      more = `<div class="spe-cat-more">${more}
          <div class="spe-cat-acts">
            ${row ? `<button type="button" class="spe-mini" data-f="split" title="Podziel wiersz na dwa">${icon('split')}<span>Podziel</span></button>` : ''}
            <button type="button" class="spe-mini danger" data-f="remove" ${row && this.rows() <= 1 ? 'disabled' : ''}>${icon('trash')}<span>Usuń</span></button>
          </div>
        </div>`;
    }
    return `<li class="spe-cat${i === this.sel ? ' active' : ''}${on ? ' open' : ''}${l.id === this.fresh ? ' fresh' : ''}${l.hint?.trim() && l.kind !== 'skip' ? ' has-hint' : ''}" data-i="${i}" style="--k:${KIND_COLOR[l.kind]}">
      <div class="spe-cat-row">
        <span class="spe-cat-tag${row ? '' : ' free'}" title="${row ? `Wiersz ${i + 1} tabeli` : 'Pola na kartce'}">${row ? i + 1 : icon('free')}</span>
        <input type="text" class="spe-cat-name" maxlength="30" data-f="label" value="${esc(l.label)}" aria-label="Nazwa kategorii ${i + 1}">
        <span class="spe-cat-hint" title="${esc(l.hint ?? '')}" aria-hidden="true">${icon('note')}</span>
        ${cnt ? `<span class="spe-cat-n" title="Pola miejsca ${this.activeP + 1}">${cnt}</span>` : ''}
        <select data-f="kind" aria-label="Rodzaj kategorii ${i + 1}">${kinds.map(([k, tt]) => `<option value="${k}" ${k === l.kind ? 'selected' : ''}>${tt}</option>`).join('')}</select>
        <button type="button" class="spe-icon-btn" data-f="more" aria-expanded="${on}" title="Ustawienia kategorii">${icon('sliders')}</button>
      </div>
      ${more}
    </li>`;
  }

  private bindLine(li: HTMLElement): void {
    const i = Number(li.dataset.i);
    const l = this.draft.lines[i];
    li.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('input, select, button, label')) return;
      this.activate(i);
    });
    li.addEventListener('focusin', () => this.activate(i, true));
    li.querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLButtonElement | HTMLTextAreaElement
    >('[data-f]').forEach((f) => {
      const k = f.dataset.f as string;
      if (f.tagName === 'BUTTON') {
        f.addEventListener('click', (e) => {
          e.stopPropagation();
          if (k === 'more') {
            if (this.open.has(l.id)) this.open.delete(l.id);
            else this.open.add(l.id);
            this.sel = i;
            this.renderPanel();
            this.h.render();
          } else if (k === 'split') this.splitRow(i);
          else if (k === 'remove') this.removeLine(i);
          else if (k === 'of-reset') {
            delete l.of;
            this.renderPanel();
          }
        });
        return;
      }
      const ev =
        f.tagName === 'SELECT' || (f as HTMLInputElement).type === 'checkbox' ? 'change' : 'input';
      f.addEventListener(ev, () => {
        if (k === 'hint') {
          l.hint = (f as HTMLTextAreaElement).value;
          li.classList.toggle('has-hint', !!l.hint.trim());
          (li.querySelector('.spe-cat-hint') as HTMLElement).title = l.hint.trim();
          return;
        }
        if (k === 'label') {
          l.label = (f as HTMLInputElement).value;
          this.h.panel
            .querySelectorAll(`[data-ofname="${l.id}"]`)
            .forEach((x) => (x.textContent = l.label));
          return;
        }
        if (k === 'kind') {
          l.kind = (f as HTMLSelectElement).value as LineKind;
          if (l.kind === 'input' && !l.values && l.min == null)
            Object.assign(l, { min: 0, max: 50, step: 1 });
          if (!isComputed(l.kind)) delete l.of;
          this.renderPanel();
          this.h.panel
            .querySelector<HTMLElement>(`.spe-cat[data-i="${i}"] [data-f="kind"]`)
            ?.focus();
          this.h.render();
          this.h.changed();
          return;
        }
        if (k === 'scratch') l.scratch = (f as HTMLInputElement).checked;
        else if (k === 'free') {
          l.free = (f as HTMLInputElement).checked;
          const r = li.querySelector('.spe-range3') as HTMLElement | null;
          if (r) r.hidden = l.free;
        } else if (k === 'threshold' || k === 'bonus')
          l[k] = Number((f as HTMLInputElement).value) || 0;
        else {
          const num = (n: string): number =>
            Number((li.querySelector(`[data-f="${n}"]`) as HTMLInputElement).value);
          const mn = num('min');
          const mx = num('max');
          const st = Math.max(1, Math.abs(num('step')) || 1);
          if (isFinite(mn) && isFinite(mx)) {
            Object.assign(l, { min: Math.min(mn, mx), max: Math.max(mn, mx), step: st });
            delete l.values;
          }
        }
      });
    });
    li.querySelectorAll<HTMLInputElement>('[data-of]').forEach((cb) =>
      cb.addEventListener('change', () => {
        const cur = new Set(effectiveOf(this.tpl(), i));
        if (cb.checked) cur.add(cb.dataset.of as string);
        else cur.delete(cb.dataset.of as string);
        l.of = this.draft.lines.map((x) => x.id).filter((id) => cur.has(id));
        this.renderPanel();
      }),
    );
  }

  /** Wybór kategorii; przy zaznaczonych prostokątach — przypisanie ich do tej kategorii. */
  private activate(i: number, quiet = false): void {
    if (this.mode === 'rects' && this.fsel.size && !quiet && this.draft.lines[i]?.kind !== 'skip') {
      this.pushUndo();
      const id = this.draft.lines[i].id;
      for (const f of this.draft.fields) if (this.fsel.has(f.id)) f.line = id;
      this.sel = i;
      this.renderAll();
      return;
    }
    if (this.sel === i) return;
    this.sel = i;
    this.h.panel
      .querySelectorAll<HTMLElement>('.spe-cat')
      .forEach((x) => x.classList.toggle('active', Number(x.dataset.i) === i));
    this.h.render();
    this.h.changed();
  }

  // ─────────────────────────────────────────────── krok 4: kategorie i reguła miejsc

  /** Wejście w krok 4 albo wyjście z niego (kartka z kategoriami zamiast narzędzi mapowania). */
  setReview(on: boolean): void {
    this.review = on;
    this.fdrag = null;
    this.gdrag = null;
    this.pendingTrack = null;
    this.dragSnap = null;
    this.fsel.clear();
    if (on) this.sel = clamp(this.sel, 0, Math.max(0, this.draft.lines.length - 1));
  }

  /** Kategoria ma pola na kartce: wiersz (kolumnę) tabeli albo prostokąty miejsc graczy. */
  private placed(i: number): boolean {
    const l = this.draft.lines[i];
    if (!l) return false;
    if (this.mode === 'table') return i < this.rows();
    const n = this.players();
    return this.draft.fields.some((f) => f.line === l.id && f.p < n);
  }

  /**
   * Stan kroku 4 dla panelu kreatora. `cached`: kroki 1 i 2 nie zmieniają kategorii, więc
   * edytor bierze wtedy ostatni wynik (bez walidacji przy każdej klatce przeciągania punktu).
   */
  categoriesState(cached = false): CategoriesState {
    if (cached && this.catCache) return this.catCache;
    this.catCache = this.computeCategories();
    return this.catCache;
  }

  private computeCategories(): CategoriesState {
    const t = this.tpl();
    const lines = this.draft.lines.map((l, i): CategoryState => {
      const range = rangeMode(l);
      const b = bounds({ ...l, free: false });
      return {
        id: l.id,
        label: l.label,
        kind: l.kind,
        hint: l.hint ?? '',
        range,
        min: range === 'range' && l.min != null ? l.min : b.min,
        max: range === 'range' && l.max != null ? l.max : b.max,
        step: range === 'range' && l.step != null ? l.step : b.step,
        values: l.values ?? [],
        of: isComputed(l.kind) ? effectiveOf(t, i) : [],
        sumOptions: isComputed(l.kind) ? this.sumOptions(i).map((x) => x.id) : [],
        placed: this.placed(i),
        team: l.kind === 'names' && l.team === true,
      };
    });
    return {
      view: this.catView,
      active: clamp(this.sel, 0, Math.max(0, lines.length - 1)),
      lines,
      ranking: padRanking(t),
      explicit: !!this.draft.ranking,
      issues: this.scoringIssues(),
    };
  }

  /**
   * Problemy kategorii i reguły miejsc według walidatora zapisu (`validateScoring`, jak
   * `readTemplate` przed zapisem w bazie) oraz pusta lista dozwolonych wartości.
   */
  private scoringIssues(): ScoringIssue[] {
    const out = this.output();
    const issues = validateScoring({ lines: out.lines, ranking: this.draft.ranking }).filter(
      (i) => i.code !== 'unreachable-rule',
    );
    this.draft.lines.forEach((l, i) => {
      if (l.kind === 'input' && rangeMode(l) === 'list' && !l.values?.length)
        issues.push({ code: 'invalid-values', path: `lines[${i}]` });
    });
    return issues;
  }

  /** Zmiana kroku 4 z panelu kreatora. */
  applyCategories(a: CategoriesAction): void {
    switch (a.type) {
      case 'view':
        this.catView = a.view;
        break;
      case 'select':
        this.sel = clamp(Math.round(a.index), 0, Math.max(0, this.draft.lines.length - 1));
        break;
      case 'update': {
        const l = this.draft.lines[a.index];
        if (!l) return;
        this.sel = a.index;
        this.patchLine(a.index, l, a.patch);
        this.sanitizeRanking();
        // Cofanie mapowania przywraca cały stan kategorii z chwili zmiany; po edycji kategorii
        // przywróciłoby też stare nazwy, typy i regułę, więc historia mapowania się kończy.
        this.undoStack = [];
        break;
      }
      case 'ranking':
        this.undoStack = [];
        this.draft.ranking = {
          line: a.ranking.line,
          dir: a.ranking.dir,
          // Za ostatnią regułą zawsze jest wspólne miejsce: jawne „shared” na końcu
          // nic nie zmienia, więc go nie zapisujemy.
          tiebreak: a.ranking.tiebreak
            .map((r): TiebreakRule => (r.type === 'line' ? { ...r } : { type: r.type }))
            .filter((r, k, all) => !(r.type === 'shared' && k === all.length - 1)),
        };
        break;
    }
    this.h.render();
    this.h.changed();
  }

  private patchLine(i: number, l: LineDef, p: CategoryPatch): void {
    if (p.label !== undefined) l.label = p.label;
    if (p.hint !== undefined) {
      if (p.hint.trim()) l.hint = p.hint;
      else delete l.hint;
    }
    if (p.kind !== undefined && p.kind !== l.kind) {
      const auto: Partial<Record<LineKind, string>> = { names: 'Gracze', total: 'Suma' };
      const before = auto[l.kind];
      l.kind = p.kind;
      // Automatyczna nazwa idzie za typem: „Kategoria 3” → „Gracze” → „Kategoria 3”.
      const isAuto = AUTO_LABEL.test(l.label) || (before !== undefined && l.label === before);
      if (isAuto) l.label = auto[l.kind] ?? `Kategoria ${i + 1}`;
      if (l.kind === 'input' && !l.free && !l.values && l.min == null)
        Object.assign(l, { min: 0, max: 50, step: 1 });
      if (!isComputed(l.kind)) delete l.of;
      // Kategoria bez wartości liczbowej nie może być składnikiem sumy.
      if (!isNumeric(l.kind))
        for (const x of this.draft.lines) if (x.of) x.of = x.of.filter((id) => id !== l.id);
    }
    if (p.team !== undefined) {
      if (p.team && l.kind === 'names') l.team = true;
      else delete l.team;
    }
    if (l.kind !== 'names') delete l.team;
    if (p.range !== undefined) {
      const b = bounds({ ...l, free: false });
      if (p.range === 'free') l.free = true;
      else {
        delete l.free;
        if (p.range === 'range' && (l.min == null || l.max == null)) {
          Object.assign(l, b);
          delete l.values;
        } else if (p.range === 'list' && (l.min != null || l.max != null || !l.values)) {
          // Krótki zakres staje się listą jego wartości; długi zaczyna od pustej listy.
          const count = Math.floor((b.max - b.min) / b.step) + 1;
          l.values = count <= 12 ? Array.from({ length: count }, (_, k) => b.min + k * b.step) : [];
          delete l.min;
          delete l.max;
          delete l.step;
        }
      }
    }
    if (rangeMode(l) === 'range') {
      // Punktacja bez zapisanego zakresu (starszy plik) ma domyślny 0–50: od niego zaczynamy.
      if (l.min == null || l.max == null) {
        Object.assign(l, bounds({ ...l, free: false }));
        delete l.values;
      }
      for (const k of ['min', 'max', 'step'] as const) {
        const v = p[k];
        if (v !== undefined) l[k] = v;
      }
    }
    if (p.values !== undefined && rangeMode(l) === 'list')
      l.values = [...new Set(p.values)].sort((x, y) => x - y);
    if (p.of !== undefined && isComputed(l.kind)) {
      const want = new Set(p.of);
      l.of = this.draft.lines.map((x) => x.id).filter((id) => want.has(id) && id !== l.id);
    }
  }

  /**
   * Reguła miejsc po zmianie typów kategorii: kategoria decydująca, która przestała być liczbowa,
   * wraca do domyślnej sumy, a reguły remisu na takich kategoriach znikają.
   */
  private sanitizeRanking(): void {
    const r = this.draft.ranking;
    if (!r) return;
    const numeric = (id: string): boolean => {
      const l = this.draft.lines.find((x) => x.id === id);
      return !!l && isNumeric(l.kind);
    };
    const tiebreak = r.tiebreak.filter((x) => x.type !== 'line' || numeric(x.line));
    if (numeric(r.line)) {
      this.draft.ranking = { line: r.line, dir: r.dir, tiebreak };
      return;
    }
    // Domyślna reguła: suma, której nie sumuje żadna inna, więcej = lepiej.
    const line = padRanking({ ...this.tpl(), ranking: undefined }).line;
    if (line === FINAL_TOTAL) delete this.draft.ranking;
    else this.draft.ranking = { line, dir: 'desc', tiebreak };
  }

  /** Kliknięcie kartki w kroku 4 wybiera kategorię pola (zakładka szczegółów kategorii). */
  pick(e: PointerEvent): void {
    const hit = (e.target as Element).closest('[data-cat]') as SVGElement | null;
    if (!hit) return;
    this.sel = Number(hit.dataset.cat);
    this.catView = 'lines';
    this.h.render();
    this.h.changed();
  }

  /** Pola kategorii na kartce (w pikselach kartki): wiersz tabeli albo prostokąty. */
  private lineBoxes(i: number, w: number, h: number): Box[] {
    const l = this.draft.lines[i];
    if (!l) return [];
    if (this.mode === 'table') {
      if (i >= this.rows()) return [];
      const g = this.draft.grid;
      const X = g.x.map((v) => v * w);
      const Y = g.y.map((v) => v * h);
      const [x0, x1] = [X[0], X[X.length - 1]];
      const [y0, y1] = [Y[0], Y[Y.length - 1]];
      return [
        g.players === 'cols'
          ? { x: x0, y: Y[i], w: x1 - x0, h: Y[i + 1] - Y[i] }
          : { x: X[i], y: y0, w: X[i + 1] - X[i], h: y1 - y0 },
      ];
    }
    const n = this.players();
    return this.draft.fields
      .filter((f) => f.line === l.id && f.p < n)
      .sort((a, b) => a.p - b.p || a.y - b.y || a.x - b.x)
      .map((f) => ({ x: f.x * w, y: f.y * h, w: f.w * w, h: f.h * h }));
  }

  /**
   * Kartka w kroku 4: numer przy każdej kategorii,
   * wybrana kategoria podświetlona i obrysowana; w zakładce „Wygrana i remisy” kategoria
   * decydująca z pucharem i kategorie reguł remisów z numerem reguły.
   */
  private reviewSvg(w: number, h: number, k: number): string {
    const ACCENT = '#2F54EB';
    const r = 10 * k;
    const ranking = padRanking(this.tpl());
    const ruleOf = new Map<string, number>();
    ranking.tiebreak.forEach((x, n) => {
      if (x.type === 'line' && !ruleOf.has(x.line)) ruleOf.set(x.line, n + 1);
    });
    const ranked = this.catView === 'ranking';
    const cols = this.draft.grid.players === 'cols';
    let hits = '';
    let marks = '';
    this.draft.lines.forEach((l, i) => {
      const boxes = this.lineBoxes(i, w, h);
      const first = boxes[0];
      if (!first) return;
      const deciding = ranked && ranking.line === l.id;
      const rule = ranked ? ruleOf.get(l.id) : undefined;
      const on = ranked ? deciding : i === this.sel;
      const tint = on || rule !== undefined;
      for (const b of boxes) {
        hits += `<rect data-cat="${i}" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${4 * k}" class="spe-cat-box${tint ? ' tint' : ''}${on ? ' on' : ''}"><title>${esc(l.label)}</title></rect>`;
      }
      if (ranked && !deciding && rule === undefined) return;
      // numer po lewej stronie wiersza (nad kolumną, gdy kategorie są w kolumnach), na kartce
      const table = this.mode === 'table';
      let cx: number;
      let cy: number;
      if (table && !cols) {
        cx = first.x + first.w / 2;
        cy = first.y - r - 4 * k >= r ? first.y - r - 4 * k : first.y + r + 3 * k;
      } else {
        cx = first.x - r - 4 * k >= r ? first.x - r - 4 * k : first.x + r + 3 * k;
        cy = first.y + first.h / 2;
      }
      const filled = on;
      const cls = `spe-cat-badge${filled ? ' on' : ''}${rule !== undefined && !deciding ? ' rule' : ''}`;
      const inner = deciding
        ? `<path d="M${cx - 3.5 * k} ${cy - 4 * k}h${7 * k}v${2.5 * k}a${3.5 * k} ${3.5 * k} 0 0 1 ${-7 * k} 0z M${cx} ${cy + 2 * k}v${2 * k} M${cx - 2.5 * k} ${cy + 4.5 * k}h${5 * k}" fill="none" stroke="#fff" stroke-width="${1.4 * k}" stroke-linecap="round" stroke-linejoin="round"/>`
        : `<text x="${cx}" y="${cy + 3.6 * k}" font-size="${10 * k}">${rule ?? i + 1}</text>`;
      marks += `<g class="${cls}" pointer-events="none" data-badge="${i}"><circle cx="${cx}" cy="${cy}" r="${r}"/>${inner}</g>`;
    });
    return `<g class="spe-review" style="--accent:${ACCENT}">${hits}${marks}</g>`;
  }

  // ─────────────────────────────────────────────── podgląd

  draw(): string {
    const sheet = this.h.sheet;
    if (!sheet) return '';
    const { width: w, height: h } = sheet;
    const k = this.h.scale(w);
    // zdjęcie kartki rysuje edytor jako trwałą warstwę pod nakładką
    let s = '';
    const sh = this.h.shape();
    if (sh)
      s += `<path d="M0 0H${w}V${h}H0Z${shapeSvgPath(sh, w, h)}" class="spe-dim" fill-rule="evenodd"/>`;
    if (this.review) s += this.reviewSvg(w, h, k);
    else s += this.mode === 'table' ? this.gridSvg(w, h, k) : this.freeSvg(w, h, k);
    return s;
  }

  private gridSvg(w: number, h: number, k: number): string {
    const g = this.draft.grid;
    const X = g.x.map((v) => v * w);
    const Y = g.y.map((v) => v * h);
    const cols = g.players === 'cols';
    const L = g.labels;
    const rows = this.rows();
    let s = `<defs><pattern id="spe-hatch" width="${10 * k}" height="${10 * k}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="${10 * k}" height="${10 * k}" fill="rgba(90,90,90,0.1)"/><line x1="0" y1="0" x2="0" y2="${10 * k}" stroke="rgba(70,70,70,0.4)" stroke-width="${2 * k}"/></pattern></defs>`;
    if (L > 0) {
      s += cols
        ? `<rect x="${X[0]}" y="${Y[0]}" width="${X[L] - X[0]}" height="${Y[Y.length - 1] - Y[0]}" class="spe-labels"/>`
        : `<rect x="${X[0]}" y="${Y[0]}" width="${X[X.length - 1] - X[0]}" height="${Y[L] - Y[0]}" class="spe-labels"/>`;
    }
    for (let i = 0; i < rows; i++) {
      const l = this.draft.lines[i];
      if (!l) continue;
      const c = KIND_COLOR[l.kind];
      const r = cols
        ? { x: X[L], y: Y[i], w: X[X.length - 1] - X[L], h: Y[i + 1] - Y[i] }
        : { x: X[i], y: Y[L], w: X[i + 1] - X[i], h: Y[Y.length - 1] - Y[L] };
      const on = i === this.sel;
      const fill = l.kind === 'skip' ? 'url(#spe-hatch)' : c;
      s += `<rect data-line="${i}" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${fill}" fill-opacity="${l.kind === 'skip' ? 1 : on ? 0.3 : 0.13}" class="spe-band${on ? ' on' : ''}" style="--k:${c}"/>`;
      const bx = cols ? X[0] + 4 * k : r.x + 4 * k;
      const by = cols ? r.y + 4 * k : Y[0] + 4 * k;
      const fs = 11 * k;
      s += `<g pointer-events="none"><rect x="${bx}" y="${by}" width="${fs * 2}" height="${fs * 1.5}" rx="${4 * k}" fill="${c}"/><text x="${bx + fs}" y="${by + fs * 1.1}" font-size="${fs}" class="spe-num">${i + 1}</text></g>`;
    }
    // linie tabeli; uchwyty 10 px na końcach przy górnej i lewej krawędzi, z większą
    // strefą chwytu pod palcem
    const grab = (coarsePointer() ? 16 : 9) * k;
    const lineEl = (axis: 'x' | 'y', i: number, v: number): string => {
      const outer = i === 0 || i === (axis === 'x' ? X.length - 1 : Y.length - 1);
      const [x1, y1, x2, y2] =
        axis === 'x' ? [v, Y[0], v, Y[Y.length - 1]] : [X[0], v, X[X.length - 1], v];
      const on = this.gdrag?.axis === axis && this.gdrag.i === i;
      return `<g data-g="${axis}" data-i="${i}" class="spe-gl ${axis}${outer ? ' outer' : ''}${on ? ' on' : ''}">
        <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="hit"/>
        <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="vis"/>
        ${
          // narożnik należy do lewej krawędzi (x[0]); linia y[0] chwyta się za samą linię
          axis === 'y' && i === 0
            ? ''
            : `<circle cx="${x1}" cy="${y1}" r="${grab}" fill="transparent"/>
        <circle cx="${x1}" cy="${y1}" r="${5 * k}" class="knob"/>`
        }</g>`;
    };
    X.forEach((v, i) => (s += lineEl('x', i, v)));
    Y.forEach((v, i) => (s += lineEl('y', i, v)));
    // ścieżki graczy (nad uchwytami linii, żeby ich nie zasłaniały): przełącznik „bez wpisu” po kliknięciu nagłówka
    const blank = new Set(g.blank ?? []);
    const tracks = trackCount(this.tpl());
    let pn = 0;
    for (let t = L; t < tracks; t++) {
      const off = blank.has(t);
      if (off) {
        s += cols
          ? `<rect x="${X[t]}" y="${Y[0]}" width="${X[t + 1] - X[t]}" height="${Y[Y.length - 1] - Y[0]}" fill="url(#spe-hatch)" pointer-events="none"/>`
          : `<rect x="${X[0]}" y="${Y[t]}" width="${X[X.length - 1] - X[0]}" height="${Y[t + 1] - Y[t]}" fill="url(#spe-hatch)" pointer-events="none"/>`;
      } else pn++;
      const fs = 11 * k;
      const pw = fs * 2.6;
      const ph = fs * 1.7;
      const cx = cols ? (X[t] + X[t + 1]) / 2 : Math.max(pw / 2 + 2 * k, X[0] - pw / 2 - 6 * k);
      const cy = cols ? Math.max(ph / 2 + 2 * k, Y[0] - ph / 2 - 6 * k) : (Y[t] + Y[t + 1]) / 2;
      const color = off ? '#8a8f98' : PLAYER_COLORS[(pn - 1) % PLAYER_COLORS.length];
      s += `<g data-track="${t}" class="spe-track${off ? ' off' : ''}"><title>${off ? 'Bez wpisu — kliknij, by przywrócić miejsce' : 'Kliknij, by oznaczyć jako miejsce bez wpisu'}</title>
        <rect x="${cx - pw / 2}" y="${cy - ph / 2}" width="${pw}" height="${ph}" rx="${ph / 2}" fill="${color}"/>
        <text x="${cx}" y="${cy + fs * 0.36}" font-size="${fs}" class="spe-num">${off ? '—' : `G${pn}`}</text></g>`;
    }
    s += this.fieldsSvg(w, h, k, false);
    return s;
  }

  private freeSvg(w: number, h: number, k: number): string {
    let s = `<rect data-bg="1" x="0" y="0" width="${w}" height="${h}" fill="transparent" class="spe-draw"/>`;
    s += this.fieldsSvg(w, h, k, true);
    const fd = this.fdrag;
    if (fd?.kind === 'new' && fd.box) {
      const b = fd.box;
      const l = this.draft.lines[this.sel];
      s += `<rect x="${b.x * w}" y="${b.y * h}" width="${b.w * w}" height="${b.h * h}" class="spe-ghost" style="--k:${KIND_COLOR[l?.kind ?? 'input']}"/>`;
    }
    return s;
  }

  /** Prostokąty pól; `live` = można je zaznaczać i przesuwać. */
  private fieldsSvg(w: number, h: number, k: number, live: boolean): string {
    const d = this.draft;
    const idx = new Map(d.lines.map((l, i) => [l.id, i]));
    const n = this.players();
    let s = '';
    for (const f of d.fields) {
      const li = idx.get(f.line);
      if (li === undefined) continue;
      const c = KIND_COLOR[d.lines[li].kind];
      const on = live && this.fsel.has(f.id);
      const other = live && f.p !== this.activeP && !on;
      const x = f.x * w;
      const y = f.y * h;
      const fw = f.w * w;
      const fh = f.h * h;
      const cls = `spe-f${on ? ' on' : ''}${other ? ' other' : ''}${f.p >= n ? ' lost' : ''}${f.id === this.fresh ? ' fresh' : ''}`;
      const shape =
        f.shape === 'round'
          ? `<ellipse cx="${x + fw / 2}" cy="${y + fh / 2}" rx="${fw / 2}" ry="${fh / 2}"/>`
          : `<rect x="${x}" y="${y}" width="${fw}" height="${fh}" rx="${Math.min(3 * k, fw / 4, fh / 4)}"/>`;
      const fs = Math.min(10.5 * k, fh * 0.42, fw * 0.3);
      const label =
        fs > 4 * k
          ? `<text x="${x + fw / 2}" y="${y + fh / 2 + fs * 0.36}" font-size="${fs}">${li + 1}·G${f.p + 1}</text>`
          : '';
      s += `<g ${live ? `data-fid="${f.id}"` : 'pointer-events="none"'} class="${cls}" style="--k:${c}">${shape}${label}</g>`;
    }
    if (live && this.fsel.size === 1) {
      const f = d.fields.find((x) => this.fsel.has(x.id));
      if (f) {
        const hs = (coarsePointer() ? 16 : 10) * k;
        s += `<rect data-fh="${f.id}" x="${(f.x + f.w) * w - hs / 2}" y="${(f.y + f.h) * h - hs / 2}" width="${hs}" height="${hs}" rx="${2 * k}" class="spe-resize"/>`;
      }
    }
    return s;
  }

  // ─────────────────────────────────────────────── wskaźnik

  private norm(e: PointerEvent): { x: number; y: number } {
    const p = this.h.toSvg(e);
    const c = this.h.sheet as HTMLCanvasElement;
    return { x: clamp(p.x / c.width, 0, 1), y: clamp(p.y / c.height, 0, 1) };
  }

  /** Trwa przeciąganie linii tabeli albo prostokąta. */
  get dragging(): boolean {
    return !!(this.fdrag || this.gdrag || this.pendingTrack !== null);
  }

  /** Przerywa przeciąganie (Esc, drugi palec): mapowanie wraca do stanu sprzed niego. */
  cancel(): void {
    this.pendingTrack = null;
    const snap = this.dragSnap;
    const hadNew = this.fdrag?.kind === 'new';
    this.fdrag = null;
    this.gdrag = null;
    this.dragSnap = null;
    if (snap && !hadNew) {
      const fsel = new Set(this.fsel);
      this.restore(snap);
      this.fsel = new Set([...fsel].filter((id) => this.draft.fields.some((f) => f.id === id)));
    }
    this.renderAll();
  }

  down(e: PointerEvent): void {
    const t = e.target as Element;
    if (this.mode === 'table') {
      const gl = t.closest('[data-g]') as HTMLElement | null;
      if (gl) {
        this.dragSnap = this.snapshot();
        this.gdrag = { axis: gl.dataset.g as 'x' | 'y', i: Number(gl.dataset.i) };
        this.h.capture(e);
        this.h.render();
        return;
      }
      const tr = t.closest('[data-track]') as HTMLElement | null;
      if (tr) {
        // przełącza się dopiero po puszczeniu: drugi palec (szczypanie) to anuluje
        this.pendingTrack = Number(tr.dataset.track);
        return;
      }
      const band = t.closest('[data-line]') as HTMLElement | null;
      if (band) {
        const i = Number(band.dataset.line);
        this.activate(i);
        this.h.panel
          .querySelector<HTMLElement>(`.spe-cat[data-i="${i}"]`)
          ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
      return;
    }
    const p = this.norm(e);
    const fields = this.draft.fields;
    const hs = t.closest('[data-fh]') as HTMLElement | null;
    const fg = t.closest('[data-fid]') as HTMLElement | null;
    this.dragSnap = this.snapshot();
    if (hs) {
      const f = fields.find((x) => x.id === hs.dataset.fh);
      if (f) this.fdrag = { kind: 'resize', id: f.id };
    } else if (fg) {
      const id = fg.dataset.fid as string;
      const f = fields.find((x) => x.id === id);
      if (e.shiftKey) {
        if (this.fsel.has(id)) this.fsel.delete(id);
        else this.fsel.add(id);
      } else if (!this.fsel.has(id)) this.fsel = new Set([id]);
      // pole innego miejsca: od teraz rysuje się dla tego miejsca
      if (f && !e.shiftKey) {
        this.activeP = f.p;
        const li = this.draft.lines.findIndex((l) => l.id === f.line);
        if (li >= 0) this.sel = li;
      }
      const orig = new Map<string, Box>();
      for (const x of fields)
        if (this.fsel.has(x.id)) orig.set(x.id, { x: x.x, y: x.y, w: x.w, h: x.h });
      this.fdrag = { kind: 'move', x0: p.x, y0: p.y, orig, moved: false };
      this.renderToolbar();
      this.renderPanel();
      this.h.changed();
    } else if (this.fsel.size) {
      // klik obok zaznaczenia tylko je zdejmuje
      this.dragSnap = null;
      this.fsel.clear();
      this.renderAll();
      return;
    } else {
      const l = this.draft.lines[this.sel];
      if (l?.kind === 'skip') {
        this.dragSnap = null;
        this.h.toast('Wybierz kategorię, do której należy pole.', 'err');
        return;
      }
      this.fdrag = { kind: 'new', x0: p.x, y0: p.y, box: null };
    }
    this.h.capture(e);
    this.h.render();
  }

  move(e: PointerEvent): void {
    if (this.gdrag && this.h.sheet) {
      const p = this.h.toSvg(e);
      const arr = this.gdrag.axis === 'x' ? this.draft.grid.x : this.draft.grid.y;
      const v = this.gdrag.axis === 'x' ? p.x / this.h.sheet.width : p.y / this.h.sheet.height;
      const i = this.gdrag.i;
      const lo = i > 0 ? arr[i - 1] + GAP : 0;
      const hi = i < arr.length - 1 ? arr[i + 1] - GAP : 1;
      arr[i] = clamp(v, lo, hi);
      this.h.render();
      return;
    }
    const fd = this.fdrag;
    if (!fd) return;
    const p = this.norm(e);
    if (fd.kind === 'new') {
      fd.box = {
        x: Math.min(fd.x0, p.x),
        y: Math.min(fd.y0, p.y),
        w: Math.abs(p.x - fd.x0),
        h: Math.abs(p.y - fd.y0),
      };
    } else if (fd.kind === 'move') {
      const dx = p.x - fd.x0;
      const dy = p.y - fd.y0;
      if (Math.abs(dx) + Math.abs(dy) > 0.002) fd.moved = true;
      if (!fd.moved) return;
      for (const f of this.draft.fields) {
        const o = fd.orig.get(f.id);
        if (o) Object.assign(f, clampBox({ x: o.x + dx, y: o.y + dy, w: o.w, h: o.h }));
      }
    } else {
      const f = this.draft.fields.find((x) => x.id === fd.id);
      if (f) {
        f.w = clamp(p.x - f.x, 0.006, 1 - f.x);
        f.h = clamp(p.y - f.y, 0.006, 1 - f.y);
      }
    }
    this.h.render();
  }

  up(e: PointerEvent): void {
    if (this.pendingTrack !== null) {
      const t = this.pendingTrack;
      this.pendingTrack = null;
      this.toggleBlank(t);
      return;
    }
    const snap = this.dragSnap;
    this.dragSnap = null;
    if (this.gdrag) {
      this.gdrag = null;
      if (snap && snap.draft !== this.snapshot().draft) this.pushUndo(snap);
      this.renderAll();
      return;
    }
    const fd = this.fdrag;
    this.fdrag = null;
    if (!fd) return;
    const p = this.norm(e);
    if (fd.kind === 'new') {
      const b = fd.box;
      const at = this.sel;
      const f =
        !b || (b.w < 0.006 && b.h < 0.006)
          ? this.addField({
              x: p.x - this.lastSize.w / 2,
              y: p.y - this.lastSize.h / 2,
              w: this.lastSize.w,
              h: this.lastSize.h,
            })
          : this.addField({ ...b, w: Math.max(b.w, 0.006), h: Math.max(b.h, 0.006) });
      if (f) {
        if (snap) this.pushUndo(snap);
        this.lastSize = { w: f.w, h: f.h };
        // od razu następna kategoria tego samego miejsca — można rysować bez przerwy
        this.sel = this.nextFor(this.activeP, Math.max(at, this.sel));
      }
      this.renderAll();
      requestAnimationFrame(() =>
        this.h.panel
          .querySelector<HTMLElement>('.spe-cat.active')
          ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }),
      );
      return;
    }
    if (snap && snap.draft !== this.snapshot().draft) this.pushUndo(snap);
    if (fd.kind === 'move' && fd.moved && this.sameAsDup() && this.dupOffset) {
      // poprawka położenia kopii uczy przesunięcie dla kolejnych powieleń
      this.dupOffset = {
        dx: this.dupOffset.dx + (p.x - fd.x0),
        dy: this.dupOffset.dy + (p.y - fd.y0),
      };
    } else if (fd.kind === 'resize') {
      const f = this.draft.fields.find((x) => x.id === fd.id);
      if (f) this.lastSize = { w: f.w, h: f.h };
    }
    this.renderAll();
  }

  /** Kursor nad podglądem zależny od trybu. */
  cursorClass(): string {
    return this.mode === 'rects' ? 'spe-c-draw' : '';
  }

  // ─────────────────────────────────────────────── poprawność i wynik

  /** Powód, dla którego mapowanie (krok 3) nie jest gotowe, albo null. */
  mappingProblem(): string | null {
    const d = this.draft;
    if (this.mode === 'table') {
      if (this.players() < 1) return 'Ustaw co najmniej jedno miejsce dla gracza.';
      if (this.rows() < 1) return 'Ustaw co najmniej jedną kategorię.';
      return null;
    }
    if (!d.fields.length) return 'Narysuj na kartce pole pierwszej kategorii.';
    const n = this.players();
    for (let p = 0; p < n; p++)
      if (!d.fields.some((f) => f.p === p)) return `Miejsce ${p + 1} nie ma jeszcze pól.`;
    // kategorie punktowe muszą mieć pola; suma, imiona i puste pole mogą nie mieć
    const empty = d.lines.findIndex(
      (l) => l.kind === 'input' && !d.fields.some((f) => f.line === l.id && f.p < n),
    );
    if (empty >= 0) return `Kategoria ${empty + 1} nie ma jeszcze pól.`;
    return null;
  }

  /** Powód, dla którego nie da się jeszcze zapisać (albo null). */
  problem(): string | null {
    const mapping = this.mappingProblem();
    if (mapping) return mapping;
    const d = this.draft;
    const rows = this.rows();
    if (d.lines.filter((l) => l.kind === 'names').length > 1)
      return 'Tylko jedna kategoria może być „Imiona”.';
    const placed = (l: LineDef, i: number): boolean =>
      i < rows || d.fields.some((f) => f.line === l.id && f.p < this.players());
    if (!d.lines.some((l, i) => l.kind === 'input' && placed(l, i)))
      return 'Dodaj kategorię z punktami.';
    return null;
  }

  /** Część szablonu: tabela albo prostokąty, kategorie i pola (zaokrąglone). */
  output(): Pick<
    PadTemplate,
    'name' | 'tape' | 'grid' | 'lines' | 'fields' | 'players' | 'ranking'
  > {
    const d = this.draft;
    const n = this.players();
    const table = this.mode === 'table';
    const ids = new Set(d.lines.map((l) => l.id));
    const fields = d.fields
      .filter((f) => ids.has(f.line) && f.p < n)
      .map((f) => ({ ...f, x: r4(f.x), y: r4(f.y), w: r4(f.w), h: r4(f.h) }));
    const lines: LineDef[] = d.lines.map((l) => {
      const out: LineDef = { ...l, label: l.label.trim() || 'Kategoria' };
      if (l.hint?.trim() && l.kind !== 'skip') out.hint = l.hint.trim();
      else delete out.hint;
      if (l.kind !== 'names' || !l.team) delete out.team;
      if (l.kind === 'input') {
        if (l.free) {
          out.free = true;
          delete out.values;
          delete out.min;
          delete out.max;
          delete out.step;
        } else {
          delete out.free;
          if (l.min != null && l.max != null) delete out.values;
          else if (!l.values?.length) Object.assign(out, { min: 0, max: 50, step: 1 });
        }
        if (!l.scratch) delete out.scratch;
      } else {
        for (const k of ['values', 'min', 'max', 'step', 'free', 'scratch'] as const) delete out[k];
      }
      if (isComputed(l.kind) && l.of) out.of = l.of.filter((id) => ids.has(id) && id !== l.id);
      else delete out.of;
      return out;
    });
    const g = d.grid;
    return {
      name: d.name.trim() || 'Mój notes',
      tape: d.tape,
      grid: table
        ? {
            ...g,
            x: g.x.map(r4),
            y: g.y.map(r4),
            blank: g.blank?.length ? [...g.blank] : undefined,
          }
        : undefined,
      lines,
      fields: fields.length ? fields : undefined,
      players: table ? undefined : n,
      // Reguła wskazująca usuniętą albo zmienioną kategorię przestaje obowiązywać (domyślna reguła).
      ranking: d.ranking && parseRanking(d.ranking, lines).ranking,
    };
  }
}

function stepper(
  key: string,
  title: string,
  label: string,
  v: number,
  noMinus: boolean,
  noPlus: boolean,
): string {
  return `<div class="spe-stepper" title="${title}"><span>${label}</span>
    <button type="button" data-step="${key}:-" aria-label="${title}: mniej" ${noMinus ? 'disabled' : ''}>${icon('minus')}</button>
    <output>${v}</output>
    <button type="button" data-step="${key}:+" aria-label="${title}: więcej" ${noPlus ? 'disabled' : ''}>${icon('plus')}</button></div>`;
}

const r4 = (v: number): number => Math.round(v * 10000) / 10000;

/** Dotyk jako główny wskaźnik (telefon, tablet): większe strefy chwytu. */
const coarsePointer = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

/** Prostokąt przycięty do kartki. */
function clampBox(b: Box): Box {
  const w = clamp(b.w, 0.004, 1);
  const h = clamp(b.h, 0.004, 1);
  return { x: clamp(b.x, 0, 1 - w), y: clamp(b.y, 0, 1 - h), w, h };
}

/** Zakres punktacji: dowolny, od–do (także domyślny 0–50 bez zapisanego zakresu) albo lista. */
function rangeMode(l: LineDef): RangeMode {
  if (l.free) return 'free';
  return l.min == null && l.max == null && l.values ? 'list' : 'range';
}
