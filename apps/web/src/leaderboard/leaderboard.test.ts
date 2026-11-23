import { describe, expect, it } from 'vitest';
import {
  filterSegments,
  hasFilters,
  NO_FILTERS,
  parseFilterSegments,
  withDates,
  withGames,
} from './filters';
import {
  leaderboardArgs,
  leaderboardKey,
  leaderboardLayout,
  widgetRows,
  type LeaderboardEntry,
} from './leaderboard';
import { decidingCriterion, tieGroups } from './ties';

let serial = 0;
function entry(
  place: number,
  first: string,
  value: number,
  extra: Partial<LeaderboardEntry> = {},
): LeaderboardEntry {
  serial += 1;
  const deleted = extra.deleted ?? false;
  return {
    place,
    profile_id: `00000000-0000-4000-a000-${String(serial).padStart(12, '0')}`,
    first_name: first,
    last_name: 'Testowa',
    avatar_path: null,
    deleted,
    // Jak w SQL: podium to miejsca 1–3 aktywnych członków (LB-7).
    podium: !deleted && place <= 3,
    value,
    tied: false,
    reached_meeting_id: null,
    reached_meeting_title: null,
    reached_at: null,
    reached_points: null,
    wins: 0,
    ...extra,
  };
}

const M1 = '00000000-0000-4000-c000-000000000001';
const M2 = '00000000-0000-4000-c000-000000000002';
const G1 = '00000000-0000-4000-b000-000000000001';
const G2 = '00000000-0000-4000-b000-000000000002';

describe('układ rankingu (LB-2, LB-7)', () => {
  it('bez graczy nie ma podium ani listy', () => {
    expect(leaderboardLayout([])).toEqual({ steps: [], rows: [] });
  });

  it('przy jednym i dwóch graczach pokazuje tylko zajęte stopnie', () => {
    const ada = entry(1, 'Ada', 10);
    expect(leaderboardLayout([ada])).toEqual({ steps: [{ place: 1, entries: [ada] }], rows: [] });
    const bea = entry(2, 'Bea', 4);
    expect(leaderboardLayout([ada, bea]).steps.map((s) => s.place)).toEqual([1, 2]);
  });

  it('każdy ma własne miejsce; usunięty jest na końcu listy i nigdy na podium', () => {
    const rows = [
      entry(1, 'Ada', 9),
      entry(2, 'Bea', 9),
      entry(3, 'Cela', 5),
      entry(4, 'Dora', 2),
      entry(5, 'Zoja', 20, { deleted: true }),
    ];
    const { steps, rows: list } = leaderboardLayout(rows);
    expect(steps.map((s) => [s.place, s.entries.map((e) => e.first_name)])).toEqual([
      [1, ['Ada']],
      [2, ['Bea']],
      [3, ['Cela']],
    ]);
    expect(list.map((e) => e.first_name)).toEqual(['Dora', 'Zoja']);
  });
});

describe('lista w widżecie (LB-3)', () => {
  const rows = [4, 5, 6, 7, 8, 9].map((place) => entry(place, `Gracz${place}`, 10 - place));

  it('pokazuje miejsca 4–7', () => {
    const { shown, own } = widgetRows(rows, 'nie-ma');
    expect(shown.map((e) => e.place)).toEqual([4, 5, 6, 7]);
    expect(own).toBeUndefined();
  });

  it('dokłada wiersz bieżącego użytkownika spoza 4–7', () => {
    const me = rows[5] as LeaderboardEntry;
    expect(widgetRows(rows, me.profile_id).own).toBe(me);
    expect(widgetRows(rows, (rows[1] as LeaderboardEntry).profile_id).own).toBeUndefined();
  });
});

describe('filtry (LB-4)', () => {
  it('brak filtrów to cała historia i wszystkie gry (argumenty null)', () => {
    expect(hasFilters(NO_FILTERS)).toBe(false);
    expect(leaderboardArgs('points', NO_FILTERS)).toEqual({
      kind: 'points',
      date_from: null,
      date_to: null,
      game_ids: null,
    });
  });

  it('jeden dzień z kalendarza to zakres jednego dnia, dni w złej kolejności są zamieniane', () => {
    expect(withDates(NO_FILTERS, '2026-03-05', null)).toMatchObject({
      from: '2026-03-05',
      to: '2026-03-05',
    });
    expect(withDates(NO_FILTERS, '2026-03-05', '2026-02-01')).toMatchObject({
      from: '2026-02-01',
      to: '2026-03-05',
    });
    expect(withDates(withDates(NO_FILTERS, '2026-03-05', null), null, null)).toEqual(NO_FILTERS);
  });

  it('filtry dat i gier łączą się; ten sam zestaw gier daje ten sam klucz zapytania', () => {
    const a = withGames(withDates(NO_FILTERS, '2026-01-01', '2026-01-31'), [G2, G1, G2]);
    const b = withGames(withDates(NO_FILTERS, '2026-01-01', '2026-01-31'), [G1, G2]);
    expect(a.games).toEqual([G1, G2]);
    expect(leaderboardKey('wins', a)).toEqual(leaderboardKey('wins', b));
    expect(leaderboardArgs('wins', a)).toEqual({
      kind: 'wins',
      date_from: '2026-01-01',
      date_to: '2026-01-31',
      game_ids: [G1, G2],
    });
  });

  it('segmenty adresu: zapis i odczyt, błędne wartości odrzucone', () => {
    const filters = withGames(withDates(NO_FILTERS, '2026-01-01', '2026-02-28'), [G1]);
    const segments = filterSegments(filters);
    expect(segments).toEqual(['from:2026-01-01', 'to:2026-02-28', `games:${G1}`]);
    expect(parseFilterSegments(segments)).toEqual(filters);
    expect(parseFilterSegments([])).toEqual(NO_FILTERS);
    expect(parseFilterSegments(['to:2026-01-01'])).toEqual({ ...NO_FILTERS, to: '2026-01-01' });
    for (const bad of [
      ['from:2026-02-30'],
      ['from:2026-03-01', 'to:2026-02-01'],
      ['games:abc'],
      ['year:2026'],
      ['from:2026-01-01', 'from:2026-01-02'],
    ]) {
      expect(parseFilterSegments(bad)).toBeNull();
    }
  });
});

describe('rozstrzyganie remisów', () => {
  it('kryteria po kolei: spotkanie, punkty na nim, wygrane, alfabet', () => {
    const base = { reached_meeting_id: M2, reached_points: 10, wins: 2 };
    const a = entry(1, 'Ada', 14, base);
    expect(decidingCriterion(a, entry(2, 'Bea', 14, { ...base, reached_meeting_id: M1 }))).toBe(
      'reached',
    );
    expect(decidingCriterion(a, entry(2, 'Bea', 14, { ...base, reached_points: 6 }))).toBe(
      'points',
    );
    expect(decidingCriterion(a, entry(2, 'Bea', 14, { ...base, wins: 1 }))).toBe('wins');
    expect(decidingCriterion(a, entry(2, 'Bea', 14, base))).toBe('name');
    expect(decidingCriterion(entry(1, 'Ada', 0), entry(2, 'Bea', 0))).toBe('name');
  });

  it('grupy tylko z równym wynikiem aktywnych graczy, w kolejności rankingu', () => {
    const rows = [
      entry(1, 'Ada', 20),
      entry(2, 'Bea', 14, { reached_meeting_id: M2, reached_points: 10 }),
      entry(3, 'Cela', 14, { reached_meeting_id: M2, reached_points: 6 }),
      entry(4, 'Dora', 14, { reached_meeting_id: M1, reached_points: 6 }),
      entry(5, 'Ewa', 3),
      entry(6, 'Zoja', 3, { deleted: true }),
    ];
    const groups = tieGroups(rows);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.value).toBe(14);
    expect(groups[0]?.members.map((m) => [m.entry.first_name, m.decidedBy])).toEqual([
      ['Bea', 'points'],
      ['Cela', 'reached'],
      ['Dora', null],
    ]);
    expect(tieGroups([entry(1, 'Ada', 5), entry(2, 'Bea', 4)])).toEqual([]);
  });
});
