import { describe, expect, it } from 'vitest';
import type { ScoringLine, ScoringTemplate } from './index';
import {
  FINAL_TOTAL,
  RankingError,
  compareByDirection,
  computeTotals,
  cyclicLines,
  finalTotalIndex,
  isValidPlacing,
  parseRanking,
  placementPoints,
  rankPlayers,
  rankingOf,
  validateScoring,
} from './index';

const names: ScoringLine = { id: 'names', kind: 'names' };

describe('compareByDirection', () => {
  it('przy „więcej = lepiej” stawia wyższy wynik wyżej', () => {
    expect([3, 10, 7].sort((a, b) => compareByDirection(a, b, 'desc'))).toEqual([10, 7, 3]);
  });

  it('przy „mniej = lepiej” stawia niższy wynik wyżej', () => {
    expect([3, -10, 7].sort((a, b) => compareByDirection(a, b, 'asc'))).toEqual([-10, 3, 7]);
  });

  it('puste pole jest za każdą liczbą w obu kierunkach; remis to 0', () => {
    expect(compareByDirection(null, -100, 'asc')).toBeGreaterThan(0);
    expect(compareByDirection(-100, null, 'desc')).toBeLessThan(0);
    expect(compareByDirection(null, null, 'desc')).toBe(0);
    expect(compareByDirection(5, 5, 'asc')).toBe(0);
  });
});

describe('computeTotals: sumy (EDT-13)', () => {
  const t: ScoringTemplate = {
    lines: [
      names,
      { id: 'a', kind: 'input' },
      { id: 'b', kind: 'input' },
      { id: 'up', kind: 'sum' },
      { id: 'bonus', kind: 'bonus', threshold: 10, bonus: 35 },
      { id: 'c', kind: 'input' },
      { id: 'mid', kind: 'total', of: ['up', 'bonus'] },
      { id: 'all', kind: 'total', of: ['mid', 'c'] },
    ],
  };

  it('liczy sumy z sum, premie i wynik końcowy', () => {
    expect(computeTotals(t, { a: 4, b: 7, c: -2 })).toEqual({
      up: 11,
      bonus: 35,
      mid: 46,
      all: 44,
      [FINAL_TOTAL]: 44,
    });
  });

  it('suma bez wpisów jest pusta, a premia czeka na wszystkie składowe', () => {
    expect(computeTotals(t, { a: 4 })).toMatchObject({ up: 4, bonus: null, all: 4 });
    expect(computeTotals(t, { a: 1, b: 2 })).toMatchObject({ bonus: 0 });
    expect(computeTotals(t, {})).toMatchObject({ all: null, [FINAL_TOTAL]: null });
  });

  it('domyślnie decyduje suma, której nie sumuje inna, nie ostatnia na liście', () => {
    const swapped: ScoringTemplate = {
      lines: [
        names,
        { id: 'a', kind: 'input' },
        { id: 'all', kind: 'total', of: ['mid', 'a'] },
        { id: 'mid', kind: 'total', of: ['a'] },
      ],
    };
    expect(swapped.lines[finalTotalIndex(swapped)]?.id).toBe('all');
    expect(finalTotalIndex({ lines: [names] })).toBe(-1);
  });

  it('sumy na cyklu nie mają wartości i są wykrywane', () => {
    const loop: ScoringTemplate = {
      lines: [
        names,
        { id: 'a', kind: 'input' },
        { id: 'x', kind: 'total', of: ['a', 'y'] },
        { id: 'y', kind: 'total', of: ['x'] },
        { id: 'z', kind: 'total', of: ['y', 'a'] },
        { id: 'self', kind: 'total', of: ['self', 'a'] },
      ],
    };
    expect(cyclicLines(loop)).toEqual(['x', 'y', 'self']);
    expect(computeTotals(loop, { a: 3 })).toMatchObject({ x: null, y: null, z: 3, self: null });
  });
});

describe('rankingOf: starszy format (EDT-7)', () => {
  it('bez `ranking` decyduje najwyższa suma końcowa', () => {
    expect(
      rankingOf({ lines: [names, { id: 'a', kind: 'input' }, { id: 't', kind: 'total' }] }),
    ).toEqual({ line: 't', dir: 'desc', tiebreak: [] });
  });

  it('bez sumy końcowej decyduje suma punktacji', () => {
    expect(rankingOf({ lines: [names, { id: 'a', kind: 'input' }] }).line).toBe(FINAL_TOTAL);
  });
});

describe('rankPlayers', () => {
  const t: ScoringTemplate = {
    lines: [
      names,
      { id: 'a', kind: 'input' },
      { id: 'b', kind: 'input' },
      { id: 't', kind: 'total' },
    ],
    ranking: {
      line: 't',
      dir: 'desc',
      tiebreak: [{ type: 'shared' }, { type: 'line', line: 'a', dir: 'desc' }],
    },
  };

  it('reguły po „wspólnym miejscu” nie działają', () => {
    const ranked = rankPlayers(t, [
      { seat: 0, values: { a: 1, b: 4 } },
      { seat: 1, values: { a: 5, b: 0 } },
    ]);
    expect(ranked.map((r) => [r.seat, r.place])).toEqual([
      [0, 1],
      [1, 1],
    ]);
  });

  it('„rozstrzyga prowadzący” na razie zostawia wspólne miejsce (EDT-5 poza MVP)', () => {
    const manual = {
      ...t,
      ranking: { line: 't', dir: 'desc' as const, tiebreak: [{ type: 'manual' as const }] },
    };
    const ranked = rankPlayers(manual, [
      { seat: 3, values: { a: 2 } },
      { seat: 1, values: { a: 2 } },
    ]);
    expect(ranked.map((r) => [r.seat, r.place, r.tiedWith])).toEqual([
      [1, 1, [3]],
      [3, 1, [1]],
    ]);
  });

  it('zwraca sumy i wartości gracza', () => {
    const [first] = rankPlayers(t, [{ seat: 0, values: { a: 2, b: 3 } }]);
    expect(first).toMatchObject({ place: 1, tied: false, rankingValue: 5, totals: { t: 5 } });
  });

  it('pusta lista graczy', () => {
    expect(rankPlayers(t, [])).toEqual([]);
  });

  it('odrzuca kategorię spoza notesu, kategorię imion i powtórzone miejsce', () => {
    const bad = (line: string): ScoringTemplate => ({
      ...t,
      ranking: { line, dir: 'desc', tiebreak: [] },
    });
    expect(() => rankPlayers(bad('nie-ma'), [])).toThrow(RankingError);
    expect(() => rankPlayers(bad('names'), [])).toThrow(RankingError);
    expect(() =>
      rankPlayers(t, [
        { seat: 0, values: {} },
        { seat: 0, values: {} },
      ]),
    ).toThrow(RankingError);
  });
});

describe('placementPoints i isValidPlacing', () => {
  it('kolejność graczy nie ma znaczenia', () => {
    expect(placementPoints([3, 1, 1, 4], [10, 6, 4, 2])).toEqual([4, 8, 8, 2]);
    expect(isValidPlacing([4, 1, 3, 1])).toBe(true);
    expect(isValidPlacing([])).toBe(true);
  });

  it('odrzuca miejsca niecałkowite i zerowe', () => {
    expect(isValidPlacing([0, 1])).toBe(false);
    expect(isValidPlacing([1, 1.5])).toBe(false);
    expect(() => placementPoints([1, 2], [3, 1.5])).toThrow(RangeError);
  });
});

describe('validateScoring: referencje i zakresy', () => {
  const lines: ScoringLine[] = [
    names,
    { id: 'a', kind: 'input', min: 0, max: 10, step: 2 },
    { id: 'b', kind: 'input', values: [0, 5, 10] },
    { id: 'gap', kind: 'skip' },
    { id: 't', kind: 'total', of: ['a', 'b'] },
  ];

  it('poprawny notes i poprawna reguła', () => {
    const ranking = {
      line: 't',
      dir: 'asc',
      tiebreak: [{ type: 'line', line: 'a', dir: 'desc' }, { type: 'shared' }],
    };
    expect(validateScoring({ lines, ranking })).toEqual([]);
    expect(parseRanking({ ...ranking, extra: 1 }, lines).ranking).toEqual(ranking);
  });

  it('wykrywa błędne referencje sum i cykle', () => {
    const issues = validateScoring({
      lines: [
        ...lines,
        { id: 'x', kind: 'total', of: ['nie-ma', 'gap', 'y'] },
        { id: 'y', kind: 'sum', of: ['x'] },
        { id: 'a', kind: 'input' },
      ],
    });
    expect(issues).toEqual([
      { code: 'duplicate-line', path: 'lines[7].id' },
      { code: 'unknown-line', path: 'lines[5].of[0]' },
      { code: 'not-numeric', path: 'lines[5].of[1]' },
      { code: 'cycle', path: 'lines[5]' },
      { code: 'cycle', path: 'lines[6]' },
    ]);
  });

  it.each([
    [{ min: 0 }, 'invalid-range'],
    [{ min: 5, max: 1 }, 'invalid-range'],
    [{ min: 0.5, max: 1 }, 'invalid-range'],
    [{ min: 0, max: 10, step: 0 }, 'invalid-range'],
    [{ step: 1.5 }, 'invalid-range'],
    [{ values: [1, 2.5] }, 'invalid-values'],
  ] as const)('zakres punktacji %j → %s', (range, code) => {
    expect(validateScoring({ lines: [names, { id: 'a', kind: 'input', ...range }] })).toEqual([
      { code, path: 'lines[1]' },
    ]);
  });

  it('dowolna liczba pomija zakres; ujemne zakresy są poprawne', () => {
    expect(
      validateScoring({ lines: [names, { id: 'a', kind: 'input', free: true, min: 9, max: 1 }] }),
    ).toEqual([]);
    expect(
      validateScoring({ lines: [names, { id: 'a', kind: 'input', min: -20, max: -5 }] }),
    ).toEqual([]);
  });

  it('wymaga jednej kategorii imion i co najmniej jednej punktacji', () => {
    expect(validateScoring({ lines: [{ id: 't', kind: 'total' }] })).toEqual([
      { code: 'names-count', path: 'lines' },
      { code: 'no-input', path: 'lines' },
    ]);
  });

  it('wykrywa błędy reguły miejsc', () => {
    const check = (ranking: unknown): unknown => validateScoring({ lines, ranking });
    expect(check(null)).toEqual([{ code: 'invalid-ranking', path: 'ranking' }]);
    expect(check({ line: 'nie-ma', dir: 'up', tiebreak: [] })).toEqual([
      { code: 'unknown-line', path: 'ranking.line' },
      { code: 'invalid-dir', path: 'ranking.dir' },
    ]);
    expect(check({ line: 'names', dir: 'desc' })).toEqual([
      { code: 'not-numeric', path: 'ranking.line' },
      { code: 'invalid-ranking', path: 'ranking.tiebreak' },
    ]);
    expect(
      check({
        line: 'a',
        dir: 'desc',
        tiebreak: [
          { type: 'line', line: 'gap', dir: 'asc' },
          { type: 'line', line: 'b' },
          { type: 'random' },
          'x',
          { type: 'manual' },
          { type: 'shared' },
        ],
      }),
    ).toEqual([
      { code: 'not-numeric', path: 'ranking.tiebreak[0].line' },
      { code: 'invalid-dir', path: 'ranking.tiebreak[1].dir' },
      { code: 'invalid-ranking', path: 'ranking.tiebreak[2].type' },
      { code: 'invalid-ranking', path: 'ranking.tiebreak[3]' },
      { code: 'unreachable-rule', path: 'ranking.tiebreak[5]' },
    ]);
    expect(
      parseRanking({ line: 'a', dir: 'desc', tiebreak: [{ type: 'line', line: 'b' }] }, lines)
        .ranking,
    ).toBeUndefined();
  });
});
