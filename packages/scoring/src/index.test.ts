import { describe, expect, it } from 'vitest';
import type { ScoringLine, ScoringTemplate } from './index';
import {
  FINAL_TOTAL,
  RankingError,
  compareByDirection,
  complexityPoints,
  computeTotals,
  cyclicLines,
  finalTotalIndex,
  isValidComplexity,
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

describe('computeTotals: sumy', () => {
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

describe('rankingOf: starszy format', () => {
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

  it('„rozstrzyga prowadzący” zostawia wspólne miejsce do ręcznej decyzji', () => {
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
    expect(() => placementPoints([1, 2], [3, 1.555])).toThrow(RangeError);
  });

  it('przyjmuje punkty ułamkowe do setnych', () => {
    expect(placementPoints([1, 2], [3.5, 1.25])).toEqual([3.5, 1.25]);
    expect(placementPoints([1, 1], [3.5, 1.25])).toEqual([2.37, 2.37]);
  });

  it('w mniejszej partii pomija najwyżej punktowane miejsca', () => {
    // Gra 2–6, partia 4 graczy: zwycięzca za 3. miejsce, ostatni za 6.
    expect(placementPoints([1, 2, 3, 4], [10, 8, 6, 4, 2, 1])).toEqual([6, 4, 2, 1]);
    expect(placementPoints([1, 2], [10, 8, 6, 4, 2, 1])).toEqual([2, 1]);
    // Remis liczony na przesuniętych miejscach: (6 + 4) / 2.
    expect(placementPoints([1, 1, 3, 4], [10, 8, 6, 4, 2, 1])).toEqual([5, 5, 2, 1]);
  });
});

describe('complexityPoints: punktacja ze skomplikowania gry', () => {
  it('liczy wzór dla każdego miejsca 1…max', () => {
    // M(1) = 1, n = 2: [20 · 1 · 1, 20 · 0.1] · (1 + 0).
    expect(complexityPoints(1, 2)).toEqual([20, 2]);
    // M(5) = 3, n = 6: 60 · share · 1.12.
    expect(complexityPoints(5, 6)).toEqual([67.2, 55.1, 43, 30.9, 18.8, 6.7]);
    // M(2.5) = 1.75, n = 4: 35 · share · 1.06.
    expect(complexityPoints(2.5, 4)).toEqual([37.1, 26, 14.8, 3.7]);
  });

  it('gra z jednym miejscem dostaje pełne punkty zwycięzcy', () => {
    expect(complexityPoints(3, 1)).toEqual([38.8]);
  });

  it('odrzuca skomplikowanie spoza 1…5 i z więcej niż dwoma miejscami po przecinku', () => {
    expect(isValidComplexity(1)).toBe(true);
    expect(isValidComplexity(4.75)).toBe(true);
    expect(isValidComplexity(0.99)).toBe(false);
    expect(isValidComplexity(5.01)).toBe(false);
    expect(isValidComplexity(2.125)).toBe(false);
    expect(() => complexityPoints(6, 4)).toThrow(RangeError);
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

  it('martwa reguła po „wspólnym miejscu” nie unieważnia reguły miejsc', () => {
    const raw = {
      line: 'a',
      dir: 'asc',
      tiebreak: [{ type: 'shared' }, { type: 'line', line: 't', dir: 'desc' }],
    };
    expect(parseRanking(raw, lines)).toEqual({
      ranking: { line: 'a', dir: 'asc', tiebreak: [{ type: 'shared' }] },
      issues: [{ code: 'unreachable-rule', path: 'ranking.tiebreak[1]' }],
    });
  });

  it('zniekształcony JSON daje problemy, nie wyjątek', () => {
    const check = (raw: unknown[]): unknown => validateScoring({ lines: raw });
    expect(check([null, { id: '', kind: 'input' }])).toEqual([
      { code: 'invalid-line', path: 'lines[0]' },
      { code: 'invalid-line', path: 'lines[1]' },
    ]);
    expect(
      check([
        { id: 'a', kind: 'weird' },
        { id: 's', kind: 'sum', of: 'a' },
        { id: 'b', kind: 'input', values: 'abc' },
      ]),
    ).toEqual([
      { code: 'invalid-line', path: 'lines[0].kind' },
      { code: 'invalid-line', path: 'lines[1].of' },
      { code: 'invalid-line', path: 'lines[2].values' },
    ]);
    expect(validateScoring({ lines: 'x' as unknown as unknown[] })).toEqual([
      { code: 'invalid-line', path: 'lines' },
    ]);
  });
});

describe('wartości spoza liczb skończonych', () => {
  it('NaN liczy się jak puste pole', () => {
    const t: ScoringTemplate = {
      lines: [names, { id: 'a', kind: 'input', free: true }],
      ranking: { line: 'a', dir: 'desc', tiebreak: [] },
    };
    const ranked = rankPlayers(t, [
      { seat: 0, values: { a: Number.NaN } },
      { seat: 1, values: { a: 1 } },
      { seat: 2, values: { a: 3 } },
    ]);
    expect(ranked.map((r) => [r.seat, r.place, r.rankingValue])).toEqual([
      [2, 1, 3],
      [1, 2, 1],
      [0, 3, null],
    ]);
  });
});
