import { describe, expect, it } from 'vitest';
import { invalidPlacings, placesInSeatOrder, playCases } from './cases';
import { isWin, placementPoints, rankPlayers, validateScoring } from './index';

describe('wspólne przypadki TS/SQL (PRD §8.3)', () => {
  it('obejmują wymagane sytuacje', () => {
    const names = playCases.map((c) => c.name).join('\n');
    expect(names).toMatch(/10\/6\/4\/2\/0 → 8\/8\/4\/2\/0/);
    expect(names).toMatch(/floor/);
    expect(names).toMatch(/ujemne wyniki/);
    expect(playCases.some((c) => c.expected.some((e) => e.tiedWith.length >= 2))).toBe(true);
  });

  describe.each(playCases)('$name', (c) => {
    it('szablon jest poprawny', () => {
      expect(validateScoring(c.template)).toEqual([]);
    });

    it('miejsca, remisy i wartość kategorii decydującej', () => {
      const ranked = rankPlayers(c.template, c.players);
      expect(
        ranked.map(({ seat, rankingValue, place, tiedWith }) => ({
          seat,
          rankingValue,
          place,
          tiedWith,
        })),
      ).toEqual(c.expected.map(({ points: _points, ...rest }) => rest));
      for (const r of ranked) expect(r.tied).toBe(r.tiedWith.length > 0);
    });

    it('punkty z floor i wygrane', () => {
      const { places, points } = placesInSeatOrder(c);
      expect(placementPoints(places, c.points)).toEqual(points);
      const winners = c.expected.filter((e) => isWin(e.place)).length;
      expect(winners).toBe(c.expected.filter((e) => e.place === 1).length);
      expect(winners).toBeGreaterThanOrEqual(1);
    });
  });

  it.each(invalidPlacings)('odrzuca: $name', (c) => {
    expect(() => placementPoints(c.places, c.points)).toThrow(RangeError);
  });
});
