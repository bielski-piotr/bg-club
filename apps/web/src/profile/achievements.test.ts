import { ACHIEVEMENTS } from '@bg-club/scoring';
import { describe, expect, it } from 'vitest';
import { PLAY_DEPENDENT_KEYS } from '../meetings/playDelete';
import { parseRoute, serializeRoute } from '../popups/routes';
import { achievementIcons } from './achievementIconPaths';
import {
  itemState,
  meetingAchievementsKey,
  playerAchievementsKey,
  showcaseGroups,
  showcaseItem,
  unlockedCount,
  type AchievementProgress,
  type PlayerAchievements,
} from './achievements';

const ZERO: AchievementProgress = {
  meetings: 0,
  plays: 0,
  wins: 0,
  points: 0,
  streak: 0,
  games: 0,
  won_games: 0,
  game_wins: 0,
  last_places: 0,
  votes: 0,
};

const unlock = (id: string) => ({
  achievement_id: id,
  unlocked_at: '2026-11-12T17:00:00+00:00',
  meeting_id: '00000000-0000-4000-c000-000000000001',
  meeting_title: 'Czwartkowe granie',
  play_id: null,
});

const data = (over: Partial<PlayerAchievements> = {}): PlayerAchievements => ({
  unlocks: [],
  progress: ZERO,
  ...over,
});

describe('gablota osiągnięć (ACH-3)', () => {
  it('pokazuje cały katalog w grupach, w kolejności z PRD', () => {
    const groups = showcaseGroups(data());
    expect(groups.flatMap((g) => g.items.map((i) => i.achievement.id))).toEqual(
      ACHIEVEMENTS.map((a) => a.id),
    );
    expect(groups.map((g) => g.title)).toEqual([
      'Spotkania',
      'Partie',
      'Wygrane',
      'Serie',
      'Różnorodność',
      'Wyjątkowe',
      'Punkty',
      'Klub',
    ]);
  });

  it('każda ikona z katalogu ma piktogram', () => {
    for (const a of ACHIEVEMENTS) expect(achievementIcons[a.icon], a.icon).toBeDefined();
  });

  it('postęp nieodblokowanej odznaki z licznikiem, przycięty do progu', () => {
    const d = data({ progress: { ...ZERO, meetings: 7, points: 640, votes: 3, game_wins: 4 } });
    expect(showcaseItem(d, 'meet-10')?.progress).toEqual({ value: 7, goal: 10 });
    expect(showcaseItem(d, 'pts-500')?.progress).toEqual({ value: 500, goal: 500 });
    expect(showcaseItem(d, 'voter-10')?.progress).toEqual({ value: 3, goal: 10 });
    expect(showcaseItem(d, 'specialist')?.progress).toEqual({ value: 4, goal: 10 });
  });

  it('bez postępu: odblokowane, próg 1 i warunki jednorazowe', () => {
    const d = data({ unlocks: [unlock('meet-10')], progress: { ...ZERO, meetings: 12 } });
    expect(showcaseItem(d, 'meet-10')?.progress).toBeNull();
    expect(showcaseItem(d, 'meet-1')?.progress).toBeNull();
    expect(showcaseItem(d, 'hattrick')?.progress).toBeNull();
    expect(showcaseItem(d, 'meet-25')?.progress).toEqual({ value: 12, goal: 25 });
  });

  it('opis stanu: data spotkania, postęp albo „Do odblokowania”', () => {
    const d = data({ unlocks: [unlock('win-1')], progress: { ...ZERO, wins: 1 } });
    const at = (id: string) => {
      const item = showcaseItem(d, id);
      if (!item) throw new Error(id);
      return itemState(item, 'Europe/Warsaw');
    };
    expect(at('win-1')).toBe('Odblokowane 12 lis 2026');
    expect(at('win-10')).toBe('Postęp: 1 z 10');
    expect(at('flawless')).toBe('Do odblokowania');
  });

  it('odblokowania spoza katalogu nie trafiają do gabloty ani licznika', () => {
    const d = data({ unlocks: [unlock('win-1'), unlock('legend-x')] });
    expect(unlockedCount(d)).toBe(1);
    expect(showcaseItem(d, 'legend-x')).toBeNull();
  });

  it('zdarzenia partii i spotkań odświeżają gablotę i listę spotkania (§5.6.5, [036])', () => {
    // Przeliczenie biegnie też przy rozpoczęciu, zakończeniu, publikacji, zmianie terminu
    // i usunięciu spotkania; te mutacje unieważniają `meetingsKey`.
    expect(playerAchievementsKey('x')[0]).toBe('meetings');
    expect(meetingAchievementsKey('x')[0]).toBe('meetings');
    const covered = (key: readonly string[]) =>
      PLAY_DEPENDENT_KEYS.some((prefix) => prefix.every((part, i) => key[i] === part));
    expect(covered(playerAchievementsKey('x'))).toBe(true);
    expect(covered(meetingAchievementsKey('x'))).toBe(true);
  });
});

describe('adres szczegółów odznaki', () => {
  const ID = '00000000-0000-4000-a000-000000000002';

  it('profile/<uuid>/achievement/<id z katalogu>', () => {
    const route = parseRoute(`profile/${ID.toUpperCase()}/achievement/hattrick`);
    expect(route).toEqual({ kind: 'achievement', profileId: ID, id: 'hattrick' });
    expect(serializeRoute(route)).toBe(`profile/${ID}/achievement/hattrick`);
  });

  it('nieznane osiągnięcie albo zły identyfikator gracza to zły adres', () => {
    expect(parseRoute(`profile/${ID}/achievement/legend-x`).kind).toBe('invalid');
    expect(parseRoute('profile/123/achievement/hattrick').kind).toBe('invalid');
  });
});
