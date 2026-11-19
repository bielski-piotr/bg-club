import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PadTemplate } from './core/templates';
import { playerCount, validateTemplate } from './core/templates';
import type { FieldsHost } from './editor/fields';
import { FieldsStep } from './editor/fields';
import type * as Photo from './editor/photo';
import type { LineScan } from './editor/photo';

/*
 * Krok 3 edytora „Mapowanie pól”: prostokąty ręczne
 * z przechodzeniem po kategoriach i powielaniem dla kolejnych miejsc, wykryta tabela z poprawą
 * linii i osią graczy, wykluczające się tryby i cofanie. jsdom nie ma płótna, więc wykrywanie
 * linii tabeli zwraca przygotowany wynik.
 */

const scan = vi.hoisted(() => ({ result: null as LineScan | null }));

vi.mock('./editor/photo', async (original) => ({
  ...(await original<typeof Photo>()),
  detectLines: () =>
    scan.result ? structuredClone(scan.result) : { xs: [], ys: [], openRows: [], openCols: [] },
}));

/** Tabela 1 kolumna opisu + 4 kolumny graczy, 6 wierszy. */
const TABLE: LineScan = {
  xs: [0.05, 0.35, 0.5, 0.65, 0.8, 0.95],
  ys: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7],
  openRows: [],
  openCols: [],
};

const W = 1000;
const H = 1400;

function setup() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as SVGSVGElement;
  document.body.append(svg);
  const toast = vi.fn();
  const confirm = vi.fn(() => true);
  const host: FieldsHost = {
    svg,
    toolbar: document.createElement('div'),
    panel: document.createElement('div'),
    sheet: { width: W, height: H } as HTMLCanvasElement,
    sheetUrl: '',
    shape: () => undefined,
    scale: () => 1,
    toSvg: (e) => ({ x: e.clientX, y: e.clientY }),
    capture: () => undefined,
    // podgląd jest prawdziwy: zdarzenia wskaźnika trafiają w narysowane pola i linie
    render: () => {
      svg.innerHTML = step.draw();
    },
    changed: () => undefined,
    toast,
    confirm,
  };
  const step = new FieldsStep(host);
  return { step, svg, toast, confirm };
}

type Target = Element;
const ev = (x: number, y: number, target: Target, extra: Partial<PointerEvent> = {}) =>
  ({
    clientX: x * W,
    clientY: y * H,
    target,
    shiftKey: false,
    pointerId: 1,
    pointerType: 'mouse',
    ...extra,
  }) as unknown as PointerEvent;

/** Rysuje prostokąt (współrzędne kartki 0…1) przeciągnięciem na tle sceny. */
function draw(
  { step, svg }: ReturnType<typeof setup>,
  x: number,
  y: number,
  w = 0.1,
  h = 0.04,
): void {
  const bg = svg.querySelector('[data-bg]') ?? svg;
  step.down(ev(x, y, bg));
  step.move(ev(x + w, y + h, bg));
  step.up(ev(x + w, y + h, bg));
}

/** Przeciąga element sceny (pole albo linię tabeli) o wektor. */
function drag(
  { step }: ReturnType<typeof setup>,
  target: Element,
  from: [number, number],
  by: [number, number],
): void {
  step.down(ev(from[0], from[1], target));
  step.move(ev(from[0] + by[0] / 2, from[1] + by[1] / 2, target));
  step.move(ev(from[0] + by[0], from[1] + by[1], target));
  step.up(ev(from[0] + by[0], from[1] + by[1], target));
}

beforeEach(() => {
  scan.result = null;
  Element.prototype.scrollIntoView ??= () => undefined;
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('prostokąty ręczne', () => {
  it('kartka bez tabeli zaczyna od prostokątów; każde pole przechodzi do następnej kategorii', () => {
    const t = setup();
    t.step.enter();
    expect(t.step.state()).toMatchObject({
      mode: 'rects',
      seats: 1,
      categories: 0,
      activeCategory: 0,
      hasContent: false,
      problem: 'Narysuj na kartce pole pierwszej kategorii.',
    });
    draw(t, 0.1, 0.1);
    draw(t, 0.1, 0.2);
    draw(t, 0.1, 0.3);
    const s = t.step.state();
    expect(s).toMatchObject({ categories: 3, activeCategory: 3, seats: 1, problem: null });
    expect(t.step.draft.lines.map((l) => l.label)).toEqual([
      'Kategoria 1',
      'Kategoria 2',
      'Kategoria 3',
    ]);
    expect(
      t.step.draft.fields.map((f) => [f.p, t.step.draft.lines.findIndex((l) => l.id === f.line)]),
    ).toEqual([
      [0, 0],
      [0, 1],
      [0, 2],
    ]);
    // pole o rozmiarze z przeciągnięcia
    const [f] = t.step.draft.fields;
    expect(f?.x).toBeCloseTo(0.1);
    expect(f?.w).toBeCloseTo(0.1);
    expect(f?.h).toBeCloseTo(0.04);
  });

  it('powiela pola dla następnego miejsca, uczy się przesunięcia i działa dla ponad 8 miejsc', () => {
    const t = setup();
    t.step.enter();
    draw(t, 0.02, 0.1, 0.06, 0.04);
    draw(t, 0.02, 0.2, 0.06, 0.04);
    expect(t.step.state().canDuplicate).toBe(true);
    t.step.apply({ type: 'duplicate' });
    let s = t.step.state();
    expect(s).toMatchObject({ seats: 2, activeSeat: 1, selected: 2, problem: null });
    const seat2 = t.step.draft.fields.filter((f) => f.p === 1);
    expect(seat2).toHaveLength(2);
    // domyślnie w prawo, obok pól pierwszego miejsca
    expect(seat2[0]?.x).toBeGreaterThan(0.08);
    // przesunięcie kopii (zaznaczonych) poprawia położenie kolejnych kopii
    const copy = t.svg.querySelector(`[data-fid="${seat2[0]?.id}"]`) as Element;
    const x0 = seat2[0]?.x ?? 0;
    drag(t, copy, [x0 + 0.01, 0.11], [0.02, 0]);
    const learned = (t.step.draft.fields.find((f) => f.id === seat2[0]?.id)?.x ?? 0) - 0.02;
    expect(learned).toBeGreaterThan(0.08);
    t.step.apply({ type: 'duplicate' });
    const seat3 = t.step.draft.fields.filter((f) => f.p === 2);
    expect(seat3[0]?.x).toBeCloseTo((seat2[0]?.x ?? 0) + (seat2[0]?.x ?? 0) - 0.02, 3);

    // Bez limitu miejsc (kartka kończy się, kopie zostają na kartce)
    for (let i = 0; i < 8; i++) t.step.apply({ type: 'duplicate' });
    s = t.step.state();
    expect(s.seats).toBe(11);
    expect(s.activeSeat).toBe(10);
    expect(t.step.draft.fields).toHaveLength(22);
    for (const f of t.step.draft.fields) {
      expect(f.x + f.w).toBeLessThanOrEqual(1.0001);
      expect(f.y + f.h).toBeLessThanOrEqual(1.0001);
    }
    const out = t.step.output();
    expect(out.grid).toBeUndefined();
    expect(out.players).toBe(11);
    const tpl = validateTemplate({ v: 2, id: 'x', size: { w: 10, h: 14 }, ...out });
    expect(tpl && playerCount(tpl)).toBe(11);
  });

  it('pola drugiego miejsca rysowane ręcznie idą po brakujących kategoriach', () => {
    const t = setup();
    t.step.enter();
    for (const y of [0.1, 0.2, 0.3]) draw(t, 0.1, y);
    t.step.apply({ type: 'seats', delta: 1 });
    expect(t.step.state()).toMatchObject({
      seats: 2,
      activeSeat: 1,
      activeCategory: 0,
      problem: 'Miejsce 2 nie ma jeszcze pól.',
    });
    t.step.apply({ type: 'category', category: 1 });
    draw(t, 0.4, 0.2);
    // po kategorii 2 następna brakująca to 3
    expect(t.step.state().activeCategory).toBe(2);
    draw(t, 0.4, 0.3);
    expect(t.step.state().activeCategory).toBe(0);
    draw(t, 0.4, 0.1);
    // wszystkie kategorie mają pola: następne pole utworzy nową kategorię
    expect(t.step.state()).toMatchObject({ activeCategory: 3, problem: null });
    // miejsce 1 przejmuje rysowanie po kliknięciu jego pola
    const first = t.step.draft.fields.find((f) => f.p === 0) as { id: string };
    t.step.down(ev(0.12, 0.12, t.svg.querySelector(`[data-fid="${first.id}"]`) as Element));
    t.step.up(ev(0.12, 0.12, t.svg));
    expect(t.step.state()).toMatchObject({ activeSeat: 0, activeCategory: 0, selected: 1 });
  });

  it('usuwanie pól, kategorii i miejsc z numeracją kategorii', () => {
    const t = setup();
    t.step.enter();
    for (const y of [0.1, 0.2, 0.3]) draw(t, 0.1, y);
    t.step.apply({ type: 'duplicate' });
    t.step.apply({ type: 'category', category: 1 });
    t.step.apply({ type: 'removeCategory' });
    expect(t.step.draft.lines.map((l) => l.label)).toEqual(['Kategoria 1', 'Kategoria 2']);
    expect(t.step.draft.fields).toHaveLength(4);
    // zaznaczone kopie (miejsce 2) bez usuniętej kategorii
    expect(t.step.state().selected).toBe(2);
    t.step.apply({ type: 'delete' });
    expect(t.step.state()).toMatchObject({ seats: 2, problem: 'Miejsce 2 nie ma jeszcze pól.' });
    t.step.apply({ type: 'seats', delta: -1 });
    expect(t.step.state()).toMatchObject({ seats: 1, activeSeat: 0, problem: null });
    t.step.apply({ type: 'seats', delta: -1 });
    expect(t.step.state().seats).toBe(1);
  });

  it('kategoria bez pól blokuje przejście dalej', () => {
    const t = setup();
    t.step.enter();
    draw(t, 0.1, 0.1);
    draw(t, 0.1, 0.2);
    const second = t.step.draft.fields[1] as { id: string };
    t.step.down(ev(0.11, 0.21, t.svg.querySelector(`[data-fid="${second.id}"]`) as Element));
    t.step.up(ev(0.11, 0.21, t.svg));
    t.step.apply({ type: 'delete' });
    expect(t.step.state().problem).toBe('Kategoria 2 nie ma jeszcze pól.');
    expect(t.step.problem()).toBe('Kategoria 2 nie ma jeszcze pól.');
  });

  it('cofanie (Ctrl+Z) i przerwane przeciąganie (drugi palec, Esc)', () => {
    const t = setup();
    t.step.enter();
    expect(t.step.state().canUndo).toBe(false);
    draw(t, 0.1, 0.1);
    draw(t, 0.1, 0.2);
    expect(t.step.undo()).toBe(true);
    expect(t.step.draft.fields).toHaveLength(1);
    expect(t.step.state().activeCategory).toBe(1);
    // przesunięcie pola przerwane: pole wraca na miejsce, nic do cofnięcia nie przybywa
    const f = t.step.draft.fields[0] as { id: string; x: number };
    const before = f.x;
    const el = t.svg.querySelector(`[data-fid="${f.id}"]`) as Element;
    t.step.down(ev(0.12, 0.12, el));
    t.step.move(ev(0.3, 0.12, el));
    expect(t.step.dragging).toBe(true);
    t.step.cancel();
    expect(t.step.draft.fields[0]?.x).toBe(before);
    expect(t.step.dragging).toBe(false);
    expect(t.step.undo()).toBe(true);
    expect(t.step.draft.fields).toHaveLength(0);
    expect(t.step.undo()).toBe(false);
  });
});

describe('wykryta tabela', () => {
  it('kartka z tabelą zaczyna od tabeli: miejsca w kolumnach, kategorie w wierszach', () => {
    scan.result = TABLE;
    const t = setup();
    t.step.enter();
    expect(t.step.state()).toMatchObject({
      mode: 'table',
      players: 'cols',
      seats: 4,
      categories: 6,
      labels: 1,
      hasContent: true,
      problem: null,
    });
    // gracze w wierszach: te same linie, zamienione role
    t.step.apply({ type: 'players', players: 'rows' });
    expect(t.step.state()).toMatchObject({ players: 'rows', seats: 5, categories: 5 });
    t.step.apply({ type: 'undo' });
    expect(t.step.state()).toMatchObject({ players: 'cols', seats: 4, categories: 6 });
  });

  it('poprawa linii, miejsc, kategorii i kolumn opisu', () => {
    scan.result = TABLE;
    const t = setup();
    t.step.enter();
    t.step.apply({ type: 'seats', delta: 1 });
    t.step.apply({ type: 'categories', delta: 1 });
    t.step.apply({ type: 'labels', delta: 1 });
    expect(t.step.state()).toMatchObject({ seats: 4, categories: 7, labels: 2 });
    t.step.apply({ type: 'categories', delta: -1 });
    t.step.apply({ type: 'seats', delta: -1 });
    expect(t.step.state()).toMatchObject({ seats: 3, categories: 6 });
    // linia tabeli przesunięta za uchwyt; jedno cofnięcie przywraca położenie
    const line = t.svg.querySelector('[data-g="y"][data-i="2"]') as Element;
    const y = t.step.draft.grid.y[2] as number;
    drag(t, line, [0.5, y], [0, 0.03]);
    expect(t.step.draft.grid.y[2]).toBeCloseTo(y + 0.03);
    t.step.undo();
    expect(t.step.draft.grid.y[2]).toBeCloseTo(y);
    // pominięte miejsce (kliknięcie znacznika) nie liczy się do miejsc
    const track = t.svg.querySelector('[data-track]') as Element;
    t.step.down(ev(0.5, 0.05, track));
    // przełącza się po puszczeniu; drugi palec (szczypanie) przerywa bez zmiany
    t.step.cancel();
    expect(t.step.state().seats).toBe(3);
    t.step.down(ev(0.5, 0.05, track));
    t.step.up(ev(0.5, 0.05, track));
    expect(t.step.state().seats).toBe(2);
    const out = t.step.output();
    expect(out.players).toBeUndefined();
    expect(out.fields).toBeUndefined();
    expect(out.grid?.blank).toEqual([Number(track.getAttribute('data-track'))]);
  });

  it('ponad osiem miejsc w tabeli', () => {
    scan.result = TABLE;
    const t = setup();
    t.step.enter();
    for (let i = 0; i < 7; i++) t.step.apply({ type: 'seats', delta: 1 });
    expect(t.step.state().seats).toBe(11);
    const tpl = validateTemplate({ v: 2, id: 'x', size: { w: 10, h: 14 }, ...t.step.output() });
    expect(tpl && playerCount(tpl)).toBe(11);
  });

  it('wykryj ponownie: nieudane wykrycie zostawia tabelę i nic nie dodaje do cofania', () => {
    scan.result = TABLE;
    const t = setup();
    t.step.enter();
    scan.result = null;
    t.step.apply({ type: 'detect' });
    expect(t.step.state()).toMatchObject({ detected: false, categories: 6, canUndo: false });
    scan.result = TABLE;
    t.step.apply({ type: 'detect' });
    expect(t.step.state()).toMatchObject({ detected: true, categories: 6, canUndo: true });
  });
});

describe('tryby się wykluczają', () => {
  it('zmiana trybu usuwa pola i kategorie; cofnięcie je przywraca', () => {
    scan.result = TABLE;
    const t = setup();
    t.step.enter();
    scan.result = null;
    t.step.setMode('table');
    expect(t.step.state().mode).toBe('table');
    t.step.apply({ type: 'mode', mode: 'rects' });
    expect(t.step.state()).toMatchObject({
      mode: 'rects',
      seats: 1,
      categories: 0,
      hasContent: false,
    });
    draw(t, 0.1, 0.1);
    expect(t.step.state().hasContent).toBe(true);
    // tabela bez wykrytych linii: domyślna tabela do poprawienia
    t.step.apply({ type: 'mode', mode: 'table' });
    expect(t.step.state()).toMatchObject({ mode: 'table', detected: false, seats: 4 });
    expect(t.step.draft.fields).toHaveLength(0);
    expect(t.step.output().players).toBeUndefined();
    t.step.undo();
    expect(t.step.state()).toMatchObject({ mode: 'rects', categories: 1 });
    expect(t.step.draft.fields).toHaveLength(1);
  });

  it('samodzielny edytor pyta przed zmianą trybu; anulowanie niczego nie zmienia', () => {
    const t = setup();
    t.step.enter();
    draw(t, 0.1, 0.1);
    t.confirm.mockReturnValueOnce(false);
    (t.step.draft.fields[0] as { x: number }).x = 0.1;
    (t.step as unknown as { h: FieldsHost }).h.toolbar
      .querySelector<HTMLButtonElement>('[data-mode="table"]')
      ?.click();
    expect(t.confirm).toHaveBeenCalledTimes(1);
    expect(t.step.state()).toMatchObject({ mode: 'rects', categories: 1 });
    (t.step as unknown as { h: FieldsHost }).h.toolbar
      .querySelector<HTMLButtonElement>('[data-mode="table"]')
      ?.click();
    expect(t.step.state().mode).toBe('table');
  });
});

describe('wczytany notes', () => {
  const base = { v: 2 as const, id: 'n', name: 'N', size: { w: 10, h: 14 }, tape: '#161a2b' };

  it('notes z tabelą otwiera tryb tabeli, a bez tabeli — prostokąty z liczbą miejsc', () => {
    const t = setup();
    t.step.load({
      ...base,
      grid: { x: [0, 0.3, 0.6, 1], y: [0, 0.5, 1], players: 'cols', labels: 1 },
      lines: [
        { id: 'a', label: 'Gracze', kind: 'names' },
        { id: 'b', label: 'Punkty', kind: 'input' },
      ],
    });
    expect(t.step.state()).toMatchObject({ mode: 'table', seats: 2, categories: 2 });

    const rects: PadTemplate = {
      ...base,
      players: 9,
      lines: [{ id: 'b', label: 'Punkty', kind: 'input' }],
      fields: Array.from({ length: 9 }, (_, p) => ({
        id: `f${p}`,
        line: 'b',
        p,
        x: p * 0.1,
        y: 0.1,
        w: 0.08,
        h: 0.05,
      })),
    };
    t.step.load(rects);
    expect(t.step.state()).toMatchObject({ mode: 'rects', seats: 9, problem: null });
    expect(t.step.output()).toMatchObject({ players: 9, grid: undefined });
  });

  it('starszy notes z tabelą i polami dowolnymi zachowuje pola, dopóki tryb się nie zmieni', () => {
    const t = setup();
    t.step.load({
      ...base,
      grid: { x: [0, 0.3, 0.6, 1], y: [0, 0.5, 1], players: 'cols', labels: 1 },
      lines: [
        { id: 'a', label: 'Gracze', kind: 'names' },
        { id: 'b', label: 'Punkty', kind: 'input' },
        { id: 'c', label: 'Premia', kind: 'input' },
      ],
      fields: [{ id: 'f', line: 'c', p: 1, x: 0.1, y: 0.8, w: 0.1, h: 0.05 }],
    });
    expect(t.step.output().fields).toHaveLength(1);
    expect(t.step.output().grid).toBeDefined();
  });
});

describe('poprawki z code review', () => {
  it('wybór miejsca w panelu zdejmuje zaznaczenie kopii zamiast je przenosić', () => {
    const t = setup();
    t.step.enter();
    draw(t, 0.05, 0.1);
    t.step.apply({ type: 'duplicate' });
    expect(t.step.state().selected).toBe(1);
    t.step.apply({ type: 'seat', seat: 0 });
    expect(t.step.state()).toMatchObject({ activeSeat: 0, selected: 0, seats: 2, problem: null });
    expect(t.step.draft.fields.map((f) => f.p).sort()).toEqual([0, 1]);
  });

  it('tabela domyślna bez zmian (nieudane wykrycie) nie wymaga potwierdzenia przy powrocie', () => {
    const t = setup();
    t.step.enter();
    t.step.setMode('table');
    expect(t.step.state()).toMatchObject({ detected: false, hasContent: false });
    t.step.apply({ type: 'seats', delta: 1 });
    expect(t.step.state().hasContent).toBe(true);
  });

  it('suma, imiona i puste pole bez pól nie blokują prostokątów', () => {
    const t = setup();
    t.step.load({
      v: 2,
      id: 'n',
      name: 'N',
      size: { w: 10, h: 14 },
      tape: '#161a2b',
      players: 1,
      lines: [
        { id: 'a', label: 'Punkty', kind: 'input' },
        { id: 's', label: 'Suma', kind: 'total' },
        { id: 'k', label: 'Pominięte', kind: 'skip' },
      ],
      fields: [{ id: 'f', line: 'a', p: 0, x: 0.1, y: 0.1, w: 0.1, h: 0.05 }],
    });
    expect(t.step.state().problem).toBeNull();
  });

  it('stan tabeli: wiersze kategorii i najwięcej kolumn opisu', () => {
    scan.result = TABLE;
    const t = setup();
    t.step.enter();
    expect(t.step.state()).toMatchObject({ rows: 6, labels: 1, maxLabels: 4 });
    for (let i = 0; i < 6; i++) t.step.apply({ type: 'labels', delta: 1 });
    expect(t.step.state()).toMatchObject({ labels: 4, seats: 1 });
  });
});
