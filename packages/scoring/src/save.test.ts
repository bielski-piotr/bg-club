import { describe, expect, it } from 'vitest';
import { playCases } from './cases';
import { rankPlayers } from './ranking';
import { SavePlayResultsError, resultPoints, savePlayResults } from './save';

const players = new Map([
  [1, 'p-ada'],
  [3, 'p-celina'],
]);

describe('wyniki dla save_play (PAD-7, §5.6.2)', () => {
  it('mapuje miejsca kartki (od 0) na graczy notesu (od 1), bez punktów i wygranych', () => {
    const results = savePlayResults(
      [
        { seat: 2, values: { a: 9, b: null, c: undefined }, rankingValue: 9, place: 1 },
        { seat: 0, values: { a: 4 }, rankingValue: 4, place: 2 },
      ],
      players,
    );
    expect(results).toEqual([
      { profile_id: 'p-ada', seat: 1, place: 2, scores: { a: 4 }, ranking_value: 4 },
      { profile_id: 'p-celina', seat: 3, place: 1, scores: { a: 9, b: null }, ranking_value: 9 },
    ]);
    for (const r of results) {
      expect(r).not.toHaveProperty('points');
      expect(r).not.toHaveProperty('is_win');
      expect(r).not.toHaveProperty('tied');
    }
  });

  it('nieskończoność i NaN są pustym polem', () => {
    const [result] = savePlayResults(
      [
        { seat: 0, values: { a: Number.NaN }, rankingValue: Number.POSITIVE_INFINITY, place: 1 },
        { seat: 2, values: {}, rankingValue: null, place: 2 },
      ],
      players,
    );
    expect(result).toMatchObject({ scores: { a: null }, ranking_value: null });
  });

  it('odrzuca wynik bez gracza i gracza bez wyniku', () => {
    expect(() =>
      savePlayResults([{ seat: 1, values: {}, rankingValue: 1, place: 1 }], players),
    ).toThrow(SavePlayResultsError);
    expect(() =>
      savePlayResults([{ seat: 0, values: {}, rankingValue: 1, place: 1 }], players),
    ).toThrow(/miejscu 3/);
  });

  it('zespół: każdy członek dostaje wynik z tym samym miejscem i pełne punkty strony', () => {
    const teams = new Map<number, readonly string[]>([
      [1, ['p-ada', 'p-bartek']],
      [2, ['p-celina']],
    ]);
    const results = savePlayResults(
      [
        { seat: 0, values: { a: 9 }, rankingValue: 9, place: 1 },
        { seat: 1, values: { a: 4 }, rankingValue: 4, place: 2 },
      ],
      teams,
    );
    expect(results.map((r) => [r.profile_id, r.seat, r.place])).toEqual([
      ['p-ada', 1, 1],
      ['p-bartek', 1, 1],
      ['p-celina', 2, 2],
    ]);
    // Dwie strony w grze do 4 graczy: miejsca 3 i 4 punktacji.
    expect(resultPoints(results, [10, 6, 4, 2])).toEqual([4, 4, 2]);
  });

  it.each(playCases)('wspólny przypadek: $name', (c) => {
    const ids = new Map(c.players.map((p) => [p.seat + 1, `p${p.seat}`]));
    const results = savePlayResults(rankPlayers(c.template, c.players), ids);
    expect(results.map((r) => [r.seat, r.place, r.ranking_value])).toEqual(
      [...c.expected]
        .sort((a, b) => a.seat - b.seat)
        .map((e) => [e.seat + 1, e.place, e.rankingValue]),
    );
  });
});
