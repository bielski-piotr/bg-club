import { describe, expect, it } from 'vitest';
import { filterYear, leaderboardLayout, widgetRows, type LeaderboardEntry } from './leaderboard';

let serial = 0;
function entry(place: number, first: string, value: number, deleted = false): LeaderboardEntry {
  serial += 1;
  return {
    place,
    profile_id: `00000000-0000-4000-a000-${String(serial).padStart(12, '0')}`,
    first_name: first,
    last_name: 'Testowa',
    avatar_path: null,
    deleted,
    // Jak w SQL: podium to miejsca 1–3 aktywnych członków.
    podium: !deleted && place <= 3,
    value,
  };
}

describe('układ rankingu', () => {
  it('bez graczy nie ma podium ani listy', () => {
    expect(leaderboardLayout([])).toEqual({ steps: [], rows: [] });
  });

  it('przy jednym i dwóch graczach pokazuje tylko zajęte stopnie', () => {
    const ada = entry(1, 'Ada', 10);
    expect(leaderboardLayout([ada])).toEqual({ steps: [{ place: 1, entries: [ada] }], rows: [] });
    const bea = entry(2, 'Bea', 4);
    expect(leaderboardLayout([ada, bea]).steps.map((s) => s.place)).toEqual([1, 2]);
  });

  it('remisujący stoją razem na jednym stopniu, a numeracja jest 1, 1, 3', () => {
    const rows = [
      entry(1, 'Ada', 9),
      entry(1, 'Bea', 9),
      entry(3, 'Cela', 5),
      entry(4, 'Dora', 2),
      entry(5, 'Zoja', 20, true),
    ];
    const { steps, rows: list } = leaderboardLayout(rows);
    expect(steps.map((s) => [s.place, s.entries.map((e) => e.first_name)])).toEqual([
      [1, ['Ada', 'Bea']],
      [3, ['Cela']],
    ]);
    // Usunięty członek jest na końcu listy mimo wyniku i nigdy na podium.
    expect(list.map((e) => e.first_name)).toEqual(['Dora', 'Zoja']);
  });

  it('wielu remisujących na 1. miejscu zajmuje cały stopień, lista zaczyna się od 5.', () => {
    const rows = ['Ada', 'Bea', 'Cela', 'Dora'].map((name) => entry(1, name, 3));
    const fifth = entry(5, 'Ewa', 1);
    const { steps, rows: list } = leaderboardLayout([...rows, fifth]);
    expect(steps).toHaveLength(1);
    expect(steps[0]?.entries).toHaveLength(4);
    expect(list).toEqual([fifth]);
  });
});

describe('lista w widżecie', () => {
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

describe('filtr roku', () => {
  it('„Cała historia” to brak roku', () => {
    expect(filterYear('all')).toBeNull();
    expect(filterYear('2025')).toBe(2025);
  });
});
