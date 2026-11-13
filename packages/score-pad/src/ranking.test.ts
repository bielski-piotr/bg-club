import { describe, expect, it } from 'vitest';
import {
  blankSheet,
  padRanking,
  rankSheet,
  validateTemplate,
  valuesOf,
  type PadTemplate,
} from './core/templates';
import { FieldsStep } from './editor/fields';

/** Notes dla trzech graczy: imiona, dwie punktacje i suma; mniej = lepiej, remis rozstrzyga „a”. */
function template(): PadTemplate {
  return {
    v: 2,
    id: 'golf',
    name: 'Golf',
    size: { w: 10, h: 14 },
    tape: '#2c3a46',
    grid: {
      x: [0, 0.25, 0.5, 0.75, 1],
      y: [0, 0.25, 0.5, 0.75, 1],
      players: 'cols',
      labels: 1,
    },
    lines: [
      { id: 'names', label: 'Gracze', kind: 'names' },
      { id: 'a', label: 'Dołek 1', kind: 'input', free: true },
      { id: 'b', label: 'Dołek 2', kind: 'input', free: true },
      { id: 'sum', label: 'Suma', kind: 'total' },
    ],
    ranking: { line: 'sum', dir: 'asc', tiebreak: [{ type: 'line', line: 'a', dir: 'asc' }] },
  };
}

const roundTrip = (t: unknown) => validateTemplate(JSON.parse(JSON.stringify(t)));

describe('reguła miejsc w pliku notesu (EDT-7)', () => {
  it('wczytanie zachowuje poprawną regułę bez nadmiarowych pól', () => {
    const t = template();
    const raw = { ...t, ranking: { ...t.ranking, note: 'x' } };
    expect(roundTrip(raw)?.ranking).toEqual(t.ranking);
  });

  it('błędna reguła jest pomijana, a notes działa z regułą domyślną', () => {
    const t = roundTrip({ ...template(), ranking: { line: 'nie-ma', dir: 'asc', tiebreak: [] } });
    expect(t).not.toBeNull();
    expect(t?.ranking).toBeUndefined();
    expect(padRanking(t as PadTemplate)).toEqual({ line: 'sum', dir: 'desc', tiebreak: [] });
  });

  it('starszy plik bez reguły: najwyższa suma końcowa', () => {
    const legacy: Partial<PadTemplate> = template();
    delete legacy.ranking;
    expect(padRanking(roundTrip(legacy) as PadTemplate).dir).toBe('desc');
  });

  it('szablon zmieniony po wczytaniu nie wywraca liczenia', () => {
    const t = template();
    t.lines = t.lines.filter((l) => l.id !== 'a');
    expect(padRanking(t)).toEqual({ line: 'sum', dir: 'desc', tiebreak: [] });
  });
});

describe('miejsca z kartki', () => {
  it('liczą się z wpisów kartki według reguły notesu', () => {
    const t = template();
    const d = blankSheet(t, 1);
    const put = (line: string, p: number, value: number) => {
      const cell = d.cells[line]?.[p];
      if (cell) cell.cur = { value, scratch: false, ink: { seed: 1, t: 0 } };
    };
    // Sumy: 7, 7, 9. Remis rozstrzyga mniejsze „a”: gracz 2 (a = 3) przed graczem 1 (a = 4).
    [
      [4, 3],
      [3, 4],
      [5, 4],
    ].forEach(([a, b], p) => {
      put('a', p, a as number);
      put('b', p, b as number);
    });
    const ranked = rankSheet(
      t,
      [0, 1, 2].map((seat) => ({ seat, values: valuesOf(t, d, seat) })),
    );
    expect(ranked.map((r) => [r.seat, r.place, r.rankingValue])).toEqual([
      [1, 1, 7],
      [0, 2, 7],
      [2, 3, 9],
    ]);
  });
});

describe('edytor zachowuje regułę wczytanego notesu', () => {
  const step = (t: PadTemplate): FieldsStep => {
    const s = Object.create(FieldsStep.prototype) as FieldsStep;
    // `load` rysuje krok w edytorze; tu wystarcza model, więc szkic ustawiamy bezpośrednio.
    s.draft = {
      name: t.name,
      tape: t.tape,
      grid: structuredClone(t.grid as NonNullable<PadTemplate['grid']>),
      lines: structuredClone(t.lines),
      fields: [],
      ranking: t.ranking,
    };
    return s;
  };

  it('eksport zawiera regułę', () => {
    expect(step(template()).output().ranking).toEqual(template().ranking);
  });

  it('reguła wskazująca usuniętą kategorię znika z eksportu', () => {
    const s = step(template());
    s.draft.lines = s.draft.lines.filter((l) => l.id !== 'a');
    expect(s.output().ranking).toBeUndefined();
  });
});
