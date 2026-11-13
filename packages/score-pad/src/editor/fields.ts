// Krok 3 edytora: pola punktacji — tabela (wiersze i kolumny), pola dowolne i kategorie.

import type { Ranking } from '@bg-club/scoring';
import { parseRanking } from '@bg-club/scoring';
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
import { detectLines } from './photo';
import { icon } from './icons';

export interface Draft {
  name: string;
  tape: string;
  /** Tabela: zawsze jest, wyznacza kolumny (albo wiersze) graczy. */
  grid: GridDef;
  /** Kategorie: pierwsze `rows()` to wiersze tabeli, reszta ma tylko pola dowolne. */
  lines: LineDef[];
  fields: FreeField[];
  /** Reguła miejsc wczytanego notesu (EDT-7); edycję reguły przyniesie krok „Kategorie”. */
  ranking?: Ranking;
}

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
}

type Box = { x: number; y: number; w: number; h: number };
type FreeDrag =
  | { kind: 'new'; x0: number; y0: number; box: Box | null }
  | { kind: 'move'; x0: number; y0: number; orig: Map<string, Box>; moved: boolean }
  | { kind: 'resize'; id: string };

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

export function freshDraft(): Draft {
  return {
    name: 'Mój notes',
    tape: '#22304a',
    grid: { x: [0.06, 0.94], y: [0.05, 0.11], players: 'cols', labels: 1 },
    lines: [],
    fields: [],
  };
}

export class FieldsStep {
  draft: Draft = freshDraft();
  mode: 'grid' | 'free' = 'grid';
  /** Czy krok był już otwarty (wykrywanie tabeli tylko za pierwszym razem). */
  ready = false;
  /** Aktywna kategoria (indeks). */
  private sel = 0;
  /** Gracz, dla którego rysuje się pola dowolne. */
  private activeP = 0;
  private fsel = new Set<string>();
  private fdrag: FreeDrag | null = null;
  private gdrag: { axis: 'x' | 'y'; i: number } | null = null;
  private lastSize = { w: 0.06, h: 0.04 };
  private dupOffset: { dx: number; dy: number } | null = null;
  private lastDup: string[] = [];
  private open = new Set<string>();
  /** Świeżo dodane pole lub kategoria (krótka animacja). */
  private fresh = '';

  constructor(private h: FieldsHost) {
    this.resetGrid(1, 4, 1, { x0: 0.06, y0: 0.05, x1: 0.94, y1: 0.11 });
  }

  /** Nowe zdjęcie: tabela i pola od nowa (nazwa i kolor grzbietu zostają). */
  reset(): void {
    const { name, tape } = this.draft;
    this.draft = { ...freshDraft(), name, tape };
    this.resetGrid(1, 4, 1, { x0: 0.06, y0: 0.05, x1: 0.94, y1: 0.11 });
    this.ready = false;
    this.mode = 'grid';
    this.sel = 0;
    this.activeP = 0;
    this.fsel.clear();
    this.open.clear();
    this.dupOffset = null;
    this.lastDup = [];
  }

  // ─────────────────────────────────────────────── model

  tpl(): PadTemplate {
    const d = this.draft;
    return {
      v: 2,
      id: 'draft',
      name: d.name,
      size: { w: 10, h: 14 },
      tape: d.tape,
      grid: d.grid,
      lines: d.lines,
      fields: d.fields,
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

  /** Liczba wierszy (kategorii) tabeli. */
  rows(): number {
    return this.catAxis().length - 1;
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
    this.sel = clamp(this.sel, 0, this.draft.lines.length - 1);
  }

  /** Usuwa ślady kategorii (sumy, pola dowolne). */
  private forget(id: string): void {
    for (const l of this.draft.lines) if (l.of) l.of = l.of.filter((x) => x !== id);
    this.draft.fields = this.draft.fields.filter((f) => f.line !== id);
  }

  private frame(): { x0: number; y0: number; x1: number; y1: number } {
    const g = this.draft.grid;
    return { x0: g.x[0], y0: g.y[0], x1: g.x[g.x.length - 1], y1: g.y[g.y.length - 1] };
  }

  /** Rozkłada linie równo w ramce. */
  private resetGrid(lines: number, players: number, labels: number, fr = this.frame()): void {
    const g = this.draft.grid;
    const old = this.draft.lines.length ? this.rows() : 0;
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

  /** Wykrywa linie tabeli na zdjęciu. Zwraca, czy się udało. */
  autoLines(first: boolean): boolean {
    const sheet = this.h.sheet;
    if (!sheet) return false;
    const g = this.draft.grid;
    const fr = first ? { x0: 0.01, y0: 0.01, x1: 0.99, y1: 0.99 } : this.frame();
    const pad = first ? 0 : 0.015;
    const res = detectLines(sheet, {
      x0: Math.max(0, fr.x0 - pad),
      y0: Math.max(0, fr.y0 - pad),
      x1: Math.min(1, fr.x1 + pad),
      y1: Math.min(1, fr.y1 + pad),
    });
    if (res.xs.length < 3 || res.ys.length < 3) return false;
    const cols = g.players === 'cols';
    const catAx = cols ? res.ys : res.xs;
    const plAx = cols ? res.xs : res.ys;
    const openCat = cols ? res.openRows : res.openCols;
    const openPl = cols ? res.openCols : res.openRows;
    // ścieżki opisu: pierwsze, wyraźnie inne niż (równe) kolumny graczy
    const widths = plAx.slice(1).map((v, i) => v - plAx[i]);
    const tail = widths.slice(Math.floor(widths.length / 2)).sort((a, b) => a - b);
    const med = tail[tail.length >> 1] || 1;
    let labels = 0;
    while (labels < Math.min(2, widths.length - 1) && Math.abs(widths[labels] - med) / med > 0.35)
      labels++;
    if (first) {
      // samo, bez prośby: tylko wyraźna tabela (zbliżone wiersze, spora część kartki) — plansza bez tabeli zostaje pusta
      const hs = catAx
        .slice(1)
        .map((v, i) => v - catAx[i])
        .sort((a, b) => a - b);
      const med = hs[hs.length >> 1] || 1;
      const area = (plAx[plAx.length - 1] - plAx[0]) * (catAx[catAx.length - 1] - catAx[0]);
      if (
        hs.length < 2 ||
        hs[hs.length - 1] > med * 3.2 ||
        area < 0.2 ||
        plAx.length - 1 - labels < 1
      )
        return false;
    }
    const old = this.rows();
    if (first) {
      this.draft.lines = this.draft.lines.slice(old);
      this.setRowCount(0, catAx.length - 1);
    } else this.setRowCount(old, catAx.length - 1);
    for (const i of openCat)
      if (this.draft.lines[i] && this.draft.lines[i].kind === 'input')
        this.draft.lines[i].kind = 'skip';
    g.labels = labels;
    g.blank = openPl.filter((k) => k >= labels && k < plAx.length - 1);
    if (cols) {
      g.y = catAx;
      g.x = plAx;
    } else {
      g.x = catAx;
      g.y = plAx;
    }
    if (!this.players()) g.blank = [];
    return true;
  }

  /** Pierwsze wejście w krok: wykrycie tabeli ze zdjęcia. */
  enter(): void {
    if (!this.ready) {
      this.ready = true;
      this.autoLines(true);
    }
    if (this.mode === 'free' && !this.players()) this.mode = 'grid';
    this.activeP = clamp(this.activeP, 0, Math.max(0, this.players() - 1));
    this.renderAll();
  }

  /** Wczytuje istniejący notes do edycji. */
  load(t: PadTemplate): void {
    const lines: LineDef[] = JSON.parse(JSON.stringify(t.lines));
    const fields: FreeField[] = JSON.parse(JSON.stringify(t.fields ?? []));
    let grid: GridDef;
    if (t.grid) grid = JSON.parse(JSON.stringify(t.grid));
    else {
      // notes bez tabeli: tabela z jednym wierszem (imiona) wyznacza graczy
      const n = Math.max(1, t.players ?? Math.max(1, ...fields.map((f) => f.p + 1)));
      let ni = lines.findIndex((l) => l.kind === 'names');
      if (ni < 0) {
        lines.unshift(this.newLine(0, 'names'));
        ni = 0;
      }
      lines.unshift(...lines.splice(ni, 1));
      grid = { x: [0.06, ...uniform(0.3, 0.94, n)], y: [0.03, 0.08], players: 'cols', labels: 1 };
    }
    const ranking = t.ranking ? (JSON.parse(JSON.stringify(t.ranking)) as Ranking) : undefined;
    this.draft = { name: t.name, tape: t.tape, grid, lines, fields, ranking };
    this.ready = true;
    this.sel = 0;
    this.mode = t.fields?.length && !t.grid ? 'free' : 'grid';
  }

  // ─────────────────────────────────────────────── kategorie

  private addCategory(): void {
    const ls = this.draft.lines;
    if (this.mode === 'grid') {
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
    this.renderAll();
    requestAnimationFrame(() =>
      this.h.panel
        .querySelector<HTMLInputElement>(`.spe-cat[data-i="${this.sel}"] .spe-cat-name`)
        ?.select(),
    );
  }

  private splitRow(i: number): void {
    const arr = this.catAxis();
    arr.splice(i + 1, 0, (arr[i] + arr[i + 1]) / 2);
    const l = this.newLine(i + 1);
    this.draft.lines.splice(i + 1, 0, l);
    this.sel = i + 1;
    this.fresh = l.id;
    this.renderAll();
  }

  private removeLine(i: number): void {
    const ls = this.draft.lines;
    const rows = this.rows();
    if (i < rows) {
      if (rows <= 1) return;
      const arr = this.catAxis();
      // pierwszy i ostatni wiersz zwężają ramkę; środkowy dołącza do poprzedniego
      if (i === 0) arr.splice(0, 1);
      else if (i === rows - 1) arr.splice(arr.length - 1, 1);
      else arr.splice(i, 1);
    }
    const [gone] = ls.splice(i, 1);
    this.open.delete(gone.id);
    this.forget(gone.id);
    this.sel = clamp(Math.min(this.sel, ls.length - 1), 0, ls.length - 1);
    this.renderAll();
  }

  private addTrack(): void {
    this.extend(this.plAxis(), 'end');
    this.renderAll();
  }

  private removeTrack(): void {
    const g = this.draft.grid;
    const arr = this.plAxis();
    if (arr.length - 1 <= g.labels + 1) return;
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
    g.labels = clamp(n, 0, Math.max(0, tracks - 1));
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
    g.blank = [...set].sort((a, b) => a - b);
    this.activeP = clamp(this.activeP, 0, Math.max(0, this.players() - 1));
    this.renderAll();
  }

  private setPlayersAxis(pl: 'cols' | 'rows'): void {
    const g = this.draft.grid;
    if (pl === g.players) return;
    const old = this.rows();
    // linie tabeli zostają na miejscu — zmienia się tylko to, co jest kategorią, a co graczem
    g.players = pl;
    g.blank = [];
    const across = pl === 'cols' ? g.x : g.y;
    if (across.length - 1 - g.labels < 1) g.labels = 0;
    this.setRowCount(old, this.rows());
    this.renderAll();
  }

  /** Następna kategoria, w którą można wpisywać (po narysowaniu pola). */
  private nextDrawable(i: number): number {
    const ls = this.draft.lines;
    for (let k = i + 1; k < ls.length; k++) if (ls[k].kind !== 'skip') return k;
    return i;
  }

  private firstDrawable(): number {
    const k = this.draft.lines.findIndex((l) => l.kind !== 'skip');
    return k < 0 ? 0 : k;
  }

  // ─────────────────────────────────────────────── pola dowolne

  private addField(b: Box): FreeField | null {
    const l = this.draft.lines[this.sel];
    if (!l || l.kind === 'skip') return null;
    const f: FreeField = { id: `f${uid()}`, line: l.id, p: this.activeP, ...clampBox(b) };
    this.draft.fields.push(f);
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
    const made = src.map((f) => ({
      ...f,
      id: `f${uid()}`,
      ...clampBox({ x: f.x + dx, y: f.y + dy, w: f.w, h: f.h }),
    }));
    d.fields.push(...made);
    this.fsel = new Set(made.map((f) => f.id));
    this.renderAll();
  }

  private duplicateForNext(): void {
    const d = this.draft;
    const src = d.fields.filter((f) => this.fsel.has(f.id));
    if (!src.length) return;
    const n = this.players();
    const maxP = Math.max(...src.map((f) => f.p));
    if (maxP + 1 >= n) return;
    const bx = Math.min(...src.map((f) => f.x));
    const bw = Math.max(...src.map((f) => f.x + f.w)) - bx;
    const off = this.dupOffset ?? { dx: bw + 0.02, dy: 0 };
    const made: FreeField[] = src.map((f) => ({
      ...f,
      id: `f${uid()}`,
      p: f.p + 1,
      ...clampBox({ x: f.x + off.dx, y: f.y + off.dy, w: f.w, h: f.h }),
    }));
    d.fields.push(...made);
    this.fsel = new Set(made.map((f) => f.id));
    this.lastDup = made.map((f) => f.id);
    this.dupOffset = off;
    this.activeP = maxP + 1;
    this.renderAll();
  }

  private deleteFields(): void {
    if (!this.fsel.size) return;
    this.draft.fields = this.draft.fields.filter((f) => !this.fsel.has(f.id));
    this.fsel.clear();
    this.renderAll();
  }

  private nudge(dx: number, dy: number): void {
    for (const f of this.draft.fields) {
      if (!this.fsel.has(f.id)) continue;
      Object.assign(f, clampBox({ x: f.x + dx, y: f.y + dy, w: f.w, h: f.h }));
    }
    if (this.sameAsDup() && this.dupOffset)
      this.dupOffset = { dx: this.dupOffset.dx + dx, dy: this.dupOffset.dy + dy };
    this.h.render();
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
    if (this.mode !== 'free') return false;
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

  // ─────────────────────────────────────────────── pasek narzędzi

  renderAll(): void {
    this.renderToolbar();
    this.renderPanel();
    this.h.render();
    this.h.changed();
  }

  renderToolbar(): void {
    const tb = this.h.toolbar;
    const g = this.draft.grid;
    const cols = g.players === 'cols';
    const n = this.players();
    const tracks = this.plAxis().length - 1;
    const tabs = `<div class="spe-seg" role="tablist" aria-label="Rodzaj pól">
        <button type="button" role="tab" data-mode="grid" aria-selected="${this.mode === 'grid'}">${icon('table')}<span>Tabela</span></button>
        <button type="button" role="tab" data-mode="free" aria-selected="${this.mode === 'free'}" ${n ? '' : `disabled title="Najpierw ustaw kolumny graczy w tabeli"`}>${icon('fields')}<span>Pola dowolne</span></button>
      </div>`;
    let tools: string;
    if (this.mode === 'grid') {
      tools = `
        <div class="spe-tb-group">
          <div class="spe-seg" role="radiogroup" aria-label="Gracze w tabeli">
            <button type="button" role="radio" data-pl="cols" aria-checked="${cols}" title="Gracze w kolumnach">${icon('cols')}</button>
            <button type="button" role="radio" data-pl="rows" aria-checked="${!cols}" title="Gracze w wierszach">${icon('rows')}</button>
          </div>
          <button type="button" class="spe-tb-btn" data-a="detect" title="Wykryj linie tabeli na zdjęciu">${icon('scanTable')}<span>Wykryj</span></button>
          <button type="button" class="spe-tb-btn" data-a="even" title="Rozłóż linie równo">${icon('even')}</button>
        </div>
        <span class="spe-tb-sep"></span>
        <div class="spe-tb-group">
          ${stepper('tracks', cols ? 'Kolumny graczy' : 'Wiersze graczy', 'Gracze', tracks - g.labels, tracks - g.labels <= 1, false)}
          ${stepper('labels', cols ? 'Kolumny opisu' : 'Wiersze opisu', 'Opis', g.labels, g.labels <= 0, g.labels >= tracks - 1)}
        </div>`;
    } else {
      const sel = this.draft.fields.filter((f) => this.fsel.has(f.id));
      const canNext = sel.length > 0 && Math.max(...sel.map((f) => f.p)) + 1 < n;
      tools = `
        <div class="spe-tb-group spe-players" role="radiogroup" aria-label="Gracz">
          ${Array.from({ length: n }, (_, p) => `<button type="button" role="radio" class="spe-chip" data-p="${p}" aria-checked="${p === this.activeP}" style="--pc:${PLAYER_COLORS[p % PLAYER_COLORS.length]}" title="Rysuj pola gracza ${p + 1}">${icon('user')}<span>${p + 1}</span></button>`).join('')}
        </div>
        ${
          sel.length
            ? `<span class="spe-tb-sep"></span>
        <div class="spe-tb-group spe-pop">
          <button type="button" class="spe-tb-btn" data-a="dup" ${canNext ? '' : 'disabled'} title="Powiel dla następnego gracza">${icon('dupNext')}</button>
          <button type="button" class="spe-tb-btn" data-a="down" title="Powiel w dół">${icon('dupDown')}</button>
          <button type="button" class="spe-tb-btn" data-a="right" title="Powiel w prawo">${icon('dupRight')}</button>
          <button type="button" class="spe-tb-btn danger" data-a="del" title="Usuń (Delete)">${icon('trash')}</button>
        </div>`
            : ''
        }`;
    }
    tb.innerHTML = `<div class="spe-tb-group">${tabs}</div><span class="spe-tb-sep"></span>${tools}`;
    tb.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((b) =>
      b.addEventListener('click', () => {
        const m = b.dataset.mode as 'grid' | 'free';
        if (m === this.mode) return;
        this.mode = m;
        this.fsel.clear();
        if (m === 'free')
          this.sel = this.draft.lines[this.sel]?.kind === 'skip' ? this.firstDrawable() : this.sel;
        this.renderAll();
      }),
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
      b.addEventListener('click', () => {
        const p = Number(b.dataset.p);
        if (this.fsel.size) {
          // zaznaczone pola przechodzą do wybranego gracza
          for (const f of this.draft.fields) if (this.fsel.has(f.id)) f.p = p;
        } else if (p !== this.activeP) this.sel = this.firstDrawable();
        this.activeP = p;
        this.renderAll();
      }),
    );
    tb.querySelectorAll<HTMLButtonElement>('[data-a]').forEach((b) =>
      b.addEventListener('click', () => {
        const a = b.dataset.a;
        if (a === 'detect') {
          if (!this.autoLines(false))
            this.h.toast('Nie znalazłem linii tabeli — ustaw je ręcznie.', 'err');
          this.renderAll();
        } else if (a === 'even') {
          const tr = this.plAxis().length - 1;
          const keep = g.blank;
          this.resetGrid(this.rows(), tr - g.labels, g.labels);
          g.blank = keep;
          this.renderAll();
        } else if (a === 'dup') this.duplicateForNext();
        else if (a === 'down' || a === 'right') this.copyFields(a);
        else if (a === 'del') this.deleteFields();
      }),
    );
  }

  // ─────────────────────────────────────────────── panel: notes i kategorie

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
        <button type="button" class="spe-add" data-add title="${this.mode === 'grid' ? 'Nowy wiersz tabeli' : 'Kategoria tylko z polami dowolnymi'}">${icon('plus')}<span>Dodaj kategorię</span></button>
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
      this.mode === 'free'
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
        <span class="spe-cat-tag${row ? '' : ' free'}" title="${row ? `Wiersz ${i + 1} tabeli` : 'Tylko pola dowolne'}">${row ? i + 1 : icon('free')}</span>
        <input type="text" class="spe-cat-name" maxlength="30" data-f="label" value="${esc(l.label)}" aria-label="Nazwa kategorii ${i + 1}">
        <span class="spe-cat-hint" title="${esc(l.hint ?? '')}" aria-hidden="true">${icon('note')}</span>
        ${cnt ? `<span class="spe-cat-n" title="Pola gracza ${this.activeP + 1}">${cnt}</span>` : ''}
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

  /** Wybór kategorii; przy zaznaczonych polach dowolnych — przypisanie ich do tej kategorii. */
  private activate(i: number, quiet = false): void {
    if (this.mode === 'free' && this.fsel.size && !quiet && this.draft.lines[i]?.kind !== 'skip') {
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
    s += this.mode === 'grid' ? this.gridSvg(w, h, k) : this.freeSvg(w, h, k);
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
    // ścieżki graczy: przełącznik „bez wpisu” po kliknięciu nagłówka
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
      s += `<g data-track="${t}" class="spe-track${off ? ' off' : ''}"><title>${off ? 'Bez wpisu — kliknij, by przywrócić gracza' : 'Kliknij, by oznaczyć jako miejsce bez wpisu'}</title>
        <rect x="${cx - pw / 2}" y="${cy - ph / 2}" width="${pw}" height="${ph}" rx="${ph / 2}" fill="${color}"/>
        <text x="${cx}" y="${cy + fs * 0.36}" font-size="${fs}" class="spe-num">${off ? '—' : `G${pn}`}</text></g>`;
    }
    const lineEl = (axis: 'x' | 'y', i: number, v: number): string => {
      const outer = i === 0 || i === (axis === 'x' ? X.length - 1 : Y.length - 1);
      const [x1, y1, x2, y2] =
        axis === 'x' ? [v, Y[0], v, Y[Y.length - 1]] : [X[0], v, X[X.length - 1], v];
      return `<g data-g="${axis}" data-i="${i}" class="spe-gl ${axis}${outer ? ' outer' : ''}">
        <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="hit"/>
        <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="vis"/></g>`;
    };
    X.forEach((v, i) => (s += lineEl('x', i, v)));
    Y.forEach((v, i) => (s += lineEl('y', i, v)));
    s += this.fieldsSvg(w, h, k, false);
    return s;
  }

  private freeSvg(w: number, h: number, k: number): string {
    const g = this.draft.grid;
    let s = `<rect data-bg="1" x="0" y="0" width="${w}" height="${h}" fill="transparent" class="spe-draw"/>`;
    for (const v of g.x)
      s += `<line x1="${v * w}" y1="${g.y[0] * h}" x2="${v * w}" y2="${g.y[g.y.length - 1] * h}" class="spe-ghost-line"/>`;
    for (const v of g.y)
      s += `<line x1="${g.x[0] * w}" y1="${v * h}" x2="${g.x[g.x.length - 1] * w}" y2="${v * h}" class="spe-ghost-line"/>`;
    s += this.fieldsSvg(w, h, k, true);
    const fd = this.fdrag;
    if (fd?.kind === 'new' && fd.box) {
      const b = fd.box;
      const l = this.draft.lines[this.sel];
      s += `<rect x="${b.x * w}" y="${b.y * h}" width="${b.w * w}" height="${b.h * h}" class="spe-ghost" style="--k:${KIND_COLOR[l?.kind ?? 'input']}"/>`;
    }
    return s;
  }

  /** Pola dowolne; `live` = można je zaznaczać i przesuwać. */
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
        const hs = 10 * k;
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

  down(e: PointerEvent): void {
    const t = e.target as Element;
    if (this.mode === 'grid') {
      const gl = t.closest('[data-g]') as HTMLElement | null;
      if (gl) {
        this.gdrag = { axis: gl.dataset.g as 'x' | 'y', i: Number(gl.dataset.i) };
        this.h.capture(e);
        return;
      }
      const tr = t.closest('[data-track]') as HTMLElement | null;
      if (tr) {
        this.toggleBlank(Number(tr.dataset.track));
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
    if (hs) {
      const f = fields.find((x) => x.id === hs.dataset.fh);
      if (f) this.fdrag = { kind: 'resize', id: f.id };
    } else if (fg) {
      const id = fg.dataset.fid as string;
      if (e.shiftKey) {
        if (this.fsel.has(id)) this.fsel.delete(id);
        else this.fsel.add(id);
      } else if (!this.fsel.has(id)) this.fsel = new Set([id]);
      const orig = new Map<string, Box>();
      for (const f of fields)
        if (this.fsel.has(f.id)) orig.set(f.id, { x: f.x, y: f.y, w: f.w, h: f.h });
      this.fdrag = { kind: 'move', x0: p.x, y0: p.y, orig, moved: false };
      this.renderToolbar();
    } else if (this.fsel.size) {
      // klik obok zaznaczenia tylko je zdejmuje
      this.fsel.clear();
      this.renderToolbar();
      this.h.render();
      return;
    } else {
      const l = this.draft.lines[this.sel];
      if (!l || l.kind === 'skip') {
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
    if (this.gdrag) {
      this.gdrag = null;
      return;
    }
    const fd = this.fdrag;
    this.fdrag = null;
    if (!fd) return;
    const p = this.norm(e);
    if (fd.kind === 'new') {
      const b = fd.box;
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
        this.lastSize = { w: f.w, h: f.h };
        // od razu następna kategoria tego samego gracza — można rysować bez przerwy
        this.sel = this.nextDrawable(this.sel);
      }
      this.renderAll();
      requestAnimationFrame(() =>
        this.h.panel
          .querySelector<HTMLElement>('.spe-cat.active')
          ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }),
      );
      return;
    }
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
    return this.mode === 'free' ? 'spe-c-draw' : '';
  }

  // ─────────────────────────────────────────────── poprawność i wynik

  /** Powód, dla którego nie da się jeszcze zapisać (albo null). */
  problem(): string | null {
    const d = this.draft;
    const rows = this.rows();
    if (this.players() < 1) return 'Ustaw co najmniej jedną kolumnę gracza.';
    if (d.lines.filter((l) => l.kind === 'names').length > 1)
      return 'Tylko jedna kategoria może być „Imiona”.';
    const placed = (l: LineDef, i: number): boolean =>
      i < rows || d.fields.some((f) => f.line === l.id && f.p < this.players());
    if (!d.lines.some((l, i) => l.kind === 'input' && placed(l, i)))
      return 'Dodaj kategorię z punktami.';
    return null;
  }

  /** Część szablonu: tabela, kategorie i pola (zaokrąglone). */
  output(): Pick<PadTemplate, 'name' | 'tape' | 'grid' | 'lines' | 'fields' | 'ranking'> {
    const d = this.draft;
    const n = this.players();
    const ids = new Set(d.lines.map((l) => l.id));
    const fields = d.fields
      .filter((f) => ids.has(f.line) && f.p < n)
      .map((f) => ({ ...f, x: r4(f.x), y: r4(f.y), w: r4(f.w), h: r4(f.h) }));
    const lines: LineDef[] = d.lines.map((l) => {
      const out: LineDef = { ...l, label: l.label.trim() || 'Kategoria' };
      if (l.hint?.trim() && l.kind !== 'skip') out.hint = l.hint.trim();
      else delete out.hint;
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
      grid: {
        ...g,
        x: g.x.map(r4),
        y: g.y.map(r4),
        blank: g.blank?.length ? [...g.blank] : undefined,
      },
      lines,
      fields: fields.length ? fields : undefined,
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

/** Prostokąt przycięty do kartki. */
function clampBox(b: Box): Box {
  const w = clamp(b.w, 0.004, 1);
  const h = clamp(b.h, 0.004, 1);
  return { x: clamp(b.x, 0, 1 - w), y: clamp(b.y, 0, 1 - h), w, h };
}
