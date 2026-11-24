import { describe, expect, it } from 'vitest';
import { formatScore } from '../games/gameStatsData';
import {
  meetingGames,
  placeChange,
  placeChangeLabel,
  pointsBreakdown,
  type SummaryGame,
} from './summary';

const game = (title: string, points: number, deleted = false): SummaryGame => ({
  game_id: title,
  title,
  deleted,
  points,
});

describe('podsumowanie spotkania: zmiany w rankingu punktów', () => {
  it('opisuje zmianę miejsca', () => {
    expect(placeChange({ place_before: 4, place_after: 2 })).toEqual({ kind: 'up', by: 2 });
    expect(placeChangeLabel({ kind: 'up', by: 2 })).toEqual({
      short: '▲ 2',
      long: 'awans o 2',
    });
    expect(placeChange({ place_before: 1, place_after: 3 })).toEqual({ kind: 'down', by: 2 });
    expect(placeChangeLabel({ kind: 'down', by: 2 }).short).toBe('▼ 2');
    expect(placeChange({ place_before: 2, place_after: 2 })).toEqual({ kind: 'same' });
    expect(placeChangeLabel({ kind: 'same' }).short).toBe('–');
    // Pierwsze partie gracza: nie było go w rankingu przed spotkaniem.
    expect(placeChange({ place_before: null, place_after: 5 })).toEqual({ kind: 'new' });
    expect(placeChangeLabel({ kind: 'new' }).short).toBe('nowy');
  });

  it('rozbija punkty na gry w kolejności z bazy', () => {
    expect(pointsBreakdown([game('Wingspan', 8), game('Azul', 4)])).toBe('Wingspan +8, Azul +4');
    expect(pointsBreakdown([game('Azul', 0, true)])).toBe('Azul (usunięta z kolekcji) +0');
    expect(pointsBreakdown([game('Azul', 2.5)])).toBe('Azul +2,5');
  });

  it('gry do filtra to gry zapisanych partii w kolejności pierwszej partii', () => {
    const play = (id: string, title: string) => ({ game: { id, title, cover_path: null } });
    expect(meetingGames([play('g2', 'Azul'), play('g1', 'Wingspan'), play('g2', 'Azul')])).toEqual([
      { id: 'g2', title: 'Azul' },
      { id: 'g1', title: 'Wingspan' },
    ]);
  });
});

describe('statystyki gry (GAME-11)', () => {
  it('formatuje wynik po polsku', () => {
    expect(formatScore(28.75, 1)).toBe('28,8');
    expect(formatScore(12.34)).toBe('12,34');
    expect(formatScore(39)).toBe('39');
  });
});
