import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateScoring } from '@bg-club/scoring';
import type { PadTemplate } from './core/templates';
import type { FieldsHost } from './editor/fields';
import { FieldsStep } from './editor/fields';
import { readTemplate } from './template-tools';

/*
 * Krok 4 kreatora „Kategorie” (EDT-13, EDT-2…EDT-4, EDT-7), zadanie [019]: nazwa, typ, opis,
 * zakres punktacji, sumy bez cykli, kategoria decydująca z kierunkiem i uporządkowane reguły
 * remisów. Zmiany trafiają od razu do `template.ranking` i przechodzą walidator zapisu.
 */

const W = 1000;
const H = 1400;

function setup(template: PadTemplate) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as SVGSVGElement;
  document.body.append(svg);
  const changed = vi.fn();
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
    render: () => {
      svg.innerHTML = step.draw();
    },
    changed,
    toast: () => undefined,
    wizard: true,
  };
  const step = new FieldsStep(host);
  step.load(template);
  step.setReview(true);
  step.enter();
  return { step, svg, changed };
}

/** Tabela: imiona, trzy punktacje i suma; 4 miejsca w kolumnach. */
const TABLE: PadTemplate = {
  v: 2,
  id: 't',
  name: 'Turniejowy',
  size: { w: 10, h: 14 },
  tape: '#161a2b',
  grid: {
    x: [0.05, 0.35, 0.5, 0.65, 0.8, 0.95],
    y: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6],
    players: 'cols',
    labels: 1,
  },
  lines: [
    { id: 'n', label: 'Gracze', kind: 'names' },
    { id: 'a', label: 'Kategoria 2', kind: 'input', min: 0, max: 50, step: 1 },
    { id: 'b', label: 'Kategoria 3', kind: 'input', min: 0, max: 50, step: 1 },
    { id: 'c', label: 'Kategoria 4', kind: 'input', min: 0, max: 50, step: 1 },
    { id: 's', label: 'Suma', kind: 'total' },
  ],
};

/** Szablon do zapisu: wynik kroku tak, jak go eksportuje edytor. */
const saved = (step: FieldsStep) => {
  const out = step.output();
  return { ...TABLE, ...out };
};

afterEach(() => {
  document.body.innerHTML = '';
});

describe('kategorie', () => {
  it('pokazuje kategorie z kroku 3 z typem, zakresem i domyślną regułą miejsc', () => {
    const { step } = setup(TABLE);
    const state = step.categoriesState();
    expect(state.view).toBe('lines');
    expect(state.active).toBe(0);
    expect(state.lines.map((l) => [l.label, l.kind, l.placed])).toEqual([
      ['Gracze', 'names', true],
      ['Kategoria 2', 'input', true],
      ['Kategoria 3', 'input', true],
      ['Kategoria 4', 'input', true],
      ['Suma', 'total', true],
    ]);
    expect(state.lines[1]).toMatchObject({ range: 'range', min: 0, max: 50, step: 1 });
    // EDT-2: domyślnie decyduje suma, której nie sumuje żadna inna suma
    expect(state.ranking).toEqual({ line: 's', dir: 'desc', tiebreak: [] });
    expect(state.explicit).toBe(false);
    expect(state.issues).toEqual([]);
    expect(state.lines[4]?.of).toEqual(['a', 'b', 'c']);
  });

  it('zmienia nazwę, typ i opis; automatyczna nazwa idzie za typem', () => {
    const { step } = setup(TABLE);
    step.applyCategories({ type: 'update', index: 1, patch: { label: 'Ptaki', hint: '1 pkt' } });
    step.applyCategories({ type: 'update', index: 2, patch: { kind: 'total' } });
    let lines = step.categoriesState().lines;
    expect(lines[1]).toMatchObject({ label: 'Ptaki', hint: '1 pkt' });
    expect(lines[2]).toMatchObject({ label: 'Suma', kind: 'total' });
    step.applyCategories({ type: 'update', index: 2, patch: { kind: 'skip' } });
    lines = step.categoriesState().lines;
    expect(lines[2]).toMatchObject({ label: 'Kategoria 3', kind: 'skip' });
    // pusty opis znika z pliku
    step.applyCategories({ type: 'update', index: 1, patch: { hint: '  ' } });
    expect(step.output().lines[1]?.hint).toBeUndefined();
    expect(step.categoriesState().active).toBe(1);
  });

  it('zakres punktacji: dowolny, min–max–krok albo lista wartości', () => {
    const { step } = setup(TABLE);
    const line = () => step.output().lines[1];
    step.applyCategories({ type: 'update', index: 1, patch: { range: 'free' } });
    expect(line()).toMatchObject({ free: true });
    expect(line()?.min).toBeUndefined();

    step.applyCategories({ type: 'update', index: 1, patch: { range: 'range' } });
    step.applyCategories({ type: 'update', index: 1, patch: { min: -5, max: 20, step: 5 } });
    expect(line()).toMatchObject({ min: -5, max: 20, step: 5 });
    expect(line()?.free).toBeUndefined();

    // krótki zakres staje się listą jego wartości
    step.applyCategories({ type: 'update', index: 1, patch: { range: 'list' } });
    expect(step.categoriesState().lines[1]).toMatchObject({
      range: 'list',
      values: [-5, 0, 5, 10, 15, 20],
    });
    step.applyCategories({ type: 'update', index: 1, patch: { values: [25, 0, 10, 10] } });
    expect(line()).toMatchObject({ values: [0, 10, 25] });
    expect(line()?.min).toBeUndefined();
    expect(step.categoriesState().issues).toEqual([]);
  });

  it('błędny zakres i pusta lista wartości blokują krok', () => {
    const { step } = setup(TABLE);
    step.applyCategories({ type: 'update', index: 1, patch: { min: 30, max: 10 } });
    expect(step.categoriesState().issues).toContainEqual({
      code: 'invalid-range',
      path: 'lines[1]',
    });
    step.applyCategories({ type: 'update', index: 1, patch: { min: 0, max: 10, step: 1 } });
    step.applyCategories({ type: 'update', index: 2, patch: { range: 'range' } });
    // zakres 0–50 ma za dużo wartości na listę: lista zaczyna od pustej
    step.applyCategories({ type: 'update', index: 2, patch: { range: 'list' } });
    expect(step.categoriesState().issues).toEqual([{ code: 'invalid-values', path: 'lines[2]' }]);
    step.applyCategories({ type: 'update', index: 2, patch: { values: [3] } });
    expect(step.categoriesState().issues).toEqual([]);
  });

  it('dokładnie jedna kategoria „Nazwa gracza” i co najmniej jedna punktacja', () => {
    const { step } = setup(TABLE);
    step.applyCategories({ type: 'update', index: 1, patch: { kind: 'names' } });
    expect(step.categoriesState().issues).toContainEqual({ code: 'names-count', path: 'lines' });
    step.applyCategories({ type: 'update', index: 1, patch: { kind: 'input' } });
    step.applyCategories({ type: 'update', index: 0, patch: { kind: 'skip' } });
    expect(step.categoriesState().issues).toContainEqual({ code: 'names-count', path: 'lines' });
    step.applyCategories({ type: 'update', index: 0, patch: { kind: 'names' } });
    for (const i of [1, 2, 3])
      step.applyCategories({ type: 'update', index: i, patch: { kind: 'skip' } });
    expect(step.categoriesState().issues).toContainEqual({ code: 'no-input', path: 'lines' });
  });

  it('suma liczy się z wybranych kategorii, także z innych sum, bez cykli', () => {
    const { step } = setup(TABLE);
    // kategoria 4 staje się sumą częściową kategorii 2 i 3
    step.applyCategories({ type: 'update', index: 3, patch: { kind: 'total' } });
    step.applyCategories({ type: 'update', index: 3, patch: { of: ['a', 'b'] } });
    // suma końcowa: kategoria 4 (suma) i nic więcej
    step.applyCategories({ type: 'update', index: 4, patch: { of: ['c'] } });
    const state = step.categoriesState();
    expect(state.lines[3]?.of).toEqual(['a', 'b']);
    expect(state.lines[4]?.of).toEqual(['c']);
    // suma 4 sumuje sumę 3, więc 3 nie może już sumować 4
    expect(state.lines[4]?.sumOptions).toEqual(['a', 'b', 'c']);
    expect(state.lines[3]?.sumOptions).toEqual(['a', 'b']);
    // domyślnie decyduje suma, której nie sumuje żadna inna
    expect(state.ranking.line).toBe('s');
    expect(state.issues).toEqual([]);
    expect(validateScoring(saved(step))).toEqual([]);
  });
});

describe('wygrana i remisy', () => {
  it('kategoria decydująca, kierunek i reguły remisów trafiają do template.ranking', () => {
    const { step } = setup(TABLE);
    step.applyCategories({
      type: 'ranking',
      ranking: {
        line: 'a',
        dir: 'asc',
        tiebreak: [
          { type: 'line', line: 'b', dir: 'desc' },
          { type: 'line', line: 'c', dir: 'asc' },
          { type: 'shared' },
        ],
      },
    });
    const state = step.categoriesState();
    expect(state.explicit).toBe(true);
    // końcowe wspólne miejsce jest niejawne
    expect(step.output().ranking).toEqual({
      line: 'a',
      dir: 'asc',
      tiebreak: [
        { type: 'line', line: 'b', dir: 'desc' },
        { type: 'line', line: 'c', dir: 'asc' },
      ],
    });
    const result = readTemplate(saved(step));
    expect(result).toMatchObject({ ok: true, template: { ranking: step.output().ranking } });
  });

  it('kategoria decydująca, która przestaje być liczbowa, wraca do domyślnej sumy', () => {
    const { step } = setup(TABLE);
    step.applyCategories({
      type: 'ranking',
      ranking: {
        line: 'a',
        dir: 'asc',
        tiebreak: [
          { type: 'line', line: 'b', dir: 'desc' },
          { type: 'line', line: 'c', dir: 'desc' },
        ],
      },
    });
    step.applyCategories({ type: 'update', index: 2, patch: { kind: 'skip' } });
    expect(step.categoriesState().ranking.tiebreak).toEqual([
      { type: 'line', line: 'c', dir: 'desc' },
    ]);
    step.applyCategories({ type: 'update', index: 1, patch: { kind: 'skip' } });
    // domyślna reguła: suma, więcej = lepiej
    expect(step.categoriesState().ranking).toEqual({
      line: 's',
      dir: 'desc',
      tiebreak: [{ type: 'line', line: 'c', dir: 'desc' }],
    });
    expect(step.categoriesState().issues).toEqual([]);
  });

  it('reguła na kategorii bez wartości liczbowej nie przechodzi walidatora', () => {
    const { step } = setup(TABLE);
    step.applyCategories({
      type: 'ranking',
      ranking: { line: 'n', dir: 'desc', tiebreak: [] },
    });
    expect(step.categoriesState().issues).toContainEqual({
      code: 'not-numeric',
      path: 'ranking.line',
    });
  });
});

describe('kartka w kroku 4', () => {
  it('numer przy każdej kategorii; kliknięcie pola wybiera kategorię', () => {
    const { step, svg, changed } = setup(TABLE);
    step.applyCategories({ type: 'view', view: 'ranking' });
    svg.innerHTML = step.draw();
    // w zakładce reguły: puchar przy kategorii decydującej (suma), bez numerów pozostałych
    expect(svg.querySelectorAll('[data-badge]')).toHaveLength(1);
    expect(svg.querySelector('[data-badge="4"] path')).not.toBeNull();

    const row = svg.querySelector('[data-cat="2"]') as Element;
    changed.mockClear();
    step.pick({ target: row } as unknown as PointerEvent);
    const state = step.categoriesState();
    expect(state).toMatchObject({ active: 2, view: 'lines' });
    expect(changed).toHaveBeenCalled();
    expect(svg.querySelectorAll('[data-badge]')).toHaveLength(5);
    expect(svg.querySelector('[data-badge="2"]')?.classList.contains('on')).toBe(true);
  });

  it('prostokąty: kategoria bez pól nie ma numeru na kartce', () => {
    const { step, svg } = setup({
      ...TABLE,
      grid: undefined,
      players: 2,
      lines: [
        { id: 'n', label: 'Gracze', kind: 'names' },
        { id: 'a', label: 'Ptaki', kind: 'input' },
        { id: 's', label: 'Suma', kind: 'total' },
      ],
      fields: [
        { id: 'f1', line: 'a', p: 0, x: 0.2, y: 0.2, w: 0.1, h: 0.05 },
        { id: 'f2', line: 'a', p: 1, x: 0.4, y: 0.2, w: 0.1, h: 0.05 },
        { id: 'f3', line: 'n', p: 0, x: 0.2, y: 0.1, w: 0.1, h: 0.05 },
        { id: 'f4', line: 'n', p: 1, x: 0.4, y: 0.1, w: 0.1, h: 0.05 },
      ],
    });
    svg.innerHTML = step.draw();
    expect(svg.querySelectorAll('[data-cat="1"]')).toHaveLength(2);
    expect(svg.querySelectorAll('[data-badge]')).toHaveLength(2);
    expect(step.categoriesState().lines.map((l) => l.placed)).toEqual([true, true, false]);
  });

  it('cofanie mapowania przywraca cały stan; edycja kategorii kończy historię mapowania', () => {
    const { step } = setup(TABLE);
    step.setReview(false);
    step.apply({ type: 'seats', delta: 1 });
    expect(step.players()).toBe(5);
    step.setReview(true);
    step.applyCategories({ type: 'update', index: 1, patch: { label: 'Ptaki' } });
    step.setReview(false);
    // po edycji kategorii cofnięcie mapowania przywróciłoby stare nazwy: historii już nie ma
    expect(step.state().canUndo).toBe(false);
    step.apply({ type: 'undo' });
    expect(step.players()).toBe(5);
    expect(step.output().lines[1]?.label).toBe('Ptaki');
  });

  it('cofnięcie usunięcia kategorii przywraca też sumy, które ją liczyły', () => {
    const { step } = setup({
      ...TABLE,
      grid: undefined,
      players: 1,
      lines: [
        { id: 'n', label: 'Gracze', kind: 'names' },
        { id: 'a', label: 'Ptaki', kind: 'input' },
        { id: 'b', label: 'Jajka', kind: 'input' },
        { id: 's', label: 'Suma', kind: 'total', of: ['a', 'b'] },
      ],
      fields: [
        { id: 'f1', line: 'n', p: 0, x: 0.2, y: 0.1, w: 0.1, h: 0.05 },
        { id: 'f2', line: 'a', p: 0, x: 0.2, y: 0.2, w: 0.1, h: 0.05 },
        { id: 'f3', line: 'b', p: 0, x: 0.2, y: 0.3, w: 0.1, h: 0.05 },
      ],
    });
    step.setReview(false);
    step.apply({ type: 'category', category: 1 });
    step.apply({ type: 'removeCategory' });
    expect(step.output().lines.find((l) => l.id === 's')?.of).toEqual(['b']);
    step.apply({ type: 'undo' });
    expect(step.output().lines.find((l) => l.id === 's')?.of).toEqual(['a', 'b']);
  });
});

describe('poprawki reguły i sum', () => {
  it('usunięta w kroku 3 kategoria decydująca wraca do domyślnej sumy (więcej = lepiej)', () => {
    const { step } = setup(TABLE);
    step.applyCategories({
      type: 'ranking',
      ranking: { line: 'c', dir: 'asc', tiebreak: [{ type: 'line', line: 'b', dir: 'desc' }] },
    });
    step.setReview(false);
    // ostatni wiersz tabeli to suma „s”; „c” jest przedostatni: usuwamy dwa wiersze
    step.apply({ type: 'categories', delta: -1 });
    step.apply({ type: 'categories', delta: -1 });
    expect(step.output().lines.map((l) => l.id)).toEqual(['n', 'a', 'b']);
    // bez sumy domyślną regułą jest suma wszystkich punktacji: jawnej reguły już nie ma
    expect(step.output().ranking).toBeUndefined();
    expect(step.categoriesState().issues).toEqual([]);
  });

  it('kategoria decydująca zmieniona na puste pole: domyślna suma i kierunek „więcej”', () => {
    const { step } = setup(TABLE);
    step.applyCategories({
      type: 'ranking',
      ranking: { line: 'a', dir: 'asc', tiebreak: [] },
    });
    step.applyCategories({ type: 'update', index: 1, patch: { kind: 'skip' } });
    expect(step.output().ranking).toEqual({ line: 's', dir: 'desc', tiebreak: [] });
  });

  it('kategoria zmieniona na nazwę gracza znika z sum', () => {
    const { step } = setup({
      ...TABLE,
      lines: TABLE.lines.map((l) => (l.id === 's' ? { ...l, of: ['a', 'b'] } : l)),
    });
    step.applyCategories({ type: 'update', index: 0, patch: { kind: 'skip' } });
    step.applyCategories({ type: 'update', index: 1, patch: { kind: 'names' } });
    expect(step.output().lines[4]?.of).toEqual(['b']);
    expect(step.categoriesState().issues).toEqual([]);
  });

  it('punktacja bez zapisanego zakresu ma domyślne 0–50 i daje się zmienić', () => {
    const { step } = setup({
      ...TABLE,
      lines: TABLE.lines.map((l) => (l.id === 'a' ? { id: 'a', label: 'A', kind: 'input' } : l)),
    });
    expect(step.categoriesState().lines[1]).toMatchObject({
      range: 'range',
      min: 0,
      max: 50,
      step: 1,
    });
    expect(step.categoriesState().issues).toEqual([]);
    step.applyCategories({ type: 'update', index: 1, patch: { max: 10 } });
    expect(step.output().lines[1]).toMatchObject({ min: 0, max: 10, step: 1 });
  });
});
