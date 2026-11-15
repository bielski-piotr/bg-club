import { describe, expect, it } from 'vitest';
import { PLAY_DEPENDENT_KEYS } from '../meetings/playDelete';
import { yearFilterValues } from '../leaderboard/leaderboard';
import { playerStatsKey, winRate } from './playerStats';
import { isOwnProfileKey, profilesKey } from './profiles';

describe('winRate (STAT-1)', () => {
  it('zaokrągla procent wygranych do całości', () => {
    expect(winRate(2, 3)).toBe(67);
    expect(winRate(1, 3)).toBe(33);
    expect(winRate(4, 4)).toBe(100);
    expect(winRate(0, 5)).toBe(0);
  });

  it('bez partii nie ma procentu', () => {
    expect(winRate(0, 0)).toBeNull();
  });
});

describe('yearFilterValues (STAT-3)', () => {
  it('zaczyna od całej historii, potem lata gracza od najnowszego', () => {
    expect(yearFilterValues([2026, 2025], 'all')).toEqual(['all', '2026', '2025']);
  });

  it('zostawia wybrany rok, który zniknął z listy (np. po usunięciu partii)', () => {
    expect(yearFilterValues([2026], '2024')).toEqual(['all', '2026', '2024']);
    expect(yearFilterValues([], '2025')).toEqual(['all', '2025']);
  });
});

describe('playerStatsKey (§5.6.5)', () => {
  it('jest w kluczach odświeżanych po zapisie i usunięciu partii', () => {
    const key = playerStatsKey('00000000-0000-4000-a000-000000000011', 2026);
    expect(key.slice(0, profilesKey.length)).toEqual([...profilesKey]);
    expect(PLAY_DEPENDENT_KEYS).toContainEqual([...profilesKey]);
    expect(isOwnProfileKey(key)).toBe(false);
  });

  it('rozróżnia całą historię i rok', () => {
    const id = '00000000-0000-4000-a000-000000000011';
    expect(playerStatsKey(id, null)).not.toEqual(playerStatsKey(id, 2026));
  });
});
