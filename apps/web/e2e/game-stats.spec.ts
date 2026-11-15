import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  ADA,
  member,
  mockGame,
  mockMeeting,
  mockSupabase,
  session,
  storeSession,
  type MockOptions,
  type MockPlay,
} from './support/supabaseMock';

/**
 * Statystyki gry i podsumowanie spotkania (PRD GAME-11, VIEW-4, zadanie [035]). Liczby liczy
 * baza (`game_stats`, `meeting_summary`, test SQL 210: remisy, gry „mniej = lepiej”, wersje
 * notesów, szkice, usunięcie partii); tu atrapa zwraca gotowe wyniki, a test sprawdza widok:
 * kafle, rekord z wszystkimi rekordzistami i linkiem do spotkania, ranking gry z usuniętym na
 * końcu, pusty stan, rozbicie punktów i wygranych na gry oraz zmianę serii. Na 360 px
 * i desktopie, w obu motywach, bez poziomego przewijania i z kontrolą dostępności.
 */

const NOW = new Date('2026-11-12T19:00:00Z');
const CLUB = { name: 'Planszówki', logo_path: null, timezone: 'Europe/Warsaw' };
const BEA = member(2, 'Bea', 'Bobrowska');
const CEZARY = member(3, 'Cezary', 'Cichy');
const LONG = member(4, 'Bartłomiej', 'Wiśniewski-Szczebrzeszyński-Konstantynopolitański');
const ZOJA = member(20, 'Zoja', 'Zawada', true);
const AZUL = mockGame(1, 'Azul');
const GOLF = mockGame(2, 'Golf');
const OLD = mockGame(3, 'Stara gra', { deleted_at: '2026-11-10T12:00:00Z' });

const FINISHED = mockMeeting(5, 'Listopadowe granie', {
  status: 'finished',
  voting_open: false,
  starts_at: '2026-11-08T17:00:00Z',
  started_at: '2026-11-08T17:05:00Z',
  finished_at: '2026-11-08T21:00:00Z',
  participants: [ADA.id, BEA.id, CEZARY.id, LONG.id, ZOJA.id],
});

const play = (n: number, game: string): MockPlay => ({
  id: `00000000-0000-4000-f000-${n.toString().padStart(12, '0')}`,
  meeting_id: FINISHED.id,
  status: 'saved',
  started_at: '2026-11-08T18:00:00Z',
  saved_at: `2026-11-08T${18 + n}:00:00Z`,
  game_id: game,
  play_results: [
    { profile_id: BEA.id, is_win: true, seat: 1, place: 1, points: 10, ranking_value: 22 },
    { profile_id: CEZARY.id, is_win: false, seat: 2, place: 2, points: 6, ranking_value: 11 },
  ],
});

const STATS = {
  play_count: 14,
  last_played_at: FINISHED.starts_at,
  top_winners: [
    { profile_id: BEA.id, wins: 5 },
    { profile_id: CEZARY.id, wins: 5 },
  ],
  record: {
    value: 38,
    dir: 'asc',
    holders: [
      {
        profile_id: LONG.id,
        play_id: '00000000-0000-4000-f000-000000000001',
        meeting_id: FINISHED.id,
        starts_at: '2026-03-10T17:00:00Z',
      },
      {
        profile_id: BEA.id,
        play_id: '00000000-0000-4000-f000-000000000002',
        meeting_id: FINISHED.id,
        starts_at: FINISHED.starts_at,
      },
    ],
  },
  winner_average: 28.75,
  ranking: [
    { place: 1, profile_id: BEA.id, deleted: false, wins: 5, points: 80, plays: 12 },
    { place: 1, profile_id: CEZARY.id, deleted: false, wins: 5, points: 80, plays: 11 },
    { place: 3, profile_id: LONG.id, deleted: false, wins: 1, points: 40, plays: 9 },
    { place: 4, profile_id: ZOJA.id, deleted: true, wins: 3, points: 50, plays: 4 },
  ],
};

const SUMMARY = [
  {
    place: 1,
    profile_id: BEA.id,
    deleted: false,
    points: 26,
    wins: 3,
    games: [
      { game_id: AZUL.id, title: 'Azul', deleted: false, points: 20, wins: 2 },
      { game_id: OLD.id, title: 'Stara gra', deleted: true, points: 6, wins: 1 },
    ],
    streak_before: 3,
    streak_after: 4,
  },
  {
    place: 2,
    profile_id: LONG.id,
    deleted: false,
    points: 12,
    wins: 0,
    games: [
      { game_id: AZUL.id, title: 'Azul', deleted: false, points: 6, wins: 0 },
      { game_id: GOLF.id, title: 'Golf', deleted: false, points: 6, wins: 0 },
    ],
    streak_before: 2,
    streak_after: 0,
  },
  {
    place: 3,
    profile_id: CEZARY.id,
    deleted: false,
    points: 4,
    wins: 0,
    games: [{ game_id: GOLF.id, title: 'Golf', deleted: false, points: 4, wins: 0 }],
    streak_before: 0,
    streak_after: 0,
  },
];

async function openApp(page: Page, url: string, options: MockOptions = {}) {
  await page.clock.setFixedTime(NOW);
  const mock = await mockSupabase(page, {
    club: CLUB,
    members: [BEA, CEZARY, LONG, ZOJA],
    games: [{ ...AZUL }, { ...GOLF }, { ...OLD }],
    meetings: [{ ...FINISHED }],
    plays: [play(1, AZUL.id), play(2, AZUL.id), play(3, OLD.id), play(4, GOLF.id)],
    gameStats: (id) => (id === AZUL.id ? STATS : undefined),
    meetingSummary: (id) => (id === FINISHED.id ? SUMMARY : []),
    ...options,
  });
  await storeSession(page, session());
  await page.goto(url);
  return mock;
}

async function check(page: Page) {
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => animation.playState !== 'running'),
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBe(0);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`),
  ).toEqual([]);
}

test('statystyki gry: kafle, rekord z rekordzistami, ranking gry (GAME-11)', async ({ page }) => {
  await openApp(page, `/?p=game/${AZUL.id}`);
  const details = page.getByRole('dialog', { name: 'Azul' });
  const stats = details.getByRole('region', { name: 'Statystyki' });
  await expect(stats.getByRole('definition').first()).toHaveText('14');
  await expect(stats).toContainText('Ostatnia partia8 lis 2026');
  await expect(stats).toContainText('Bea Bobrowska, Cezary Cichy5 wygranych');
  await expect(stats).toContainText('Średni wynik zwycięzcy28,8');

  // Rekord „mniej = lepiej” z dwoma rekordzistami (Q25): kto i kiedy, z linkiem do spotkania.
  await expect(stats).toContainText('Rekord gry');
  await expect(stats).toContainText('38mniej = lepiej');
  const holder = stats.getByRole('link', {
    name: /^Otwórz spotkanie z rekordem: Bartłomiej Wiśniewski/,
  });
  await expect(holder).toContainText('10 mar 2026');
  await expect(
    stats.getByRole('link', { name: /rekordem: Bea Bobrowska, 8 lis 2026/ }),
  ).toBeVisible();

  // Ranking: remis 1, 1; usunięta Zoja na końcu mimo większej liczby wygranych.
  const ranking = stats.getByRole('list', { name: 'Ranking graczy w grze Azul' });
  const rows = ranking.locator(':scope > li');
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(0).locator('.rank')).toHaveText('1');
  await expect(rows.nth(1).locator('.rank')).toHaveText('1');
  await expect(rows.nth(0)).toContainText('Bea Bobrowska12 partii · 5 wygranych80pkt');
  await expect(rows.nth(1)).toContainText('Cezary Cichy11 partii');
  await expect(rows.nth(3)).toContainText('Zoja Zawada (usunięty)');
  await expect(rows.nth(3).locator('.row--muted')).toHaveCount(1);
  await check(page);

  await holder.click();
  await expect(page.getByRole('dialog', { name: 'Listopadowe granie' })).toBeVisible();
});

test('gra bez partii: pusty stan statystyk', async ({ page }) => {
  await openApp(page, `/?p=game/${GOLF.id}`);
  const details = page.getByRole('dialog', { name: 'Golf' });
  const stats = details.getByRole('region', { name: 'Statystyki' });
  await expect(stats).toContainText('Brak statystyk');
  await expect(stats).toContainText('Statystyki pojawią się po pierwszej zapisanej partii');
  await check(page);
});

test('podsumowanie spotkania: punkty z rozbiciem na gry, wygrane i seria (VIEW-4)', async ({
  page,
}) => {
  await openApp(page, `/?p=meeting/${FINISHED.id}`);
  const dialog = page.getByRole('dialog', { name: 'Listopadowe granie' });
  const summary = dialog.getByRole('list', {
    name: 'Podsumowanie spotkania: punkty, wygrane i serie graczy',
  });
  const rows = summary.locator(':scope > li');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('Bea Bobrowska');
  await expect(rows.nth(0)).toContainText('26 pkt');
  await expect(rows.nth(0)).toContainText('Azul +20, Stara gra (usunięta z kolekcji) +6');
  await expect(rows.nth(0)).toContainText('3 wygrane · Azul ×2, Stara gra (usunięta z kolekcji)');
  await expect(rows.nth(0)).toContainText('+1 → seria 4');
  await expect(rows.nth(1)).toContainText('Azul +6, Golf +6');
  await expect(rows.nth(1)).toContainText('seria przerwana');
  await expect(rows.nth(1)).not.toContainText('wygran');
  await expect(rows.nth(2)).toContainText('seria bez zmian');
  await check(page);
});

test('spotkanie bez zapisanych partii nie ma podsumowania', async ({ page }) => {
  await openApp(page, `/?p=meeting/${FINISHED.id}`, { plays: [], meetingSummary: () => [] });
  const dialog = page.getByRole('dialog', { name: 'Listopadowe granie' });
  await expect(dialog.getByText('Brak zapisanych partii.')).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Podsumowanie' })).toHaveCount(0);
});
