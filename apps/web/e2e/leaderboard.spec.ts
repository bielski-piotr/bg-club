import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  ADA,
  member,
  mockSupabase,
  session,
  storeSession,
  mockGame,
  type MockLeaderboardCall,
  type MockLeaderboardRow,
  type MockOptions,
  type MockProfile,
} from './support/supabaseMock';

/**
 * Widżet i popup rankingu (PRD LB-1…LB-7, DS §6, §8). Ranking liczy baza (`leaderboard`, test
 * SQL `200`); tu atrapa zwraca gotowe wiersze, a test sprawdza układ: zakładki, podium bez
 * remisów, miejsca 4–7 w widżecie, pełną listę, filtry dat (kalendarz) i gier (autouzupełnianie)
 * w widżecie i popupie, szczegóły rozstrzygnięcia remisów, wyróżnienie bieżącego użytkownika,
 * wyszarzonych usuniętych na końcu, linki do profili i brak poziomego przewijania na 360 px.
 */

const CLUB = { name: 'Planszówki', logo_path: null, timezone: 'Europe/Warsaw' };
const LONG = member(2, 'Bartłomiej', 'Wiśniewski-Szczebrzeszyński-Konstantynopolitański');
const PEOPLE: MockProfile[] = [
  LONG,
  member(3, 'Cezary', 'Cichy'),
  member(4, 'Dorota', 'Dąbrowska'),
  member(5, 'Ewa', 'Ernst'),
  member(6, 'Feliks', 'Fik'),
  member(7, 'Gaja', 'Gil'),
  member(8, 'Halina', 'Hoża'),
  member(9, 'Igor', 'Ił'),
];
const ZOJA = member(20, 'Zoja', 'Zawada', true);

const row = (
  profile: MockProfile,
  place: number,
  value: number,
  deleted = false,
  extra: Partial<MockLeaderboardRow> = {},
): MockLeaderboardRow => ({
  place,
  profile_id: profile.id,
  first_name: profile.first_name,
  last_name: profile.last_name,
  avatar_path: null,
  deleted,
  podium: !deleted && place <= 3,
  value,
  ...extra,
});

const MEETING = '00000000-0000-4000-c000-000000000009';
const AZUL = mockGame(1, 'Azul');
const BRZDEK = mockGame(2, 'Brzdęk');
const KOSCI = mockGame(3, 'Kości');
const reached = (points: number, wins: number): Partial<MockLeaderboardRow> => ({
  tied: true,
  reached_meeting_id: MEETING,
  reached_meeting_title: 'Listopadowe granie',
  reached_at: '2026-11-07T17:00:00Z',
  reached_points: points,
  wins,
});

/** Cała historia, punkty: Bartłomiej i Cezary po 42 — wyżej Bartłomiej (więcej pkt na spotkaniu). */
const POINTS: MockLeaderboardRow[] = [
  row(LONG, 1, 42, false, reached(10, 3)),
  row(PEOPLE[1] as MockProfile, 2, 42, false, reached(6, 3)),
  row(PEOPLE[2] as MockProfile, 3, 30),
  row(PEOPLE[3] as MockProfile, 4, 25),
  row(PEOPLE[4] as MockProfile, 5, 20),
  row(PEOPLE[5] as MockProfile, 6, 18),
  row(PEOPLE[6] as MockProfile, 7, 12),
  row(PEOPLE[7] as MockProfile, 8, 10),
  row(ADA, 9, 4),
  row(ZOJA, 10, 50, true),
];
/** Filtr dat albo gier: dwóch graczy. */
const POINTS_FILTERED: MockLeaderboardRow[] = [row(ADA, 1, 16), row(LONG, 2, 8)];
const WINS: MockLeaderboardRow[] = [row(ADA, 1, 7), row(LONG, 2, 1)];

const isMobile = () => test.info().project.name.startsWith('mobile');

async function openApp(page: Page, options: MockOptions = {}, path = '/') {
  const mock = await mockSupabase(page, {
    club: CLUB,
    members: [...PEOPLE, ZOJA],
    games: [AZUL, BRZDEK, KOSCI],
    // Klasyfikowani są ci sami gracze we wszystkich zakładkach (LB-5); z filtrami są tylko punkty.
    leaderboard: (kind, call: MockLeaderboardCall) =>
      call.date_from || call.date_to || call.game_ids
        ? kind === 'points'
          ? POINTS_FILTERED
          : []
        : kind === 'wins'
          ? WINS
          : POINTS,
    ...options,
  });
  await storeSession(page, session());
  await page.goto(path);
  return mock;
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

const search = (page: Page) => page.evaluate(() => decodeURIComponent(window.location.search));

const noFilters = (call: MockLeaderboardCall) =>
  call.date_from === null && call.date_to === null && call.game_ids === null;

test('widżet: podium bez remisów, miejsca 4–7 i własny wiersz z całej historii', async ({
  page,
}) => {
  const mock = await openApp(page);
  const widget = page.getByRole('region', { name: 'Ranking', exact: true });
  await expect(widget.getByRole('tab', { name: 'Punkty' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(widget.getByRole('tab')).toHaveText(['Punkty', 'Wygrane']);
  const podium = widget.getByRole('list', { name: 'Podium' });
  await expect(podium.getByRole('listitem').filter({ hasText: '1. miejsce' })).toContainText(
    'Bartłomiej',
  );
  await expect(podium.getByRole('listitem').filter({ hasText: '2. miejsce' })).toContainText(
    'Cezary',
  );
  await expect(podium).not.toContainText('osoby');

  const list = widget.getByRole('list', { name: 'Kolejne miejsca' });
  const rows = list.locator(':scope > li');
  await expect(rows).toHaveCount(5);
  await expect(rows.nth(0)).toContainText('4');
  await expect(rows.nth(3)).toContainText('Halina Hoża');
  // Ada (zalogowana) jest 9., poza miejscami 4–7: jej wiersz jest na końcu, wyróżniony.
  await expect(rows.nth(4)).toContainText('Ada Adminowska');
  await expect(rows.nth(4)).toContainText('Ty');
  await expect(rows.nth(4).locator('.row--highlighted')).toHaveCount(1);
  await expect(list).not.toContainText('Igor');
  await expect(widget).not.toContainText('Zoja');
  // Bez filtrów: cała historia i wszystkie gry, nic nie jest zaznaczone.
  await expect(widget.getByRole('button', { name: 'Zakres dat: Cała historia' })).toBeVisible();
  await expect(widget.getByRole('button', { name: 'Gry: Wszystkie gry' })).toBeVisible();
  await expect(widget.getByRole('button', { name: /Wyczyść filtry/ })).toHaveCount(0);
  expect(mock.leaderboardCalls.every(noFilters)).toBe(true);

  await widget.getByRole('tab', { name: 'Wygrane' }).click();
  await expect(podium).toContainText('wygranych');
  await expect(widget.getByRole('list', { name: 'Kolejne miejsca' })).toHaveCount(0);

  expect(await horizontalOverflow(page)).toBe(0);
  expect(await axe(page)).toEqual([]);
});

test('widżet: filtr dat w kalendarzu i gier z autouzupełnianiem, osobno i razem', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-11-23T12:00:00Z'));
  const mock = await openApp(page);
  const widget = page.getByRole('region', { name: 'Ranking', exact: true });

  await widget.getByRole('button', { name: 'Zakres dat: Cała historia' }).click();
  const calendar = page.getByRole('dialog', { name: 'Zakres dat' });
  await expect(calendar.getByRole('button', { pressed: true })).toHaveCount(0);
  await expect(
    calendar.getByRole('button', { name: /Wybierz miesiąc \(Listopad\)/ }),
  ).toBeVisible();
  // Szybka zmiana miesiąca i roku.
  await calendar.getByRole('button', { name: /Wybierz rok/ }).click();
  await calendar.getByRole('button', { name: '2025', exact: true }).click();
  await calendar.getByRole('button', { name: /Wybierz miesiąc/ }).click();
  await calendar.getByRole('button', { name: 'Październik' }).click();
  await calendar.getByRole('button', { name: /, 1 października 2025/ }).click();
  // Dzień następnego miesiąca widoczny w siatce przełącza kalendarz na listopad.
  await calendar.getByRole('button', { name: /, 2 listopada 2025/ }).click();
  await expect(
    calendar.getByRole('button', { name: /Wybierz miesiąc \(Listopad\)/ }),
  ).toBeVisible();
  await expect
    .poll(() => mock.leaderboardCalls.at(-1))
    .toEqual({ kind: 'points', date_from: '2025-10-01', date_to: '2025-11-02', game_ids: null });
  await page.keyboard.press('Escape');
  await expect(calendar).toHaveCount(0);
  // Esc zamknął tylko panel filtru.
  await expect(
    widget.getByRole('button', { name: 'Zakres dat: 1 paź 2025 – 2 lis 2025' }),
  ).toBeVisible();
  await expect(widget.getByRole('list', { name: 'Podium' }).locator(':scope > li')).toHaveCount(2);

  await widget.getByRole('button', { name: /^Gry:/ }).click();
  const games = page.getByRole('dialog', { name: 'Gry' });
  const search = games.getByRole('combobox', { name: 'Szukaj gry' });
  await search.fill('brzd');
  await expect(games.getByRole('option')).toHaveText(['Brzdęk']);
  await search.press('Enter');
  await search.fill('');
  await games.getByRole('option', { name: 'Kości' }).click();
  await expect(games.getByRole('option', { selected: true })).toHaveText(['Brzdęk', 'Kości']);
  await games.getByRole('button', { name: 'Gotowe' }).click();
  await expect(widget.getByRole('button', { name: 'Gry: 2 gry' })).toBeVisible();
  await expect
    .poll(() => mock.leaderboardCalls.at(-1))
    .toEqual({
      kind: 'points',
      date_from: '2025-10-01',
      date_to: '2025-11-02',
      game_ids: [BRZDEK.id, KOSCI.id].sort(),
    });

  // „Zobacz więcej” przenosi zakładkę i filtry do popupu.
  await widget.getByRole('link', { name: 'Zobacz pełny ranking' }).click();
  const dialog = page.getByRole('dialog', { name: 'Ranking' });
  await expect(dialog.getByRole('button', { name: 'Gry: 2 gry' })).toBeVisible();
  await page.goBack();

  await widget.getByRole('button', { name: /Wyczyść filtry/ }).click();
  await expect(widget.getByRole('button', { name: 'Zakres dat: Cała historia' })).toBeVisible();
  await expect(widget.getByRole('button', { name: 'Gry: Wszystkie gry' })).toBeVisible();
  // Ranking bez filtrów wraca (z pamięci podręcznej zapytania).
  await expect(widget.getByRole('list', { name: 'Podium' }).locator(':scope > li')).toHaveCount(3);
  expect(await horizontalOverflow(page)).toBe(0);
});

test('popup: pełna lista, usunięci na końcu, filtr i 2 graczy', async ({ page }) => {
  const mock = await openApp(page);
  const widget = page.getByRole('region', { name: 'Ranking', exact: true });
  await widget.getByRole('tab', { name: 'Wygrane' }).click();
  await widget.getByRole('tab', { name: 'Punkty' }).click();
  await widget.getByRole('link', { name: 'Zobacz pełny ranking' }).click();
  const dialog = page.getByRole('dialog', { name: 'Ranking' });
  await expect(dialog).toBeVisible();
  expect(await search(page)).toBe('?p=leaderboard/points');
  await expect(dialog).toContainText('10 graczy');

  const rows = dialog.getByRole('list', { name: 'Kolejne miejsca' }).locator(':scope > li');
  await expect(rows).toHaveCount(7);
  const removed = rows.last();
  await expect(removed).toContainText('–');
  await expect(removed).toContainText('Zoja Zawada (usunięty)');
  await expect(removed.locator('.row--muted')).toHaveCount(1);

  // Długie nazwisko nie rozpycha wiersza: tekst jest ucięty wielokropkiem.
  const podiumName = dialog.locator('.podium__name').first();
  const box = await podiumName.boundingBox();
  const dialogBox = await dialog.boundingBox();
  expect(box && dialogBox && box.x + box.width <= dialogBox.x + dialogBox.width).toBe(true);

  await dialog.getByRole('button', { name: /^Gry:/ }).click();
  await page.getByRole('dialog', { name: 'Gry' }).getByRole('option', { name: 'Azul' }).click();
  await page.keyboard.press('Escape');
  await expect(dialog).toContainText('2 graczy');
  await expect(dialog.getByRole('list', { name: 'Podium' }).locator(':scope > li')).toHaveCount(2);
  await expect(dialog.getByRole('list', { name: 'Kolejne miejsca' })).toHaveCount(0);
  expect(mock.leaderboardCalls).toContainEqual({
    kind: 'points',
    date_from: null,
    date_to: null,
    game_ids: [AZUL.id],
  });

  await dialog.getByRole('tab', { name: 'Wygrane' }).click();
  await expect(dialog).toContainText('Brak partii dla wybranych filtrów');

  expect(await horizontalOverflow(page)).toBe(0);
  expect(await axe(page)).toEqual([]);
});

test('remisy: przycisk otwiera szczegóły rozstrzygnięcia', async ({ page }) => {
  await openApp(page);
  const widget = page.getByRole('region', { name: 'Ranking', exact: true });
  await widget.getByRole('link', { name: /^Remisy/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Rozstrzygnięcie remisów' });
  await expect(dialog).toBeVisible();
  expect(await search(page)).toBe('?p=leaderboard/points/ties');
  await expect(dialog.locator('.ties__rules > li')).toHaveCount(4);
  const group = dialog.getByRole('region', { name: /Remis: wynik 42 pkt, miejsca 1–2/ });
  await expect(group.getByRole('listitem')).toHaveCount(2);
  await expect(group).toContainText('Listopadowe granie');
  await expect(group).toContainText('Przed Cezary Cichy: więcej punktów na tym spotkaniu');
  await expect(group.locator('.ties__fact--decisive')).toHaveText('Pkt na spotkaniu10');
  expect(await horizontalOverflow(page)).toBe(0);
  expect(await axe(page)).toEqual([]);

  // Wygrane bez równych wyników: brak przycisku.
  await page.goBack();
  await widget.getByRole('tab', { name: 'Wygrane' }).click();
  await expect(widget.getByRole('list', { name: 'Podium' })).toContainText('wygranych');
  await expect(widget.getByRole('link', { name: /^Remisy/ })).toHaveCount(0);
});

test('awatar na podium i w liście otwiera profil gracza', async ({ page }) => {
  await openApp(page, {}, '/?p=leaderboard');
  const dialog = page.getByRole('dialog', { name: 'Ranking' });
  await dialog.getByRole('link', { name: 'Otwórz profil: Dorota Dąbrowska' }).click();
  await expect(page.getByRole('dialog', { name: 'Profil' })).toBeVisible();
  expect(await search(page)).toBe(`?p=leaderboard&p=profile/${PEOPLE[2]?.id ?? ''}`);
  await page.goBack();
  await dialog.getByRole('link', { name: 'Otwórz profil: Zoja Zawada' }).click();
  await expect(page.getByRole('dialog', { name: 'Profil' })).toBeVisible();
  if (isMobile()) {
    // Telefon: popup to pełnoekranowy arkusz.
    expect(await horizontalOverflow(page)).toBe(0);
  }
});

test('jeden gracz: samo 1. miejsce na podium', async ({ page }) => {
  await openApp(page, { leaderboard: () => [row(ADA, 1, 3)] });
  const widget = page.getByRole('region', { name: 'Ranking', exact: true });
  const steps = widget.getByRole('list', { name: 'Podium' }).locator(':scope > li');
  await expect(steps).toHaveCount(1);
  await expect(steps).toContainText('Ty');
  await expect(widget.getByRole('list', { name: 'Kolejne miejsca' })).toHaveCount(0);
  expect(await horizontalOverflow(page)).toBe(0);
});

test('bez zapisanych partii: pusty stan bez „Zobacz więcej”', async ({ page }) => {
  await openApp(page, { leaderboard: () => [] });
  const widget = page.getByRole('region', { name: 'Ranking', exact: true });
  await expect(widget.getByText('Ranking pojawi się po pierwszej partii')).toBeVisible();
  await expect(widget.getByRole('link')).toHaveCount(0);
});
