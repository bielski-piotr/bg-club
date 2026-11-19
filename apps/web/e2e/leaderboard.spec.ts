import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  ADA,
  member,
  mockSupabase,
  session,
  storeSession,
  type MockLeaderboardRow,
  type MockOptions,
  type MockProfile,
} from './support/supabaseMock';

/**
 * Widżet i popup rankingu. Ranking liczy baza (`leaderboard`, test
 * SQL `200`); tu atrapa zwraca gotowe wiersze, a test sprawdza układ: zakładki, podium z remisami,
 * miejsca 4–7 w widżecie, pełną listę i filtr roku w popupie, wyróżnienie bieżącego użytkownika,
 * wyszarzonych usuniętych na końcu, linki do profili, długie nazwiska i brak poziomego przewijania
 * na 360 px, w obu motywach.
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
): MockLeaderboardRow => ({
  place,
  profile_id: profile.id,
  first_name: profile.first_name,
  last_name: profile.last_name,
  avatar_path: null,
  deleted,
  podium: !deleted && place <= 3,
  value,
});

/** Cała historia, punkty: Bartłomiej i Cezary remisują na 1., Ada jest 9. (poza 4–7). */
const POINTS: MockLeaderboardRow[] = [
  row(LONG, 1, 42),
  row(PEOPLE[1] as MockProfile, 1, 42),
  row(PEOPLE[2] as MockProfile, 3, 30),
  row(PEOPLE[3] as MockProfile, 4, 25),
  row(PEOPLE[4] as MockProfile, 5, 20),
  row(PEOPLE[5] as MockProfile, 6, 18),
  row(PEOPLE[6] as MockProfile, 7, 12),
  row(PEOPLE[7] as MockProfile, 8, 10),
  row(ADA, 9, 4),
  row(ZOJA, 10, 50, true),
];
/** Rok 2025: dwóch graczy. */
const POINTS_2025: MockLeaderboardRow[] = [row(ADA, 1, 16), row(LONG, 2, 8)];
const WINS: MockLeaderboardRow[] = [row(ADA, 1, 7), row(LONG, 2, 1)];

const isMobile = () => test.info().project.name.startsWith('mobile');

async function openApp(page: Page, options: MockOptions = {}, path = '/') {
  const mock = await mockSupabase(page, {
    club: CLUB,
    members: [...PEOPLE, ZOJA],
    // Klasyfikowani są ci sami gracze we wszystkich zakładkach; rok 2025 ma tylko punkty.
    leaderboard: (kind, year) =>
      year === 2025 ? (kind === 'points' ? POINTS_2025 : []) : kind === 'wins' ? WINS : POINTS,
    leaderboardYears: [2026, 2025],
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

test('widżet: podium z remisem, miejsca 4–7 i własny wiersz z całej historii', async ({ page }) => {
  const mock = await openApp(page);
  const widget = page.getByRole('region', { name: 'Ranking', exact: true });
  await expect(widget.getByRole('tab', { name: 'Punkty' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const podium = widget.getByRole('list', { name: 'Podium' });
  await expect(podium.getByRole('listitem').filter({ hasText: '1. miejsce' })).toContainText(
    '1. miejsce, 2 osoby',
  );
  await expect(podium).toContainText('Bartłomiej, Cezary');
  await expect(podium).toContainText('Dorota');

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
  // Widżet nie ma filtru roku: zawsze cała historia.
  await expect(widget.getByRole('button', { name: 'Zakres rankingu' })).toHaveCount(0);
  expect(mock.leaderboardCalls.every((call) => call.year === null)).toBe(true);

  await widget.getByRole('tab', { name: 'Wygrane' }).click();
  await expect(podium).toContainText('wygranych');
  await expect(widget.getByRole('list', { name: 'Kolejne miejsca' })).toHaveCount(0);

  expect(await horizontalOverflow(page)).toBe(0);
  expect(await axe(page)).toEqual([]);
});

test('popup: pełna lista, usunięci na końcu, filtr roku i 2 graczy', async ({ page }) => {
  const mock = await openApp(page);
  const widget = page.getByRole('region', { name: 'Ranking', exact: true });
  await widget.getByRole('tab', { name: 'Seria' }).click();
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

  await dialog.getByRole('button', { name: /Zakres rankingu/ }).click();
  await page.getByRole('option', { name: '2025' }).click();
  await expect(dialog).toContainText('2 graczy');
  await expect(dialog.getByRole('list', { name: 'Podium' }).locator(':scope > li')).toHaveCount(2);
  await expect(dialog.getByRole('list', { name: 'Kolejne miejsca' })).toHaveCount(0);
  expect(mock.leaderboardCalls).toContainEqual({ kind: 'points', year: 2025 });

  await dialog.getByRole('tab', { name: 'Seria' }).click();
  await expect(dialog).toContainText('Brak partii w 2025');

  expect(await horizontalOverflow(page)).toBe(0);
  expect(await axe(page)).toEqual([]);
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
