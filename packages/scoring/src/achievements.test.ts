import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENTS,
  ACHIEVEMENT_GROUPS,
  achievementById,
  computeAchievements,
  type AchievementHistory,
} from './achievements';
import {
  achievementCases,
  achievementHistory,
  caseMeetingId,
  casePlayId,
  caseProfileId,
  expectedUnlocks,
} from './cases/achievements';

describe('katalog osiągnięć (ACH-1, Q16)', () => {
  it('ma 29 pozycji z PRD §5.10 z unikalnymi identyfikatorami w formacie bazy', () => {
    expect(ACHIEVEMENTS).toHaveLength(29);
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('każda pozycja ma nazwę, opis, ikonę i znaną grupę', () => {
    for (const a of ACHIEVEMENTS) {
      expect(a.name.length).toBeGreaterThan(0);
      expect(a.description.length).toBeGreaterThan(0);
      expect(a.icon.length).toBeGreaterThan(0);
      expect(ACHIEVEMENT_GROUPS[a.group]).toBeDefined();
    }
  });

  it('progi liczników są w identyfikatorach (meet-10 → 10)', () => {
    for (const a of ACHIEVEMENTS) {
      const n = /-(\d+)$/.exec(a.id)?.[1];
      if (n) expect('goal' in a ? a.goal : undefined).toBe(Number(n));
    }
    expect(achievementById('specialist')).toMatchObject({ goal: 10 });
    expect(achievementById('nie-ma')).toBeUndefined();
  });
});

describe('computeAchievements: wspólne przypadki (TS = SQL)', () => {
  for (const c of achievementCases) {
    it(c.name, () => {
      const only = new Set<string>(c.only ?? ACHIEVEMENTS.map((a) => a.id));
      const actual = computeAchievements(achievementHistory(c)).filter((u) =>
        only.has(u.achievementId),
      );
      expect(actual).toEqual(expectedUnlocks(c));
    });
  }
});

describe('computeAchievements: przeliczanie', () => {
  const p1 = caseProfileId(1);
  const p2 = caseProfileId(2);
  const meeting = (n: number, finished = true) => ({
    id: caseMeetingId(n),
    startsAt: `2026-0${n}-10T18:00:00.000Z`,
    finished,
  });
  const play = (m: number, n: number, winner: string, loser: string, value = 0) => ({
    id: casePlayId(m, n),
    meetingId: caseMeetingId(m),
    gameId: 'g',
    savedAt: `2026-0${m}-10T19:0${n}:00.000Z`,
    dir: 'desc' as const,
    results: [
      { profileId: winner, place: 1, points: 10, rankingValue: value },
      { profileId: loser, place: 2, points: 6, rankingValue: value - 1 },
    ],
  });
  const ids = (h: AchievementHistory, profile: string) =>
    computeAchievements(h)
      .filter((u) => u.profileId === profile)
      .map((u) => `${u.achievementId}@${u.meetingId.slice(-1)}`);

  it('jest deterministyczne: kolejność wejścia nie ma znaczenia, ponowienie daje to samo', () => {
    const h: AchievementHistory = {
      meetings: [meeting(1), meeting(2), meeting(3)],
      plays: [play(1, 1, p1, p2), play(2, 1, p1, p2), play(3, 1, p1, p2)],
      voters: [],
    };
    const reversed: AchievementHistory = {
      meetings: [...h.meetings].reverse(),
      plays: [...h.plays].reverse(),
      voters: [],
    };
    expect(computeAchievements(reversed)).toEqual(computeAchievements(h));
    expect(computeAchievements(h)).toEqual(computeAchievements(h));
  });

  it('usunięcie partii cofa niespełnione osiągnięcia i przesuwa datę spełnionych później', () => {
    const plays = [play(1, 1, p1, p2), play(2, 1, p1, p2), play(3, 1, p1, p2), play(4, 1, p1, p2)];
    const h = (ps: typeof plays): AchievementHistory => ({
      meetings: [meeting(1), meeting(2), meeting(3), meeting(4)],
      plays: ps,
      voters: [],
    });
    expect(ids(h(plays), p1)).toEqual(
      expect.arrayContaining(['streak-3@3', 'win-1@1', 'beginners-luck@1']),
    );
    // Bez partii ze spotkania 1: pierwsza wygrana przesuwa się na spotkanie 2, seria 3 na 4.
    const withoutFirst = ids(h(plays.slice(1)), p1);
    expect(withoutFirst).toEqual(
      expect.arrayContaining(['streak-3@4', 'win-1@2', 'beginners-luck@2']),
    );
    // Dwie partie mniej: serii 3 już nie ma.
    expect(ids(h(plays.slice(2)), p1)).not.toContain('streak-3@4');
    expect(ids(h(plays.slice(2)), p1).some((id) => id.startsWith('streak-3'))).toBe(false);
  });

  it('rekord: usunięcie partii, w której padł, przelicza rekordy od nowa (Q17)', () => {
    const h = (ps: ReturnType<typeof play>[]): AchievementHistory => ({
      meetings: [meeting(1), meeting(2), meeting(3)],
      plays: ps,
      voters: [],
    });
    const first = play(1, 1, p1, p2, 10);
    const beat = play(2, 1, p2, p1, 20);
    const later = play(3, 1, p1, p2, 15);
    // Pobicie rekordu przez gracza 1 nie odbiera go graczowi 2 („na zawsze”).
    expect(ids(h([first, beat]), p2)).toContain('record@2');
    expect(ids(h([first, beat, play(3, 1, p1, p2, 30)]), p2)).toContain('record@2');
    // Bez partii rekordu gracz 2 traci osiągnięcie, a 15 w spotkaniu 3 to teraz rekord gracza 1.
    expect(ids(h([first, later]), p2)).not.toContain('record@2');
    expect(ids(h([first, later]), p1)).toContain('record@3');
    expect(ids(h([first, beat, later]), p1)).not.toContain('record@3');
  });

  it('bez skazy pojawia się po zakończeniu spotkania', () => {
    const plays = [play(1, 1, p1, p2), play(1, 2, p1, p2), play(1, 3, p1, p2)];
    expect(ids({ meetings: [meeting(1, false)], plays, voters: [] }, p1)).not.toContain(
      'flawless@1',
    );
    expect(ids({ meetings: [meeting(1)], plays, voters: [] }, p1)).toContain('flawless@1');
  });

  it('odrzuca partie i głosy nieznanych spotkań', () => {
    expect(() =>
      computeAchievements({ meetings: [], plays: [play(1, 1, p1, p2)], voters: [] }),
    ).toThrow(/nieznane spotkanie/);
    expect(() =>
      computeAchievements({
        meetings: [],
        plays: [],
        voters: [{ meetingId: caseMeetingId(1), profileId: p1 }],
      }),
    ).toThrow(/nieznane spotkanie/);
  });
});
