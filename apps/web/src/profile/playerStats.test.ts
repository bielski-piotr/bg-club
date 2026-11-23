import { describe, expect, it } from 'vitest';
import { gamesKey } from '../games/games';
import { NO_FILTERS } from '../leaderboard/filters';
import { PLAY_DEPENDENT_KEYS } from '../meetings/playDelete';
import { playerRecordsKey, visibleRecords, type PlayerRecord } from './playerRecordsData';
import { filterArgs, playerStatsKey, winRate } from './playerStatsData';
import { isOwnProfileKey, profilesKey } from './profiles';

const id = '00000000-0000-4000-a000-000000000011';
const game = '00000000-0000-4000-b000-000000000001';

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

describe('filterArgs (LB-4)', () => {
  it('brak filtrów to null, jak w rankingu', () => {
    expect(filterArgs(NO_FILTERS)).toEqual({ date_from: null, date_to: null, game_ids: null });
  });

  it('przekazuje zakres dni i gry', () => {
    expect(filterArgs({ from: '2026-01-01', to: '2026-03-31', games: [game] })).toEqual({
      date_from: '2026-01-01',
      date_to: '2026-03-31',
      game_ids: [game],
    });
  });
});

describe('playerStatsKey (§5.6.5)', () => {
  it('jest w kluczach odświeżanych po zapisie i usunięciu partii', () => {
    const key = playerStatsKey(id, NO_FILTERS);
    expect(key.slice(0, profilesKey.length)).toEqual([...profilesKey]);
    expect(PLAY_DEPENDENT_KEYS).toContainEqual([...profilesKey]);
    expect(isOwnProfileKey(key)).toBe(false);
  });

  it('rozróżnia filtry', () => {
    expect(playerStatsKey(id, NO_FILTERS)).not.toEqual(
      playerStatsKey(id, { ...NO_FILTERS, from: '2026-01-01' }),
    );
    expect(playerStatsKey(id, NO_FILTERS)).not.toEqual(
      playerStatsKey(id, { ...NO_FILTERS, games: [game] }),
    );
  });
});

describe('rekordy osobiste', () => {
  it('klucz odświeża zapis partii i zmiana kolekcji', () => {
    const key = playerRecordsKey(id, NO_FILTERS);
    expect(key.slice(0, gamesKey.length)).toEqual([...gamesKey]);
    expect(PLAY_DEPENDENT_KEYS).toContainEqual([...gamesKey]);
  });

  it('widok filtruje gry z wynikiem i rekordy klubu', () => {
    const base: PlayerRecord = {
      game_id: game,
      title: 'Azul',
      cover_path: null,
      game_deleted: false,
      dir: 'desc',
      value: null,
      play_id: null,
      meeting_id: null,
      meeting_title: null,
      starts_at: null,
      club_record: false,
    };
    const played = { ...base, title: 'Brzdęk', value: 10 };
    const club = { ...base, title: 'Carcassonne', value: 12, club_record: true };
    const all = [base, played, club];
    expect(visibleRecords(all, 'all')).toEqual(all);
    expect(visibleRecords(all, 'played')).toEqual([played, club]);
    expect(visibleRecords(all, 'club')).toEqual([club]);
  });
});
