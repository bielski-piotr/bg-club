// Model notesu: szablon (wygląd + siatka pól + reguły liczenia) i dane jednej kartki.

import type { Ink } from './util';
import { clamp, fmtDate, inkDone, range } from './util';
import type { SheetShape } from './shape';
import { normalizeShape } from './shape';

export type LineKind = 'input' | 'names' | 'sum' | 'bonus' | 'total' | 'skip';
export type IconKind =
  | 'd1'
  | 'd2'
  | 'd3'
  | 'd4'
  | 'd5'
  | 'd6'
  | 'x3'
  | 'x4'
  | 'full'
  | 'small'
  | 'big'
  | 'gen'
  | 'chance'
  | 'sum'
  | 'plus'
  | 'house'
  | 'route'
  | 'card'
  | 'crate'
  | 'coin'
  | 'flag'
  | 'star'
  | 'minus';

/** Jedna kategoria punktacji (wiersz, gdy gracze są w kolumnach; kolumna, gdy w wierszach). */
export interface LineDef {
  id: string;
  label: string;
  hint?: string;
  kind: LineKind;
  /** Jawna lista dozwolonych wartości (np. [25] albo wielokrotności). */
  values?: number[];
  /** Zakres dozwolonych wartości (zamiast listy): od, do, co ile. */
  min?: number;
  max?: number;
  step?: number;
  /** Dowolna liczba całkowita (bez ograniczeń zakresu). */
  free?: boolean;
  scratch?: boolean;
  /** Dla sumy, premii i wyniku: identyfikatory sumowanych kategorii. */
  of?: string[];
  threshold?: number;
  bonus?: number;
  icon?: IconKind;
}

/**
 * Siatka pól w znormalizowanych współrzędnych kartki (0…1, od lewego górnego rogu).
 * players = "cols": x[] to granice kolumn (najpierw `labels` kolumn opisu, potem gracze), y[] to granice kategorii.
 * players = "rows": y[] to granice wierszy (najpierw `labels` wierszy opisu, potem gracze), x[] to granice kategorii.
 */
export interface GridDef {
  x: number[];
  y: number[];
  players: 'cols' | 'rows';
  labels: number;
  /** Ścieżki na osi graczy (indeksy kolumn/wierszy siatki), w które się nie wpisuje. */
  blank?: number[];
}

/**
 * Pole o dowolnym położeniu i rozmiarze (nie wiersz ani kolumna siatki), np. kratka na planszy gracza.
 * Należy do kategorii (`line`) i gracza (`p`); wartości wszystkich pól kategorii gracza sumują się.
 * Pole kategorii „Imiona” pokazuje imię gracza, a pole sumy lub wyniku — policzoną wartość.
 */
export interface FreeField {
  id: string;
  line: string;
  p: number;
  x: number;
  y: number;
  w: number;
  h: number;
  shape?: 'rect' | 'round';
}

export interface BuiltinPrint {
  title: string;
  subtitle: string;
  footer: string;
  color: string;
  tint: string;
  ornaments: IconKind[];
  corner: string;
}

export interface PadTemplate {
  v: 2;
  id: string;
  name: string;
  size: { w: number; h: number }; // centymetry
  tape: string;
  accent?: string;
  image?: string; // zdjęcie kartki (data URL), już wyprostowane i przycięte
  print?: BuiltinPrint; // nadruk generowany (wbudowane notesy)
  header?: { game: [number, number]; date: [number, number] };
  /** Siatka (tabela). Notes bez tabeli ma same pola dowolne. */
  grid?: GridDef;
  /** Kategorie punktacji; przy siatce pierwsze z nich to kolejne wiersze/kolumny, a pozostałe mają tylko pola dowolne. */
  lines: LineDef[];
  /** Pola dowolne (poza siatką albo zamiast niej). */
  fields?: FreeField[];
  /** Liczba graczy, gdy notes nie ma siatki. */
  players?: number;
  /** Kształt kartki inny niż prostokąt (wycięcia, zaokrąglenia, otwory). */
  shape?: SheetShape;
  /** Krawędź klejona do grzbietu: u góry (domyślnie) albo z lewej — notes leży wtedy poziomo. */
  binding?: 'top' | 'left';
}

export interface Entry {
  value: number;
  scratch: boolean;
  ink: Ink;
}
export interface Cell {
  cur: Entry | null;
  old: Entry | null;
  strike: Ink | null;
}
export interface NameMark {
  text: string;
  ink: Ink;
}

export interface SheetData {
  tpl: string;
  game: number;
  started: string | null;
  startInk: Ink | null;
  names: (NameMark | null)[];
  /** Pola siatki: kategoria → wpisy kolejnych graczy. */
  cells: Record<string, Cell[]>;
  /** Pola dowolne: identyfikator pola → wpis. */
  free: Record<string, Cell>;
}

export interface HistoryEntry {
  id: string;
  tpl: string;
  tplName: string;
  game: number;
  at: string;
  players: { name: string; total: number }[];
  winners: string[];
}

// ─────────────────────────────────────────────────────────── siatka

export const lineCount = (t: PadTemplate): number =>
  !t.grid ? t.lines.length : t.grid.players === 'cols' ? t.grid.y.length - 1 : t.grid.x.length - 1;
export const trackCount = (t: PadTemplate): number =>
  !t.grid ? 0 : t.grid.players === 'cols' ? t.grid.x.length - 1 : t.grid.y.length - 1;

/** Indeksy ścieżek siatki (na osi graczy), które należą do kolejnych graczy. */
export function playerTracks(t: PadTemplate): number[] {
  if (!t.grid) return [];
  const off = new Set(t.grid.blank ?? []);
  const out: number[] = [];
  for (let k = t.grid.labels; k < trackCount(t); k++) if (!off.has(k)) out.push(k);
  return out;
}

/**
 * Zabezpieczenie przed uszkodzonym plikiem (np. `players: 100000000` zamroziłoby kartę),
 * a nie limit produktu: EDT-8 nie ogranicza liczby graczy, a tylu miejsc nie ma żaden notes.
 */
export const SEAT_SANITY_LIMIT = 200;

export function playerCount(t: PadTemplate): number {
  if (t.grid) return playerTracks(t).length;
  const fromFields = Math.max(0, ...(t.fields ?? []).map((f) => f.p + 1));
  return Math.max(1, Math.floor(t.players ?? fromFields));
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function trackRect(g: GridDef, li: number, track: number): Rect {
  if (g.players === 'cols')
    return { x: g.x[track], y: g.y[li], w: g.x[track + 1] - g.x[track], h: g.y[li + 1] - g.y[li] };
  return { x: g.x[li], y: g.y[track], w: g.x[li + 1] - g.x[li], h: g.y[track + 1] - g.y[track] };
}

/** Prostokąt pola siatki (kategoria `li`, gracz `p`). */
export function fieldRect(t: PadTemplate, li: number, p: number): Rect {
  const g = t.grid as GridDef;
  return trackRect(g, li, playerTracks(t)[p] ?? g.labels);
}

export function hitField(t: PadTemplate, u: number, v: number): { li: number; p: number } | null {
  const g = t.grid;
  if (!g) return null;
  const find = (arr: number[], q: number): number => {
    for (let i = 0; i < arr.length - 1; i++) if (q >= arr[i] && q < arr[i + 1]) return i;
    return -1;
  };
  const cx = find(g.x, u);
  const cy = find(g.y, v);
  if (cx < 0 || cy < 0) return null;
  const li = g.players === 'cols' ? cy : cx;
  const p = playerTracks(t).indexOf(g.players === 'cols' ? cx : cy);
  return p < 0 ? null : { li, p };
}

// ─────────────────────────────────────────────────────────── miejsca na kartce (siatka + pola dowolne)

/** Miejsce na kartce: pole siatki albo pole dowolne. */
export interface Spot {
  key: string;
  li: number;
  p: number;
  rect: Rect;
  round: boolean;
  /** Identyfikator pola dowolnego (brak = pole siatki). */
  field?: string;
}

const spotCache = new WeakMap<PadTemplate, Spot[]>();

/** Wszystkie miejsca do pisania: najpierw siatka (kolejność kategorii), potem pola dowolne. */
export function spots(t: PadTemplate): Spot[] {
  const hit = spotCache.get(t);
  if (hit) return hit;
  const out: Spot[] = [];
  const n = playerCount(t);
  if (t.grid) {
    for (let p = 0; p < n; p++) {
      t.lines.forEach((ln, li) => {
        if (ln.kind !== 'skip' && li < lineCount(t))
          out.push({ key: `${ln.id}:${p}`, li, p, rect: fieldRect(t, li, p), round: false });
      });
    }
  }
  const idx = new Map(t.lines.map((l, i) => [l.id, i]));
  for (const f of t.fields ?? []) {
    const li = idx.get(f.line);
    if (li === undefined || f.p < 0 || f.p >= n || t.lines[li].kind === 'skip') continue;
    out.push({
      key: `f:${f.id}`,
      li,
      p: f.p,
      rect: { x: f.x, y: f.y, w: f.w, h: f.h },
      round: f.shape === 'round',
      field: f.id,
    });
  }
  spotCache.set(t, out);
  return out;
}

/** Miejsce pod punktem kartki (u, v od lewego górnego rogu). Pola dowolne mają pierwszeństwo przed siatką. */
export function hitSpot(t: PadTemplate, u: number, v: number): Spot | null {
  const all = spots(t);
  for (let i = all.length - 1; i >= 0; i--) {
    const s = all[i];
    if (!s.field) break;
    const r = s.rect;
    if (u < r.x || u > r.x + r.w || v < r.y || v > r.y + r.h) continue;
    if (s.round) {
      const dx = (u - (r.x + r.w / 2)) / (r.w / 2);
      const dy = (v - (r.y + r.h / 2)) / (r.h / 2);
      if (dx * dx + dy * dy > 1) continue;
    }
    return s;
  }
  const g = hitField(t, u, v);
  if (!g) return null;
  return all.find((s) => !s.field && s.li === g.li && s.p === g.p) ?? null;
}

/** Wpis w danym miejscu kartki. */
export function cellOf(d: SheetData, t: PadTemplate, s: Spot): Cell | null {
  if (s.field) return d.free[s.field] ?? null;
  return d.cells[t.lines[s.li].id]?.[s.p] ?? null;
}

export function uniform(a: number, b: number, n: number): number[] {
  return range(0, n).map((i) => a + ((b - a) * i) / n);
}

// ─────────────────────────────────────────────────────────── liczenie

export const isComputed = (k: LineKind): boolean => k === 'sum' || k === 'bonus' || k === 'total';
export const isNumeric = (k: LineKind): boolean => k === 'input' || isComputed(k);

/** Kategorie sumowane przez linię `i` (jawna lista albo domyślna). */
export function effectiveOf(t: PadTemplate, i: number): string[] {
  const ln = t.lines[i];
  const ids = new Set(t.lines.map((l) => l.id));
  if (ln.of) return ln.of.filter((id) => id !== ln.id && ids.has(id));
  const inputsBetween = (a: number, b: number): string[] =>
    t.lines
      .slice(a, b)
      .filter((l) => l.kind === 'input')
      .map((l) => l.id);
  if (ln.kind === 'total')
    return t.lines.filter((l) => l.kind === 'input' || l.kind === 'bonus').map((l) => l.id);
  // początek bieżącego odcinka: za poprzednią sumą
  let start = 0;
  for (let k = i - 1; k >= 0; k--) {
    if (t.lines[k].kind === 'sum') {
      if (ln.kind === 'bonus') return effectiveOf(t, k);
      start = k + 1;
      break;
    }
  }
  return inputsBetween(start, i);
}

/** Wszystkie kategorie punktowe, z których (pośrednio) składa się lista. */
export function inputLeaves(t: PadTemplate, ids: string[], seen = new Set<string>()): string[] {
  const out: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const i = t.lines.findIndex((l) => l.id === id);
    if (i < 0) continue;
    const ln = t.lines[i];
    if (ln.kind === 'input') out.push(id);
    else if (ln.kind === 'sum' || ln.kind === 'total')
      out.push(...inputLeaves(t, effectiveOf(t, i), seen));
  }
  return out;
}

/**
 * Suma (`total`), która rozstrzyga o zwycięzcy: ostatnia z tych, których nie sumuje
 * żadna inna (gdy jedna suma zbiera kilka innych, decyduje ta zbierająca).
 */
export function finalTotalIndex(t: PadTemplate): number {
  const totals = t.lines.map((l, i) => (l.kind === 'total' ? i : -1)).filter((i) => i >= 0);
  if (!totals.length) return -1;
  const used = new Set<string>();
  for (const i of totals) for (const id of effectiveOf(t, i)) used.add(id);
  const top = totals.filter((i) => !used.has(t.lines[i].id));
  return (top.length ? top : totals)[(top.length ? top : totals).length - 1];
}

/** Sumy, premie i wynik końcowy jednego gracza. */
export function computePlayer(
  t: PadTemplate,
  v: Record<string, number | null>,
): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  const idx = new Map(t.lines.map((l, i) => [l.id, i]));
  const memo = new Map<string, number | null>();
  const active = new Set<string>();
  const val = (id: string): number | null => {
    const i = idx.get(id);
    if (i === undefined) return null;
    const ln = t.lines[i];
    if (ln.kind === 'input') return v[id] ?? null;
    if (!isComputed(ln.kind)) return null;
    if (memo.has(id)) return memo.get(id) as number | null;
    if (active.has(id)) return null; // pętla w definicji sum
    active.add(id);
    const of = effectiveOf(t, i);
    const parts = of.map(val);
    const s = parts.some((x) => x != null) ? parts.reduce<number>((a, b) => a + (b ?? 0), 0) : null;
    let r: number | null = s;
    if (ln.kind === 'bonus') {
      const leaves = inputLeaves(t, of);
      const done = leaves.length > 0 && leaves.every((x) => v[x] != null);
      r = s != null && s >= (ln.threshold ?? 0) ? (ln.bonus ?? 0) : done ? 0 : null;
    }
    active.delete(id);
    memo.set(id, r);
    return r;
  };
  for (const ln of t.lines) if (isComputed(ln.kind)) out[ln.id] = val(ln.id);
  const fi = finalTotalIndex(t);
  if (fi >= 0) out.__total = out[t.lines[fi].id] ?? null;
  else {
    const ids = t.lines.filter((l) => l.kind === 'input' || l.kind === 'bonus').map((l) => l.id);
    const parts = ids.map(val);
    out.__total = parts.some((x) => x != null)
      ? parts.reduce<number>((a, b) => a + (b ?? 0), 0)
      : null;
  }
  return out;
}

// ─────────────────────────────────────────────────────────── dane kartki

export function blankSheet(t: PadTemplate, game: number): SheetData {
  const n = playerCount(t);
  const cells: Record<string, Cell[]> = {};
  if (t.grid)
    for (const l of t.lines)
      if (l.kind === 'input')
        cells[l.id] = Array.from({ length: n }, () => ({ cur: null, old: null, strike: null }));
  const free: Record<string, Cell> = {};
  const kinds = new Map(t.lines.map((l) => [l.id, l.kind]));
  for (const f of t.fields ?? [])
    if (kinds.get(f.line) === 'input') free[f.id] = { cur: null, old: null, strike: null };
  return {
    tpl: t.id,
    game,
    started: null,
    startInk: null,
    names: Array(n).fill(null),
    cells,
    free,
  };
}

/** Wartości kategorii punktowych gracza: pole siatki plus suma jego pól dowolnych danej kategorii. */
export function valuesOf(t: PadTemplate, d: SheetData, p: number): Record<string, number | null> {
  const v: Record<string, number | null> = {};
  for (const l of t.lines) {
    if (l.kind !== 'input') continue;
    let any = false;
    let sum = 0;
    const c = d.cells[l.id]?.[p]?.cur;
    if (c) {
      any = true;
      sum += c.value;
    }
    v[l.id] = any ? sum : null;
  }
  for (const f of t.fields ?? []) {
    if (f.p !== p || !(f.line in v)) continue;
    const c = d.free[f.id]?.cur;
    if (!c) continue;
    v[f.line] = (v[f.line] ?? 0) + c.value;
  }
  return v;
}

export function playerActive(t: PadTemplate, d: SheetData, p: number): boolean {
  if (d.names[p]) return true;
  if (Object.keys(d.cells).some((id) => d.cells[id][p]?.cur)) return true;
  return (t.fields ?? []).some((f) => f.p === p && d.free[f.id]?.cur);
}

export function anyValue(d: SheetData): boolean {
  return (
    Object.keys(d.cells).some((id) => d.cells[id].some((c) => c.cur)) ||
    Object.values(d.free ?? {}).some((c) => c.cur)
  );
}

/** Dopasowuje zapisane dane do (być może zmienionego) szablonu. */
export function normalizeSheet(raw: unknown, t: PadTemplate): SheetData {
  const base = blankSheet(t, 1);
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<SheetData>;
  base.game = typeof r.game === 'number' && r.game > 0 ? Math.floor(r.game) : 1;
  base.started = typeof r.started === 'string' ? r.started : null;
  base.startInk = base.started ? inkDone() : null;
  if (Array.isArray(r.names)) {
    base.names = base.names.map((_, p) => {
      const n = r.names?.[p];
      return n && typeof n.text === 'string' ? { text: n.text.slice(0, 14), ink: inkDone() } : null;
    });
  }
  const fix = (e: Entry | null | undefined): Entry | null =>
    e && typeof e.value === 'number'
      ? { value: e.value, scratch: !!e.scratch, ink: inkDone() }
      : null;
  const fixCell = (s: Cell | undefined, c: Cell): Cell =>
    s ? { cur: fix(s.cur), old: fix(s.old), strike: s.old ? inkDone() : null } : c;
  if (r.cells && typeof r.cells === 'object') {
    for (const id in base.cells) {
      const rc = (r.cells as Record<string, Cell[]>)[id];
      if (!Array.isArray(rc)) continue;
      base.cells[id] = base.cells[id].map((c, p) => fixCell(rc[p], c));
    }
  }
  if (r.free && typeof r.free === 'object') {
    for (const id in base.free)
      base.free[id] = fixCell((r.free as Record<string, Cell>)[id], base.free[id]);
  }
  return base;
}

/** Sprawdza i uzupełnia szablon wczytany z JSON-a. */
export function validateTemplate(raw: unknown): PadTemplate | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<PadTemplate>;
  if (!Array.isArray(r.lines)) return null;
  const g = r.grid && Array.isArray(r.grid.x) && Array.isArray(r.grid.y) ? r.grid : null;
  const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : NaN);
  const fields: FreeField[] = (Array.isArray(r.fields) ? r.fields : [])
    .map((f, i) => ({
      id: typeof f?.id === 'string' && f.id ? f.id : `f${i}`,
      line: String(f?.line ?? ''),
      p: Math.max(0, Math.floor(num(f?.p)) || 0),
      x: clamp(num(f?.x), 0, 1),
      y: clamp(num(f?.y), 0, 1),
      w: clamp(num(f?.w), 0, 1),
      h: clamp(num(f?.h), 0, 1),
      shape: f?.shape === 'round' ? ('round' as const) : ('rect' as const),
    }))
    .filter(
      (f) =>
        f.line &&
        f.p < SEAT_SANITY_LIMIT &&
        f.w > 0.002 &&
        f.h > 0.002 &&
        Number.isFinite(f.x + f.y + f.w + f.h),
    );
  if (!g && !fields.length) return null;
  const t: PadTemplate = {
    v: 2,
    id: typeof r.id === 'string' && r.id ? r.id : `n-${Math.random().toString(36).slice(2, 9)}`,
    name: typeof r.name === 'string' && r.name ? r.name.slice(0, 40) : 'Notes',
    size: { w: clamp(Number(r.size?.w) || 10, 4, 40), h: clamp(Number(r.size?.h) || 14, 4, 40) },
    tape: typeof r.tape === 'string' ? r.tape : '#2c3a46',
    accent: typeof r.accent === 'string' ? r.accent : undefined,
    image: typeof r.image === 'string' ? r.image : undefined,
    print: r.print,
    header: r.header,
    grid: g
      ? {
          x: g.x.map(Number),
          y: g.y.map(Number),
          players: g.players === 'rows' ? 'rows' : 'cols',
          labels: clamp(Number(g.labels) || 0, 0, 4),
          blank: Array.isArray(g.blank)
            ? g.blank.map(Number).filter((n) => Number.isInteger(n))
            : undefined,
        }
      : undefined,
    fields: fields.length ? fields : undefined,
    shape: normalizeShape(r.shape),
    binding: r.binding === 'left' ? 'left' : undefined,
    players: g
      ? undefined
      : Math.min(
          SEAT_SANITY_LIMIT,
          Math.max(1, Math.floor(num(r.players)) || Math.max(1, ...fields.map((f) => f.p + 1))),
        ),
    lines: r.lines.map((l, i) => ({
      id: typeof l.id === 'string' && l.id ? l.id : `l${i}`,
      label: typeof l.label === 'string' ? l.label : `Kategoria ${i + 1}`,
      hint: l.hint,
      kind: (['input', 'names', 'sum', 'bonus', 'total', 'skip'].includes(l.kind)
        ? l.kind
        : 'input') as LineKind,
      values: Array.isArray(l.values)
        ? l.values
            .map(Number)
            .filter((n) => isFinite(n))
            .slice(0, 400)
        : undefined,
      min: Number.isFinite(Number(l.min)) && l.min != null ? Number(l.min) : undefined,
      max: Number.isFinite(Number(l.max)) && l.max != null ? Number(l.max) : undefined,
      step:
        Number.isFinite(Number(l.step)) && l.step != null
          ? Math.max(1, Math.abs(Number(l.step)))
          : undefined,
      free: !!l.free,
      scratch: !!l.scratch,
      of: Array.isArray(l.of) ? l.of.map(String) : undefined,
      threshold: l.threshold,
      bonus: l.bonus,
      icon: l.icon,
    })),
  };
  // kategorii może być więcej niż pasów siatki: nadmiarowe mają tylko pola dowolne
  if (t.grid && lineCount(t) > t.lines.length) return null;
  // bez limitu graczy (EDT-8): o liczbie miejsc decyduje sam notes; odrzucamy tylko uszkodzone pliki
  if (playerCount(t) < 1 || playerCount(t) > SEAT_SANITY_LIMIT) return null;
  const ids = new Set(t.lines.map((l) => l.id));
  if (t.fields) t.fields = t.fields.filter((f) => ids.has(f.line));
  return t;
}

// ─────────────────────────────────────────────────────────── notesy wbudowane

const multiples = (n: number): number[] => [1, 2, 3, 4, 5].map((k) => k * n);
const PX_W = 1024;
const PX_H = 1434;

function builtinGrid(heights: number[]): GridDef {
  const x0 = 74;
  const x1 = PX_W - 74;
  const labelW = 316;
  const colW = (x1 - x0 - labelW) / 4;
  const xs = [
    x0,
    x0 + labelW,
    x0 + labelW + colW,
    x0 + labelW + 2 * colW,
    x0 + labelW + 3 * colW,
    x1,
  ].map((v) => v / PX_W);
  const ys = [306];
  for (const h of heights) ys.push(ys[ys.length - 1] + h);
  return { x: xs, y: ys.map((v) => v / PX_H), players: 'cols', labels: 1 };
}

const GEN_UP = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'];
const GEN_LO = ['three', 'four', 'full', 'small', 'big', 'gen', 'chance'];

const generalLines: (LineDef & { h: number })[] = [
  { id: 'names', label: 'Gracze', kind: 'names', h: 72 },
  {
    id: 'ones',
    label: 'Jedynki',
    hint: 'suma jedynek',
    kind: 'input',
    icon: 'd1',
    values: multiples(1),
    scratch: true,
    h: 56,
  },
  {
    id: 'twos',
    label: 'Dwójki',
    hint: 'suma dwójek',
    kind: 'input',
    icon: 'd2',
    values: multiples(2),
    scratch: true,
    h: 56,
  },
  {
    id: 'threes',
    label: 'Trójki',
    hint: 'suma trójek',
    kind: 'input',
    icon: 'd3',
    values: multiples(3),
    scratch: true,
    h: 56,
  },
  {
    id: 'fours',
    label: 'Czwórki',
    hint: 'suma czwórek',
    kind: 'input',
    icon: 'd4',
    values: multiples(4),
    scratch: true,
    h: 56,
  },
  {
    id: 'fives',
    label: 'Piątki',
    hint: 'suma piątek',
    kind: 'input',
    icon: 'd5',
    values: multiples(5),
    scratch: true,
    h: 56,
  },
  {
    id: 'sixes',
    label: 'Szóstki',
    hint: 'suma szóstek',
    kind: 'input',
    icon: 'd6',
    values: multiples(6),
    scratch: true,
    h: 56,
  },
  {
    id: 'upper',
    label: 'Suma górna',
    hint: 'jedynki – szóstki',
    kind: 'sum',
    icon: 'sum',
    of: GEN_UP,
    h: 50,
  },
  {
    id: 'bonus',
    label: 'Premia',
    hint: '35 pkt przy sumie ≥ 63',
    kind: 'bonus',
    icon: 'plus',
    of: GEN_UP,
    threshold: 63,
    bonus: 35,
    h: 50,
  },
  {
    id: 'three',
    label: 'Trójka',
    hint: '3 jednakowe · suma oczek',
    kind: 'input',
    icon: 'x3',
    values: range(5, 30),
    scratch: true,
    h: 56,
  },
  {
    id: 'four',
    label: 'Kareta',
    hint: '4 jednakowe · suma oczek',
    kind: 'input',
    icon: 'x4',
    values: range(5, 30),
    scratch: true,
    h: 56,
  },
  {
    id: 'full',
    label: 'Full',
    hint: '3 + 2 jednakowe · 25 pkt',
    kind: 'input',
    icon: 'full',
    values: [25],
    scratch: true,
    h: 56,
  },
  {
    id: 'small',
    label: 'Mały strit',
    hint: '4 kolejne · 30 pkt',
    kind: 'input',
    icon: 'small',
    values: [30],
    scratch: true,
    h: 56,
  },
  {
    id: 'big',
    label: 'Duży strit',
    hint: '5 kolejnych · 40 pkt',
    kind: 'input',
    icon: 'big',
    values: [40],
    scratch: true,
    h: 56,
  },
  {
    id: 'gen',
    label: 'Generał',
    hint: '5 jednakowych · 50 pkt',
    kind: 'input',
    icon: 'gen',
    values: [50],
    scratch: true,
    h: 56,
  },
  {
    id: 'chance',
    label: 'Szansa',
    hint: 'dowolny układ · suma oczek',
    kind: 'input',
    icon: 'chance',
    values: range(5, 30),
    scratch: true,
    h: 56,
  },
  {
    id: 'lower',
    label: 'Suma dolna',
    hint: 'trójka – szansa',
    kind: 'sum',
    icon: 'sum',
    of: GEN_LO,
    h: 50,
  },
  { id: 'total', label: 'Razem', kind: 'total', h: 68 },
];

const kolonieLines: (LineDef & { h: number })[] = [
  { id: 'names', label: 'Gracze', kind: 'names', h: 72 },
  {
    id: 'buildings',
    label: 'Budynki',
    hint: 'wartości z kafelków',
    kind: 'input',
    icon: 'house',
    values: range(0, 40),
    h: 102,
  },
  {
    id: 'routes',
    label: 'Trasy handlowe',
    hint: '2 pkt za każdy odcinek',
    kind: 'input',
    icon: 'route',
    values: range(0, 30, 2),
    h: 102,
  },
  {
    id: 'goals',
    label: 'Karty celów',
    hint: 'spełnione cele',
    kind: 'input',
    icon: 'card',
    values: range(0, 40),
    h: 102,
  },
  {
    id: 'goods',
    label: 'Surowce',
    hint: '1 pkt za 3 surowce',
    kind: 'input',
    icon: 'crate',
    values: range(0, 15),
    h: 102,
  },
  {
    id: 'coins',
    label: 'Monety',
    hint: '1 pkt za 5 monet',
    kind: 'input',
    icon: 'coin',
    values: range(0, 20),
    h: 102,
  },
  {
    id: 'majority',
    label: 'Przewagi',
    hint: 'większość w regionach',
    kind: 'input',
    icon: 'flag',
    values: range(0, 21, 3),
    h: 102,
  },
  {
    id: 'bonus',
    label: 'Bonus końcowy',
    hint: 'karty i żetony bonusów',
    kind: 'input',
    icon: 'star',
    values: range(0, 25),
    h: 102,
  },
  {
    id: 'penalty',
    label: 'Kary',
    hint: 'niewykonane zlecenia',
    kind: 'input',
    icon: 'minus',
    values: range(0, -20, -1),
    h: 102,
  },
  { id: 'total', label: 'Razem', kind: 'total', h: 84 },
];

const strip = (ls: (LineDef & { h: number })[]): LineDef[] => ls.map(({ h: _h, ...l }) => l);
const header = {
  game: [224 / PX_W, 266 / PX_H] as [number, number],
  date: [452 / PX_W, 267 / PX_H] as [number, number],
};

export const BUILTINS: PadTemplate[] = [
  {
    v: 2,
    id: 'general',
    name: 'Generał',
    size: { w: 10, h: 14 },
    tape: '#173a33',
    accent: '#1f4b43',
    print: {
      title: 'Generał',
      subtitle: 'notes do gry w kości',
      footer: 'Premia 35 pkt, gdy suma części górnej wynosi co najmniej 63.',
      color: '#1f4b43',
      tint: 'rgba(31, 75, 67, 0.085)',
      ornaments: ['d1', 'd2', 'd3', 'd4', 'd5'],
      corner: '13 rzutów · do 4 graczy',
    },
    header,
    grid: builtinGrid(generalLines.map((l) => l.h)),
    lines: strip(generalLines),
  },
  {
    v: 2,
    id: 'kolonie',
    name: 'Kolonie',
    size: { w: 10, h: 14 },
    tape: '#4a1824',
    accent: '#6b2333',
    print: {
      title: 'Kolonie',
      subtitle: 'arkusz punktacji końcowej',
      footer: 'Remis rozstrzyga większa liczba monet.',
      color: '#6b2333',
      tint: 'rgba(107, 35, 51, 0.08)',
      ornaments: ['house', 'route', 'coin', 'flag', 'star'],
      corner: 'do 4 graczy',
    },
    header,
    grid: builtinGrid(kolonieLines.map((l) => l.h)),
    lines: strip(kolonieLines),
  },
];

export function exampleGeneral(t: PadTemplate): SheetData {
  const d = blankSheet(t, 1);
  d.names = ['Ania', 'Kuba', 'Zosia', 'Marek'].map((text) => ({ text, ink: inkDone() }));
  const set = (row: string, vals: (number | 'x' | null)[]): void =>
    vals.forEach((v, p) => {
      if (v === null) return;
      d.cells[row][p].cur = { value: v === 'x' ? 0 : v, scratch: v === 'x', ink: inkDone() };
    });
  set('ones', [3, 2, 4, 2]);
  set('twos', [6, 8, 4, 6]);
  set('threes', [9, 12, 6, 9]);
  set('fours', [12, 8, 16, 8]);
  set('fives', [15, 20, 10, 15]);
  set('sixes', [24, 18, null, 18]);
  set('three', [24, null, 17, 21]);
  set('four', [null, 22, null, null]);
  set('full', [25, 25, 'x', 25]);
  set('small', [30, null, 30, null]);
  set('big', [null, 40, null, null]);
  set('chance', [21, 23, 19, 22]);
  d.cells.three[2].old = { value: 14, scratch: false, ink: inkDone() };
  d.cells.three[2].strike = inkDone();
  d.started = fmtDate(new Date());
  d.startInk = inkDone();
  return d;
}

export const FREE_MIN = -9999;
export const FREE_MAX = 99999;

const hasRange = (l: LineDef): boolean => l.min != null && l.max != null;

/** Zakres dozwolonych wartości kategorii (domyślnie 0–50). */
export function bounds(l: LineDef): { min: number; max: number; step: number } {
  if (l.free) return { min: FREE_MIN, max: FREE_MAX, step: 1 };
  if (hasRange(l)) {
    const a = l.min as number;
    const b = l.max as number;
    return { min: Math.min(a, b), max: Math.max(a, b), step: Math.max(1, Math.abs(l.step ?? 1)) };
  }
  const v = l.values;
  if (!v || !v.length) return { min: 0, max: 50, step: 1 };
  const st = v.length > 1 ? Math.abs(v[1] - v[0]) : 1;
  return { min: Math.min(...v), max: Math.max(...v), step: st || 1 };
}

/** Czy wartość może trafić do pola tej kategorii. */
export function isAllowed(l: LineDef, n: number): boolean {
  if (!Number.isInteger(n)) return false;
  if (!l.free && !hasRange(l) && l.values?.length) return l.values.includes(n);
  const b = bounds(l);
  return n >= b.min && n <= b.max && (n - b.min) % b.step === 0;
}

export function canBeNegative(l: LineDef): boolean {
  return bounds(l).min < 0;
}

/** Następna dozwolona wartość w górę (dir = 1) albo w dół (strzałki w polu). */
export function stepValue(l: LineDef, cur: number | null, dir: 1 | -1): number {
  if (!l.free && !hasRange(l) && l.values?.length) {
    const v = [...l.values].sort((a, b) => a - b);
    if (cur == null || !Number.isFinite(cur)) return dir > 0 ? v[0] : v[v.length - 1];
    const next = dir > 0 ? v.find((x) => x > cur) : [...v].reverse().find((x) => x < cur);
    return next ?? cur;
  }
  const b = bounds(l);
  if (cur == null || !Number.isFinite(cur))
    return clamp(0, b.min, b.max) - ((clamp(0, b.min, b.max) - b.min) % b.step);
  const aligned = cur - ((((cur - b.min) % b.step) + b.step) % b.step);
  const next =
    dir > 0
      ? aligned === cur
        ? cur + b.step
        : aligned + b.step
      : aligned === cur
        ? cur - b.step
        : aligned;
  return clamp(next, b.min, b.max);
}

/** Ile znaków ma najdłuższa możliwa wartość (do dobrania wielkości pisma). */
export function digitsOf(l: LineDef): number {
  if (l.free) return 3;
  if (!hasRange(l) && l.values?.length) return Math.max(...l.values.map((v) => String(v).length));
  const b = bounds(l);
  return Math.max(String(b.min).length, String(b.max).length);
}

const fmtNum = (n: number): string => (n < 0 ? `−${-n}` : String(n));

/** Opis dozwolonych wartości, np. „od 0 do 40”, „od −20 do 0 co 2”, „25”. */
export function describeValues(l: LineDef): string {
  if (l.free) return 'dowolna liczba całkowita';
  if (!hasRange(l) && l.values?.length) {
    const v = l.values;
    if (v.length === 1) return fmtNum(v[0]);
    const st = v[1] - v[0];
    const regular = v.every((x, i) => i === 0 || x - v[i - 1] === st);
    if (!regular)
      return v.length <= 8 ? v.map(fmtNum).join(', ') : `${v.slice(0, 6).map(fmtNum).join(', ')}…`;
  }
  const b = bounds(l);
  if (b.min === b.max) return fmtNum(b.min);
  return b.step === 1
    ? `od ${fmtNum(b.min)} do ${fmtNum(b.max)}`
    : `od ${fmtNum(b.min)} do ${fmtNum(b.max)} co ${b.step}`;
}
