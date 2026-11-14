import { describe, expect, it } from 'vitest';
import { randomValue, sheetResults, testSheet, testPlayerName } from './core/test-sheet';
import { blankSheet, isAllowed, valuesOf, type LineDef, type PadTemplate } from './core/templates';
import { unpackSheet } from './core/settings';
import * as tools from './template-tools';

/** Prosty, powtarzalny generator liczb (LCG) zamiast `Math.random`. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** Tabela: 4 graczy, punktacje z listą, zakresem i dowolną liczbą, suma; remis rozstrzyga „a”. */
function table(): PadTemplate {
  return {
    v: 2,
    id: 'tbl',
    name: 'Tabela',
    size: { w: 10, h: 14 },
    tape: '#161A2B',
    grid: {
      x: [0, 0.2, 0.4, 0.6, 0.8, 1],
      y: [0, 0.2, 0.4, 0.6, 0.8, 1],
      players: 'cols',
      labels: 1,
    },
    lines: [
      { id: 'names', label: 'Gracze', kind: 'names' },
      { id: 'a', label: 'Lista', kind: 'input', values: [0, 5, 10] },
      { id: 'b', label: 'Zakres', kind: 'input', min: -4, max: 8, step: 2 },
      { id: 'c', label: 'Dowolna', kind: 'input', free: true },
      { id: 'sum', label: 'Suma', kind: 'total' },
    ],
    ranking: { line: 'sum', dir: 'desc', tiebreak: [{ type: 'line', line: 'a', dir: 'desc' }] },
  };
}

/** Pola dowolne: 3 miejsca, kategoria „a” ma po dwa pola na gracza, wygrywa mniej. */
function rects(): PadTemplate {
  const field = (id: string, line: string, p: number, k: number) => ({
    id,
    line,
    p,
    x: 0.1 + p * 0.3,
    y: 0.1 + k * 0.2,
    w: 0.2,
    h: 0.1,
  });
  return {
    v: 2,
    id: 'rects',
    name: 'Pola',
    size: { w: 10, h: 14 },
    tape: '#161A2B',
    players: 3,
    lines: [
      { id: 'names', label: 'Gracze', kind: 'names' },
      { id: 'a', label: 'A', kind: 'input', min: 1, max: 6 },
    ],
    fields: [0, 1, 2].flatMap((p) => [
      field(`n${p}`, 'names', p, 0),
      field(`a${p}`, 'a', p, 1),
      field(`b${p}`, 'a', p, 2),
    ]),
    ranking: { line: 'a', dir: 'asc', tiebreak: [] },
  };
}

describe('randomValue (EDT-14)', () => {
  it('losuje tylko wartości dozwolone w kategorii', () => {
    const random = seeded(1);
    const lines: LineDef[] = [
      { id: 'l', label: 'l', kind: 'input', values: [3, 7, 25] },
      { id: 'r', label: 'r', kind: 'input', min: -10, max: 10, step: 5 },
      { id: 'f', label: 'f', kind: 'input', free: true },
      { id: 'd', label: 'd', kind: 'input' },
    ];
    for (const line of lines)
      for (let i = 0; i < 200; i++) expect(isAllowed(line, randomValue(line, random))).toBe(true);
  });

  it('dowolna liczba ma rozsądny zakres punktów', () => {
    const random = seeded(2);
    const line: LineDef = { id: 'f', label: 'f', kind: 'input', free: true };
    for (let i = 0; i < 200; i++) {
      const v = randomValue(line, random);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(30);
    }
  });
});

describe('testSheet (EDT-14)', () => {
  it('bez losowania wpisuje tylko imiona „Gracz 1…n”', () => {
    const sheet = testSheet(table());
    expect(sheet.names).toEqual(['Gracz 1', 'Gracz 2', 'Gracz 3', 'Gracz 4']);
    expect(sheet.cells).toEqual({});
    expect(testPlayerName(9)).toBe('Gracz 10');
  });

  it('losuje wpis w każdej kategorii punktowej każdego gracza (siatka)', () => {
    const t = table();
    const sheet = testSheet(t, { fill: true, random: seeded(3) });
    const data = unpackSheet(sheet, t);
    for (let p = 0; p < 4; p++) {
      const values = valuesOf(t, data, p);
      for (const id of ['a', 'b', 'c']) {
        const line = t.lines.find((l) => l.id === id) as LineDef;
        expect(isAllowed(line, values[id] as number)).toBe(true);
      }
    }
  });

  it('w polach dowolnych wpisuje jedno pole kategorii na gracza', () => {
    const t = rects();
    const sheet = testSheet(t, { fill: true, random: seeded(4) });
    expect(Object.keys(sheet.free ?? {}).sort()).toEqual(['a0', 'a1', 'a2']);
    const data = unpackSheet(sheet, t);
    expect(Object.keys(blankSheet(t, 1).free)).toContain('b0');
    for (let p = 0; p < 3; p++) expect(valuesOf(t, data, p).a).toBe(sheet.free?.[`a${p}`]);
  });

  it('wymuszony remis: dwóch graczy ma tę samą wartość decydującą na 1. miejscu', () => {
    for (let seed = 1; seed <= 25; seed++) {
      for (const t of [table(), rects()]) {
        const sheet = testSheet(t, { fill: true, tie: true, random: seeded(seed) });
        const results = sheetResults(t, sheet);
        const best = results[0]?.value;
        expect(results.filter((r) => r.value === best).length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('wymuszony remis pokazuje działanie pierwszej reguły remisów, gdy się da', () => {
    let decided = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const results = sheetResults(
        table(),
        testSheet(table(), { fill: true, tie: true, random: seeded(seed) }),
      );
      if (results.some((r) => r.decidedBy === 'a')) decided++;
    }
    // Reguła „a” ma trzy wartości, więc niemal zawsze da się znaleźć wpisy, które ją różnią.
    expect(decided).toBeGreaterThanOrEqual(18);
  });
});

describe('sheetResults (EDT-14, PRD §5.6.1)', () => {
  const sheet = (cells: Record<string, (number | null)[]>, names = ['A', 'B', 'C', 'D']) => ({
    game: 1,
    names,
    cells,
  });

  it('liczy miejsca jak partia: remis rozstrzyga reguła, numeracja „1, 1, 3”', () => {
    const t = table();
    const results = sheetResults(t, sheet({ a: [10, 5, 0, 0], b: [0, 6, 2, 2], c: [0, 0, 8, 8] }));
    // Sumy: A 10, B 11, C 10, D 10. B wygrywa, A wygrywa remis po „a”, C i D dzielą miejsce.
    expect(results.map((r) => [r.name, r.place, r.tied, r.decidedBy])).toEqual([
      ['B', 1, false, null],
      ['A', 2, false, 'a'],
      ['C', 3, true, null],
      ['D', 3, true, null],
    ]);
  });

  it('pomija puste miejsca i działa z „mniej = lepiej” w polach dowolnych', () => {
    const t = rects();
    const results = sheetResults(t, {
      game: 1,
      names: ['Gracz 1', null, 'Gracz 3'],
      cells: {},
      free: { a0: 4, b0: 1, a2: 3 },
    });
    expect(results.map((r) => [r.name, r.value, r.place])).toEqual([
      ['Gracz 3', 3, 1],
      ['Gracz 1', 5, 2],
    ]);
  });

  it('moduł szablonu sprawdza surowy szablon (zły szablon: brak kartki i wyników)', () => {
    const t = JSON.parse(JSON.stringify(table())) as unknown;
    expect(tools.testSheet(t)?.names).toHaveLength(4);
    expect(tools.sheetResults(t, sheet({ a: [5, 0, 0, 0] }))[0]?.name).toBe('A');
    expect(tools.testSheet({ v: 2 })).toBeNull();
    expect(tools.sheetResults({ v: 2 }, sheet({}))).toEqual([]);
    expect(tools.rankingLine(t)).toBe('sum');
    expect(tools.rankingLine({ ...table(), ranking: undefined })).toBe('sum');
    expect(tools.rankingLine({ v: 2 })).toBe('');
  });
});
