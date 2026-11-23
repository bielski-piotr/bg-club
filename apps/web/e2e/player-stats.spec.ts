import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  EMPTY_PLAYER_STATS,
  member,
  mockGame,
  mockMeeting,
  mockSupabase,
  session,
  storeSession,
  type MockOptions,
} from './support/supabaseMock';

/**
 * Statystyki gracza w profilu (PRD STAT-1–STAT-3, USR-4, MEM-5): liczniki, miejsca w trzech
 * rankingach, ulubiona i najlepsza gra (Q21), ostatnie partie z linkami do spotkań i filtr
 * roku. Wyniki liczy baza (`player_stats`, testy pgTAP `220`); tu API Supabase jest atrapą.
 * Każdy test przechodzi na 360 px i na desktopie, w motywie jasnym i ciemnym.
 */

const CLUB = { name: 'Planszówki', logo_path: null };
const BEA = member(2, 'Bea', 'Bobrowska');
const ZOJA = member(3, 'Zoja', 'Zawada', true);
const AZUL = mockGame(1, 'Azul');
const BRZDEK = mockGame(2, 'Brzdęk');
const MARZEC = mockMeeting(1, 'Marcowe granie', {
  starts_at: '2026-03-10T17:00:00+00:00',
  status: 'finished',
  voting_open: false,
  started_at: '2026-03-10T17:00:00+00:00',
  finished_at: '2026-03-10T22:00:00+00:00',
  participants: [BEA.id],
});

const recent = (n: number, game: typeof AZUL, place: number, points: number) => ({
  play_id: `00000000-0000-4000-f000-${n.toString(16).padStart(12, '0')}`,
  meeting_id: MARZEC.id,
  meeting_title: MARZEC.title,
  starts_at: MARZEC.starts_at,
  game_id: game.id,
  game_title: game.title,
  place,
  points,
  is_win: place === 1,
});

/** Cała historia Bei: 7 partii, 4 wygrane (57%), wspólne 1. miejsce w serii. */
const BEA_ALL = {
  years: [2026, 2025],
  meetings: 4,
  plays: 7,
  wins: 4,
  points: 56,
  streak_record: 2,
  streak_current: 1,
  places: { points: 1, wins: 2 },
  favorite_game: { game_id: AZUL.id, title: AZUL.title, plays: 3, wins: 2 },
  best_game: { game_id: AZUL.id, title: AZUL.title, plays: 3, wins: 2 },
  recent_plays: [recent(7, BRZDEK, 1, 10), recent(6, AZUL, 2, 6)],
};

/** Rok 2025 Bei: jedna partia, bez gry z ≥ 3 partiami. */
const BEA_2025 = {
  ...BEA_ALL,
  meetings: 1,
  plays: 1,
  wins: 1,
  points: 10,
  streak_record: 1,
  streak_current: 1,
  places: { points: 1, wins: 1 },
  favorite_game: { game_id: AZUL.id, title: AZUL.title, plays: 1, wins: 1 },
  best_game: null,
  recent_plays: [recent(1, AZUL, 1, 10)],
};

/** Usunięta Zoja: statystyki z historii, bez miejsc w rankingach (LB-7). */
const ZOJA_ALL = {
  ...EMPTY_PLAYER_STATS,
  years: [2026],
  meetings: 1,
  plays: 1,
  wins: 1,
  points: 10,
  streak_record: 1,
  streak_current: 1,
  favorite_game: { game_id: BRZDEK.id, title: BRZDEK.title, plays: 1, wins: 1 },
  recent_plays: [recent(5, BRZDEK, 1, 10)],
};

function playerStats(profileId: string, year: number | null) {
  if (profileId === BEA.id) {
    if (year === null) return BEA_ALL;
    if (year === 2025) return BEA_2025;
    return { ...EMPTY_PLAYER_STATS, years: BEA_ALL.years };
  }
  if (profileId === ZOJA.id) return ZOJA_ALL;
  return EMPTY_PLAYER_STATS;
}

async function openProfile(page: Page, id: string, options: MockOptions = {}) {
  const mock = await mockSupabase(page, {
    club: CLUB,
    members: [BEA, ZOJA],
    games: [AZUL, BRZDEK],
    meetings: [MARZEC],
    playerStats,
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

/** Wartość kafla statystyk o podanej etykiecie. */
const tile = (scope: ReturnType<Page['getByRole']>, label: string) =>
  scope.locator('.player-stats__tile', { has: scope.page().getByText(label, { exact: true }) });

test('statystyki gracza: liczniki, miejsca, ulubiona i najlepsza gra, ostatnie partie (STAT-1, STAT-2)', async ({
  page,
}) => {
  const { mock, dialog } = await openProfile(page, BEA.id);
  const counters = dialog.getByRole('definition').first();
  await expect(counters).toBeVisible();
  await expect(tile(dialog, 'Spotkania')).toContainText('4');
  await expect(tile(dialog, 'Partie')).toContainText('7');
  await expect(tile(dialog, '% wygranych')).toContainText('57%');
  await expect(tile(dialog, 'Rekord serii')).toContainText('2');
  await expect(tile(dialog, 'Bieżąca seria')).toContainText('1');
  await expect(tile(dialog, 'Wygrane').first()).toContainText('4');

  const places = dialog.locator('.player-stats--places');
  await expect(places.locator('.player-stats__tile')).toHaveText(['Punkty1.', 'Wygrane2.']);

  await expect(tile(dialog, 'Ulubiona gra')).toContainText('3 partie · 2 wygrane');
  await expect(tile(dialog, 'Najlepsza gra')).toContainText('67% wygranych · 3 partie');

  const recentPlays = dialog.getByRole('list', { name: 'Ostatnie partie' }).getByRole('listitem');
  await expect(recentPlays).toHaveCount(2);
  await expect(recentPlays.first()).toContainText('Brzdęk');
  await expect(recentPlays.first()).toContainText('10pkt');
  expect(mock.playerStatsCalls).toContainEqual({ profileId: BEA.id, year: null });

  expect(await horizontalOverflow(page)).toBe(0);
  expect(await axe(page)).toEqual([]);

  // Link partii otwiera spotkanie, a link gry jej szczegóły (PRD §4).
  await recentPlays
    .first()
    .getByRole('link', { name: 'Otwórz spotkanie: Marcowe granie, 10 mar 2026' })
    .click();
  await expect(page.getByRole('dialog', { name: /Marcowe granie/ })).toBeVisible();
  await page.goBack();
  await tile(dialog, 'Najlepsza gra').getByRole('link', { name: 'Azul' }).click();
  await expect(page.getByRole('dialog', { name: /Azul/ })).toBeVisible();
});

test('filtr roku: rok z partiami, pusta najlepsza gra i rok bez partii (STAT-3, Q21)', async ({
  page,
}) => {
  const { mock, dialog } = await openProfile(page, BEA.id);
  const filter = dialog.getByRole('button', { name: /Zakres statystyk/ });
  await expect(filter).toContainText('Cała historia');

  await filter.click();
  await expect(page.getByRole('option')).toHaveText(['Cała historia', '2026', '2025']);
  await page.getByRole('option', { name: '2025' }).click();
  await expect(tile(dialog, 'Partie')).toContainText('1');
  await expect(tile(dialog, 'Najlepsza gra')).toContainText(
    'Zagraj co najmniej 3 partie jednej gry.',
  );
  await expect(
    dialog.getByRole('list', { name: 'Ostatnie partie' }).getByRole('listitem'),
  ).toHaveCount(1);
  expect(mock.playerStatsCalls).toContainEqual({ profileId: BEA.id, year: 2025 });

  await filter.click();
  await page.getByRole('option', { name: '2026' }).click();
  await expect(dialog).toContainText('Brak partii w 2026');
  expect(await horizontalOverflow(page)).toBe(0);
  expect(await axe(page)).toEqual([]);
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
  const places = dialog.locator('.player-stats--places .player-stats__value');
  await expect(places).toHaveText(['–Brak miejsca', '–Brak miejsca']);
  await expect(tile(dialog, 'Najlepsza gra')).toContainText('Zagraj co najmniej 3 partie');
  expect(await axe(page)).toEqual([]);
});

test('zero partii: stan oczekiwania bez filtru roku', async ({ page }) => {
  const { dialog } = await openProfile(page, BEA.id, { playerStats: () => EMPTY_PLAYER_STATS });
  await expect(dialog.getByText('Statystyki pojawią się po pierwszej partii')).toBeVisible();
  await expect(dialog.getByRole('button', { name: /Zakres statystyk/ })).toHaveCount(0);
});
