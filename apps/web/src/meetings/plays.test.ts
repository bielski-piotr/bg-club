import { describe, expect, it } from 'vitest';
import { menuItems } from './meetingMenu';
import type { Meeting } from './meetings';
import type { MeetingOverview } from './overview';
import {
  countdownLabel,
  fromPlayRow,
  isMeetingRunner,
  playsProgressLabel,
  playSubtitle,
  sortedResults,
  splitPlays,
  type MeetingPlay,
  type PlayResult,
} from './plays';

const ADMIN = { id: 'admin', role: 'admin' as const };
const HOST = { id: 'host', role: 'player' as const };
const PLAYER = { id: 'player', role: 'player' as const };

function meeting(extra: Partial<Meeting> = {}): Meeting {
  return {
    id: 'm1',
    title: 'Sobotnie granie',
    starts_at: '2026-11-28T17:00:00Z',
    status: 'planned',
    voting_open: true,
    host_id: 'host',
    started_at: null,
    finished_at: null,
    participants: ['host', 'player'],
    ...extra,
  };
}

function result(profile: string, seat: number, place: number | null = null): PlayResult {
  return {
    profile_id: profile,
    seat,
    ranking_value: place === null ? null : 100 - place,
    place,
    points: place === null ? null : Math.max(0, 4 - place),
    is_win: place === null ? null : place === 1,
  };
}

function play(id: string, extra: Partial<MeetingPlay> = {}): MeetingPlay {
  return {
    id,
    status: 'saved',
    started_at: '2026-11-28T17:10:00Z',
    saved_at: '2026-11-28T18:00:00Z',
    started_by: 'admin',
    sheet_image_path: null,
    game: { id: 'g1', title: 'Azul', cover_path: null },
    results: [],
    ...extra,
  };
}

describe('partie spotkania (VIEW-3)', () => {
  it('zapisane w kolejności rozegrania (saved_at, potem id), szkice od najstarszego', () => {
    const plays = [
      play('c', { saved_at: '2026-11-28T19:00:00Z' }),
      play('b', { saved_at: '2026-11-28T18:00:00Z' }),
      play('a', { saved_at: '2026-11-28T18:00:00Z' }),
      play('d2', { status: 'draft', saved_at: null, started_at: '2026-11-28T20:00:00Z' }),
      play('d1', { status: 'draft', saved_at: null, started_at: '2026-11-28T19:30:00Z' }),
    ];
    const { saved, drafts } = splitPlays(plays);
    expect(saved.map((p) => p.id)).toEqual(['a', 'b', 'c']);
    expect(drafts.map((p) => p.id)).toEqual(['d1', 'd2']);
  });

  it('wyniki od 1. miejsca, remis według miejsca w notesie; szkic według miejsc', () => {
    const saved = play('p', { results: [result('x', 1, 3), result('y', 3, 1), result('z', 2, 1)] });
    expect(sortedResults(saved).map((r) => r.profile_id)).toEqual(['z', 'y', 'x']);
    const draft = play('d', { status: 'draft', results: [result('b', 2), result('a', 1)] });
    expect(sortedResults(draft).map((r) => r.profile_id)).toEqual(['a', 'b']);
  });

  it('usunięta (niewidoczna) gra dostaje zastępczy tytuł', () => {
    const row = {
      id: 'p',
      status: 'saved' as const,
      started_at: '2026-11-28T17:10:00Z',
      saved_at: '2026-11-28T18:00:00Z',
      started_by: 'admin',
      sheet_image_path: null,
      game_id: 'g9',
      games: null,
      play_results: [],
    };
    expect(fromPlayRow(row).game).toEqual({ id: 'g9', title: 'Usunięta gra', cover_path: null });
  });

  it('podpis karty i licznik partii po polsku', () => {
    const p = play('p', { results: [result('a', 1, 1), result('b', 2, 2)] });
    expect(playSubtitle(p, 0, 'Europe/Warsaw')).toBe('Partia 1 · 19:00 · 2 graczy');
    expect(playsProgressLabel(2, 1)).toBe('2 rozegrane · 1 w toku');
    expect(playsProgressLabel(1, 0)).toBe('1 rozegrana');
    expect(playsProgressLabel(5, 0)).toBe('5 rozegranych');
  });
});

describe('prowadzenie spotkania (RUN-1, RUN-4, §2.1)', () => {
  it('admin zawsze, prowadzący tylko w niezakończonym, gracz nigdy', () => {
    for (const status of ['planned', 'in_progress', 'finished'] as const) {
      expect(isMeetingRunner(meeting({ status }), ADMIN)).toBe(true);
      expect(isMeetingRunner(meeting({ status }), PLAYER)).toBe(false);
    }
    expect(isMeetingRunner(meeting({ status: 'planned' }), HOST)).toBe(true);
    expect(isMeetingRunner(meeting({ status: 'in_progress' }), HOST)).toBe(true);
    expect(isMeetingRunner(meeting({ status: 'finished' }), HOST)).toBe(false);
  });
});

describe('odliczanie w widżecie (DS §15)', () => {
  const zone = 'Europe/Warsaw';
  const now = new Date('2026-11-12T22:30:00Z'); // 23:30 w Warszawie, czwartek 12 lis
  it('liczy dni kalendarzowe w strefie klubu', () => {
    expect(countdownLabel('2026-11-12T22:45:00Z', zone, now)).toBe('dziś');
    // 00:15 13 lis w Warszawie, choć w UTC to jeszcze 12 lis.
    expect(countdownLabel('2026-11-12T23:15:00Z', zone, now)).toBe('jutro');
    expect(countdownLabel('2026-11-28T17:00:00Z', zone, now)).toBe('za 16 dni');
    expect(countdownLabel('2026-11-14T17:00:00Z', zone, now)).toBe('za 2 dni');
    expect(countdownLabel('2026-11-11T17:00:00Z', zone, now)).toBeNull();
  });
});

describe('menu spotkania zależne od roli (DS §15 „Meeting menus”, PLAN-4, Q14)', () => {
  const ids = (m: Meeting, who: typeof ADMIN | typeof HOST, overview?: MeetingOverview) =>
    menuItems(m, overview, who.role === 'admin', isMeetingRunner(m, who)).map((i) => i.id);

  it('admin: zaplanowane edycja, ponowne otwarcie po publikacji i usunięcie', () => {
    expect(ids(meeting(), ADMIN)).toEqual(['edit', 'delete']);
    expect(ids(meeting({ voting_open: false }), ADMIN)).toEqual(['edit', 'reopen', 'delete']);
  });

  it('admin w trakcie: dodanie uczestnika i zmiana prowadzącego, bez usuwania', () => {
    expect(ids(meeting({ status: 'in_progress', voting_open: false }), ADMIN)).toEqual([
      'add-participant',
      'change-host',
    ]);
  });

  it('zakończone: usunięcie tylko bez zapisanych partii', () => {
    const finished = meeting({ status: 'finished', voting_open: false });
    const overview = (playCount: number) =>
      ({ ...finished, playCount, winners: [] }) satisfies MeetingOverview;
    expect(ids(finished, ADMIN)).toEqual(['reopen-meeting']);
    expect(ids(finished, ADMIN, overview(0))).toEqual(['reopen-meeting', 'delete']);
    expect(ids(finished, ADMIN, overview(2))).toEqual(['reopen-meeting']);
  });

  it('prowadzący: tylko „Zakończ spotkanie” w trakcie, bez akcji administracyjnych', () => {
    expect(ids(meeting(), HOST)).toEqual([]);
    expect(ids(meeting({ status: 'in_progress', voting_open: false }), HOST)).toEqual(['finish']);
    expect(ids(meeting({ status: 'finished', voting_open: false }), HOST)).toEqual([]);
  });
});
