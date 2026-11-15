import { describe, expect, it } from 'vitest';
import { formatScore } from '../games/gameStats';
import { pointsBreakdown, streakChange, streakLabel, winsLabel, type SummaryGame } from './summary';

const game = (title: string, points: number, wins = 0, deleted = false): SummaryGame => ({
  game_id: title,
  title,
  deleted,
  points,
  wins,
});

describe('podsumowanie spotkania (VIEW-4)', () => {
  it('opisuje zmianę serii', () => {
    expect(streakChange({ streak_before: 3, streak_after: 4 })).toBe('up');
    expect(streakLabel({ streak_before: 3, streak_after: 4 })).toBe('+1 → seria 4');
    expect(streakChange({ streak_before: 2, streak_after: 0 })).toBe('broken');
    expect(streakLabel({ streak_before: 2, streak_after: 0 })).toBe('seria przerwana');
    // Seria 0 bez wygranej nie jest przerwana.
    expect(streakChange({ streak_before: 0, streak_after: 0 })).toBe('unchanged');
    expect(streakLabel({ streak_before: 0, streak_after: 0 })).toBe('seria bez zmian');
  });

  it('rozbija punkty na gry w kolejności z bazy', () => {
    expect(pointsBreakdown([game('Wingspan', 8), game('Azul', 4)])).toBe('Wingspan +8, Azul +4');
    expect(pointsBreakdown([game('Azul', 0, 0, true)])).toBe('Azul (usunięta z kolekcji) +0');
  });

  it('wymienia gry z wygranymi', () => {
    expect(winsLabel({ wins: 0, games: [game('Azul', 4)] })).toBeNull();
    expect(winsLabel({ wins: 1, games: [game('Wingspan', 6), game('Azul', 10, 1)] })).toBe(
      '1 wygrana · Azul',
    );
    expect(winsLabel({ wins: 3, games: [game('Azul', 20, 2), game('Wingspan', 10, 1)] })).toBe(
      '3 wygrane · Azul ×2, Wingspan',
    );
  });
});

describe('statystyki gry (GAME-11)', () => {
  it('formatuje wynik po polsku', () => {
    expect(formatScore(28.75)).toBe('28,8');
    expect(formatScore(39)).toBe('39');
  });
});
