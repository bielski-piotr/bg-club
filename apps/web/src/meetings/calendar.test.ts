import { describe, expect, it } from 'vitest';
import {
  gridRange,
  groupByDay,
  inMonth,
  longDayLabel,
  monthGrid,
  monthLabel,
  monthOf,
  shiftMonth,
  shortDayLabel,
  weekdayTime,
} from './calendar';
import { summarizePlays, type OverviewPlay } from './overview';

describe('siatka miesiąca (CAL-1)', () => {
  it('ma pełne tygodnie od poniedziałku do niedzieli', () => {
    // Listopad 2026: 1 listopada to niedziela, 30 to poniedziałek.
    const weeks = monthGrid({ year: 2026, month: 11 });
    expect(weeks).toHaveLength(6);
    expect(weeks[0]?.[0]).toEqual({ date: '2026-10-26', inMonth: false });
    expect(weeks[0]?.[6]).toEqual({ date: '2026-11-01', inMonth: true });
    expect(weeks.at(-1)?.[0]).toEqual({ date: '2026-11-30', inMonth: true });
    expect(weeks.at(-1)?.[6]).toEqual({ date: '2026-12-06', inMonth: false });
    expect(weeks.flat().filter((day) => day.inMonth)).toHaveLength(30);
  });

  it('luty 2027 zaczynający się w poniedziałek ma cztery tygodnie', () => {
    const weeks = monthGrid({ year: 2027, month: 2 });
    expect(weeks).toHaveLength(4);
    expect(weeks[0]?.[0]?.date).toBe('2027-02-01');
    expect(weeks.at(-1)?.[6]?.date).toBe('2027-02-28');
  });

  it('przesuwa miesiące przez granicę roku', () => {
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth({ year: 2026, month: 11 }, -23)).toEqual({ year: 2024, month: 12 });
    expect(monthOf('2026-11-12')).toEqual({ year: 2026, month: 11 });
    expect(inMonth('2026-11-30', { year: 2026, month: 11 })).toBe(true);
    expect(inMonth('2026-12-01', { year: 2026, month: 11 })).toBe(false);
  });

  it('pobiera spotkania z dniem zapasu wokół siatki', () => {
    expect(gridRange({ year: 2026, month: 11 })).toEqual({
      from: '2026-10-25T00:00:00.000Z',
      to: '2026-12-08T00:00:00.000Z',
    });
  });
});

describe('dni spotkań w strefie klubu (NFR-10)', () => {
  const meeting = (id: string, starts_at: string) => ({ id, starts_at });

  it('przypisuje spotkanie do daty w strefie klubu, a w dniu sortuje po godzinie i id', () => {
    const list = [
      meeting('b', '2026-11-28T17:00:00Z'),
      // 23:30 UTC 28 listopada to już 29 listopada w Warszawie.
      meeting('c', '2026-11-28T23:30:00Z'),
      meeting('a', '2026-11-28T17:00:00Z'),
      meeting('d', '2026-11-28T09:00:00Z'),
    ];
    const warsaw = groupByDay(list, 'Europe/Warsaw');
    expect(warsaw.get('2026-11-28')?.map((m) => m.id)).toEqual(['d', 'a', 'b']);
    expect(warsaw.get('2026-11-29')?.map((m) => m.id)).toEqual(['c']);
    // W Nowym Jorku 09:00 UTC to jeszcze 28 listopada, 23:30 UTC też.
    const newYork = groupByDay(list, 'America/New_York');
    expect(newYork.get('2026-11-28')?.map((m) => m.id)).toEqual(['d', 'a', 'b', 'c']);
  });

  it('formatuje etykiety po polsku', () => {
    expect(monthLabel({ year: 2026, month: 11 })).toBe('Listopad 2026');
    expect(monthLabel({ year: 2027, month: 2 })).toBe('Luty 2027');
    expect(shortDayLabel('2026-11-12')).toBe('czwartek, 12 lis');
    expect(longDayLabel('2026-11-12')).toBe('czwartek, 12 listopada 2026');
    expect(weekdayTime('2026-11-28T17:00:00Z', 'Europe/Warsaw')).toBe('sobota, 18:00');
    expect(weekdayTime('2026-11-28T17:00:00Z', 'Asia/Tokyo')).toBe('niedziela, 02:00');
  });
});

describe('podsumowanie partii spotkania (MTG-3)', () => {
  const play = (
    id: string,
    saved_at: string | null,
    winners: string[],
    others: string[] = [],
  ): OverviewPlay => ({
    id,
    status: saved_at ? 'saved' : 'draft',
    saved_at,
    play_results: [
      ...winners.map((profile_id) => ({ profile_id, is_win: true })),
      ...others.map((profile_id) => ({ profile_id, is_win: saved_at ? false : null })),
    ],
  });

  it('liczy tylko zapisane partie, a zwycięzców od największej liczby wygranych', () => {
    const summary = summarizePlays([
      play('p3', '2026-11-28T20:00:00Z', ['bartek']),
      play('p1', '2026-11-28T18:00:00Z', ['ania'], ['bartek']),
      play('p2', '2026-11-28T19:00:00Z', ['bartek'], ['ania']),
      play('draft', null, [], ['cela']),
    ]);
    expect(summary).toEqual({ playCount: 3, winners: ['bartek', 'ania'] });
  });

  it('przy równej liczbie wygranych decyduje pierwsza wygrana; remis daje kilku zwycięzców', () => {
    const summary = summarizePlays([
      play('p2', '2026-11-28T19:00:00Z', ['cela']),
      // Wspólne pierwsze miejsce: obie osoby wygrywają.
      play('p1', '2026-11-28T18:00:00Z', ['ania', 'bea']),
    ]);
    expect(summary).toEqual({ playCount: 2, winners: ['ania', 'bea', 'cela'] });
  });

  it('bez zapisanych partii nie ma zwycięzców', () => {
    expect(summarizePlays([])).toEqual({ playCount: 0, winners: [] });
    expect(summarizePlays([play('d', null, [], ['ania'])])).toEqual({
      playCount: 0,
      winners: [],
    });
  });
});
