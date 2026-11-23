import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  EMPTY_PLAYER_STATS,
  member,
  mockGame,
  mockMeeting,
  mockSupabase,
  session,
  storeSession,
  type MockFilterCall,
  type MockOptions,
} from './support/supabaseMock';

/**
 * Profil gracza (PRD STAT-1–STAT-3, USR-4, MEM-5): statystyki profilu z filtrami jak w rankingu,
 * leaderboard i ulubione z całej historii, 5 ostatnich spotkań oraz rekordy osobiste w grach
 * z okładkami i pieczątką rekordu klubu. Wyniki liczy baza (`player_stats`, `player_records`,
 * test pgTAP `220`); tu API Supabase jest atrapą. Każdy test przechodzi na 360 px i na
 * desktopie, w motywie jasnym i ciemnym.
 */

const CLUB = { name: 'Planszówki', logo_path: null };
const BEA = member(2, 'Bea', 'Bobrowska');
const ZOJA = member(3, 'Zoja', 'Zawada', true);
const AZUL = mockGame(1, 'Azul');
const BRZDEK = mockGame(2, 'Brzdęk');
const CARCASSONNE = mockGame(3, 'Carcassonne');
const MARZEC = mockMeeting(1, 'Marcowe granie', {
  starts_at: '2026-03-10T17:00:00+00:00',
  status: 'finished',
  voting_open: false,
  started_at: '2026-03-10T17:00:00+00:00',
  finished_at: '2026-03-10T22:00:00+00:00',
  participants: [BEA.id],
});
const LUTY = mockMeeting(2, 'Lutowe granie', {
  starts_at: '2026-02-10T17:00:00+00:00',
  status: 'finished',
  voting_open: false,
  started_at: '2026-02-10T17:00:00+00:00',
  finished_at: '2026-02-10T22:00:00+00:00',
  participants: [BEA.id],
});

const recent = (meeting: typeof MARZEC, plays: number, wins: number, points: number) => ({
  meeting_id: meeting.id,
  title: meeting.title,
  starts_at: meeting.starts_at,
  plays,
  wins,
  points,
});

/** Cała historia Bei: 7 partii, 4 wygrane (57%). */
const BEA_ALL = {
  meetings: 4,
  plays: 7,
  wins: 4,
  points: 56,
  wins_total: 4,
  streak_record: 2,
  streak_current: 1,
  places: { points: 1, wins: 2 },
  favorite_game: { game_id: AZUL.id, title: AZUL.title, cover_path: null, plays: 3, wins: 2 },
  best_game: { game_id: AZUL.id, title: AZUL.title, cover_path: null, plays: 3, wins: 2 },
  recent_meetings: [recent(MARZEC, 2, 2, 20), recent(LUTY, 2, 0, 12)],
};

/** Tylko Brzdęk: statystyki profilu z filtrem, reszta bez zmian (cała historia). */
const BEA_BRZDEK = { ...BEA_ALL, meetings: 3, plays: 3, wins: 1 };

/** Usunięta Zoja: statystyki z historii, bez miejsc w rankingach (LB-7). */
const ZOJA_ALL = {
  ...EMPTY_PLAYER_STATS,
  meetings: 1,
  plays: 1,
  wins: 1,
  points: 10,
  wins_total: 1,
  streak_record: 1,
  streak_current: 1,
  favorite_game: { game_id: BRZDEK.id, title: BRZDEK.title, cover_path: null, plays: 1, wins: 1 },
  recent_meetings: [recent(MARZEC, 1, 1, 10)],
};

function playerStats(profileId: string, call: MockFilterCall) {
  if (profileId === BEA.id) {
    if (call.game_ids?.length === 1 && call.game_ids[0] === BRZDEK.id) return BEA_BRZDEK;
    if (call.date_from || call.date_to || call.game_ids)
      return { ...BEA_ALL, meetings: 0, plays: 0, wins: 0 };
    return BEA_ALL;
  }
  if (profileId === ZOJA.id) return ZOJA_ALL;
  return EMPTY_PLAYER_STATS;
}

const record = (
  game: typeof AZUL,
  value: number | null,
  clubRecord = false,
  meeting: typeof MARZEC | null = MARZEC,
) => ({
  game_id: game.id,
  title: game.title,
  cover_path: null,
  game_deleted: false,
  dir: value === null ? null : 'desc',
  value,
  play_id: value === null ? null : '00000000-0000-4000-f000-000000000001',
  meeting_id: value === null ? null : (meeting?.id ?? null),
  meeting_title: value === null ? null : (meeting?.title ?? null),
  starts_at: value === null ? null : (meeting?.starts_at ?? null),
  club_record: clubRecord,
});

function playerRecords(profileId: string, call: MockFilterCall) {
  if (profileId !== BEA.id) return [];
  const all = [record(AZUL, 42, true), record(BRZDEK, 17.5), record(CARCASSONNE, null)];
  return call.game_ids ? all.filter((r) => call.game_ids?.includes(r.game_id)) : all;
}

async function openProfile(page: Page, id: string, options: MockOptions = {}) {
  const mock = await mockSupabase(page, {
    club: CLUB,
    members: [BEA, ZOJA],
    games: [AZUL, BRZDEK, CARCASSONNE],
    meetings: [MARZEC, LUTY],
    playerStats,
    playerRecords,
    ...options,
  });
  await storeSession(page, session());
  await page.goto(`/?p=profile/${id}`);
  const dialog = page.getByRole('dialog', { name: 'Profil' });
  await expect(dialog).toBeVisible();
  return { mock, dialog };
}

async function axe(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  return results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`);
}

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

/** Kafel statystyk o podanej etykiecie. */
const tile = (scope: Locator, label: string) =>
  scope.locator('.player-stats__tile', { has: scope.page().getByText(label, { exact: true }) });

/** Pasek filtrów grupy (statystyki profilu albo rekordy). */
const filterBar = (dialog: Locator, name: string) => dialog.getByRole('group', { name });

async function pickGame(page: Page, bar: Locator, title: string, label = title) {
  await bar.getByRole('button', { name: /^Gry:/ }).click();
  const games = page.getByRole('dialog', { name: 'Gry' });
  await games.getByRole('option', { name: title }).click();
  await games.getByRole('button', { name: 'Gotowe' }).click();
  await expect(bar.getByRole('button', { name: `Gry: ${label}` })).toBeVisible();
}

test('statystyki: grupy profilu, leaderboardu i ulubionych, ostatnie spotkania (STAT-1, STAT-2)', async ({
  page,
}) => {
  const { mock, dialog } = await openProfile(page, BEA.id);
  const profileStats = dialog.getByRole('definition').first();
  await expect(profileStats).toBeVisible();
  await expect(tile(dialog, 'Spotkania')).toContainText('4');
  await expect(tile(dialog, 'Partie')).toContainText('7');
  await expect(tile(dialog, 'Wygrane')).toContainText('4');
  await expect(tile(dialog, '% wygranych')).toContainText('57%');

  const leaderboard = dialog.getByLabel('Leaderboard z całej historii');
  await expect(leaderboard.locator('.player-stats__tile')).toHaveText([
    'Miejsce w leaderboardzie punktowym1.',
    'Liczba punktów56',
    'Miejsce w leaderboardzie zwycięstw2.',
    'Liczba zwycięstw4',
    'Obecna seria1',
    'Najwyższa seria2',
  ]);

  const favorites = dialog.getByRole('group', { name: 'Ulubione gry z całej historii' });
  await expect(tile(favorites, 'Ulubiona gra')).toContainText('3 partie · 2 wygrane');
  await expect(tile(favorites, 'Najlepsza gra')).toContainText('67% wygranych · 3 partie');
  await expect(favorites.locator('.game-cover')).toHaveCount(2);

  const meetings = dialog.getByRole('list', { name: 'Ostatnie spotkania' }).getByRole('listitem');
  await expect(meetings).toHaveCount(2);
  await expect(meetings.first()).toContainText('Marcowe granie');
  await expect(meetings.first()).toContainText('2 partie · 2 wygrane');
  await expect(meetings.first()).toContainText('20pkt');
  expect(mock.playerStatsCalls).toContainEqual({
    profileId: BEA.id,
    date_from: null,
    date_to: null,
    game_ids: null,
  });

  expect(await horizontalOverflow(page)).toBe(0);
  expect(await axe(page)).toEqual([]);

  // Link spotkania otwiera spotkanie, a link gry jej szczegóły (PRD §4).
  await meetings
    .first()
    .getByRole('link', { name: 'Otwórz spotkanie: Marcowe granie, 10 mar 2026' })
    .click();
  await expect(page.getByRole('dialog', { name: /Marcowe granie/ })).toBeVisible();
  await page.goBack();
  await tile(favorites, 'Najlepsza gra').getByRole('link', { name: 'Azul' }).click();
  await expect(page.getByRole('dialog', { name: /Azul/ })).toBeVisible();
});

test('statystyki profilu: filtry jak w rankingu zmieniają tylko pierwszą grupę (STAT-3, LB-4)', async ({
  page,
}) => {
  const { mock, dialog } = await openProfile(page, BEA.id);
  const bar = filterBar(dialog, 'Filtry statystyk profilu');
  await expect(bar.getByRole('button', { name: 'Zakres dat: Cała historia' })).toBeVisible();
  await pickGame(page, bar, 'Brzdęk');
  await expect
    .poll(() => mock.playerStatsCalls.at(-1))
    .toEqual({ profileId: BEA.id, date_from: null, date_to: null, game_ids: [BRZDEK.id] });
  await expect(tile(dialog, 'Partie')).toContainText('3');
  await expect(tile(dialog, '% wygranych')).toContainText('33%');
  // Leaderboard i ulubione zostają z całej historii.
  await expect(tile(dialog, 'Liczba punktów')).toContainText('56');
  await expect(tile(dialog, 'Ulubiona gra')).toContainText('Azul');
  // Rekordy mają własne filtry.
  expect(mock.playerRecordsCalls.every((c) => c.game_ids === null)).toBe(true);

  // Druga gra dochodzi do wyboru; atrapa nie ma dla niej partii.
  await pickGame(page, bar, 'Azul', '2 gry');
  await expect(dialog).toContainText('Brak partii dla tych filtrów');
  await bar.getByRole('button', { name: /Wyczyść filtry/ }).click();
  await expect(tile(dialog, 'Partie')).toContainText('7');
  expect(await horizontalOverflow(page)).toBe(0);
  expect(await axe(page)).toEqual([]);
});

test('rekordy osobiste: każda gra z okładką, „–” bez wyniku, pieczątka rekordu klubu i filtry (USR-4)', async ({
  page,
}) => {
  const { mock, dialog } = await openProfile(page, BEA.id);
  const list = dialog.getByRole('list', { name: 'Rekordy osobiste w grach' });
  const cards = list.locator('.record');
  await expect(cards).toHaveCount(3);
  await expect(list.locator('.game-cover')).toHaveCount(3);
  await expect(cards.nth(0)).toContainText('Azul');
  await expect(cards.nth(0)).toContainText('42');
  await expect(cards.nth(0)).toContainText('Rekord klubu');
  await expect(cards.nth(0)).toContainText('Marcowe granie');
  await expect(cards.nth(1)).toContainText('17,5');
  await expect(cards.nth(1)).not.toContainText('Rekord klubu');
  await expect(cards.nth(2)).toContainText('–');
  await expect(cards.nth(2)).toContainText('Brak wyniku');

  // Widok: tylko z wynikiem, tylko rekordy klubu.
  await dialog.getByRole('button', { name: /Pokaż rekordy/ }).click();
  await page.getByRole('option', { name: 'Tylko z wynikiem' }).click();
  await expect(cards).toHaveCount(2);
  await dialog.getByRole('button', { name: /Pokaż rekordy/ }).click();
  await page.getByRole('option', { name: 'Tylko rekordy klubu' }).click();
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toHaveAttribute('data-club-record', 'true');
  expect(await axe(page)).toEqual([]);

  await dialog.getByRole('button', { name: /Pokaż rekordy/ }).click();
  await page.getByRole('option', { name: 'Wszystkie rekordy' }).click();
  await pickGame(page, filterBar(dialog, 'Filtry rekordów osobistych'), 'Brzdęk');
  await expect
    .poll(() => mock.playerRecordsCalls.at(-1))
    .toEqual({ profileId: BEA.id, date_from: null, date_to: null, game_ids: [BRZDEK.id] });
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText('Brzdęk');

  await cards
    .first()
    .getByRole('link', { name: /Otwórz spotkanie z rekordem/ })
    .click();
  await expect(page.getByRole('dialog', { name: /Marcowe granie/ })).toBeVisible();
  expect(await horizontalOverflow(page)).toBe(0);
});

test('usunięty członek: profil tylko do odczytu ze statystykami z historii (MEM-5, LB-7)', async ({
  page,
}) => {
  const { dialog } = await openProfile(page, ZOJA.id);
  await expect(dialog).toContainText('Zoja Zawada');
  await expect(dialog).toContainText('Profil jest tylko do odczytu.');
  await expect(dialog.getByRole('button', { name: 'Usuń członka' })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Ustawienia' })).toHaveCount(0);
  await expect(tile(dialog, 'Partie')).toContainText('1');
  await expect(tile(dialog, 'Miejsce w leaderboardzie punktowym')).toContainText('Brak miejsca');
  await expect(tile(dialog, 'Miejsce w leaderboardzie zwycięstw')).toContainText('Brak miejsca');
  await expect(tile(dialog, 'Najlepsza gra')).toContainText('Zagraj co najmniej 3 partie');
  expect(await axe(page)).toEqual([]);
});

test('zero partii: stan oczekiwania bez filtrów statystyk, rekordy bez wyników', async ({
  page,
}) => {
  const { dialog } = await openProfile(page, BEA.id, {
    playerStats: () => EMPTY_PLAYER_STATS,
    playerRecords: () => [record(AZUL, null), record(BRZDEK, null)],
  });
  await expect(dialog.getByText('Statystyki pojawią się po pierwszej partii')).toBeVisible();
  await expect(filterBar(dialog, 'Filtry statystyk profilu')).toHaveCount(0);
  await expect(dialog.locator('.record--empty')).toHaveCount(2);
});
