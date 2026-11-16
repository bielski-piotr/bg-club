import { describe, expect, it } from 'vitest';
import { manualTieGroups, rankPlayers, resolveManualTies, type ScoringTemplate } from './index';

const template: ScoringTemplate = {
  lines: [
    { id: 'a', kind: 'input' },
    { id: 'b', kind: 'input' },
  ],
  ranking: {
    line: 'a',
    dir: 'desc',
    tiebreak: [{ type: 'line', line: 'b', dir: 'asc' }, { type: 'manual' }],
  },
};
const ranked = rankPlayers(template, [
  { seat: 0, values: { a: 10, b: 1 } },
  { seat: 1, values: { a: 10, b: 2 } },
  { seat: 2, values: { a: 10, b: 2 } },
  { seat: 3, values: { a: 10, b: 2 } },
  { seat: 4, values: { a: 5, b: 0 } },
  { seat: 5, values: { a: 5, b: 0 } },
]);

describe('manual tiebreak', () => {
  it('exposes only still tied subgroups, including ties below first place', () => {
    expect(manualTieGroups(template, ranked)).toEqual([
      [1, 2, 3],
      [4, 5],
    ]);
  });
  it('resolves subgroups without moving established groups and retains remaining ties', () => {
    const result = resolveManualTies(template, ranked, [
      [[3], [1, 2]],
      [[5], [4]],
    ]);
    expect(result.map((r) => [r.seat, r.place, r.tiedWith])).toEqual([
      [0, 1, []],
      [3, 2, []],
      [1, 3, [2]],
      [2, 3, [1]],
      [5, 5, []],
      [4, 6, []],
    ]);
    expect(ranked[1]?.tiedWith).toEqual([2, 3]);
    expect(result.find((r) => r.seat === 3)?.values).toEqual({ a: 10, b: 2 });
  });
  it('can leave all ties unchanged', () => {
    expect(resolveManualTies(template, ranked, [[[1, 2, 3]], [[4, 5]]])).toEqual(ranked);
  });
  it.each(
    [
      [],
      [[[1, 2]], [[4, 5]]],
      [[[0, 1, 2]], [[4, 5]]],
      [[[1, 1, 3]], [[4, 5]]],
      [[[1, 2, 3], []], [[4, 5]]],
      [[[1, 2, 4]], [[3, 5]]],
    ].map((decision) => ({ decision })),
  )('rejects incomplete, duplicate and foreign seats: %j', ({ decision }) => {
    expect(() => resolveManualTies(template, ranked, decision)).toThrow();
  });
  it('does not expose manual after shared; supports a first manual rule and null scores', () => {
    expect(
      manualTieGroups(
        {
          ...template,
          ranking: { line: 'a', dir: 'asc', tiebreak: [{ type: 'shared' }, { type: 'manual' }] },
        },
        ranked,
      ),
    ).toEqual([]);
    const direct = {
      ...template,
      ranking: { line: 'a', dir: 'asc' as const, tiebreak: [{ type: 'manual' as const }] },
    };
    const empty = rankPlayers(direct, [
      { seat: 2, values: {} },
      { seat: 7, values: {} },
    ]);
    expect(resolveManualTies(direct, empty, [[[7], [2]]]).map((r) => [r.seat, r.place])).toEqual([
      [7, 1],
      [2, 2],
    ]);
  });
});
