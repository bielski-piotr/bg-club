import { expect, test, type Page } from '@playwright/test';
import { axeViolations, expectNoHorizontalOverflow } from './support/a11y';
import { ADA, member, mockSupabase, session, storeSession } from './support/supabaseMock';

/**
 * Audyt dostępności całej aplikacji (#42). Przegląd głównych popupów
 * z długimi nazwami i ponad 8 członkami (brak globalnego limitu): axe WCAG 2.1 A/AA na całej
 * stronie i brak poziomego przewijania przy 360 px (projekty mobilne), 375 px i na desktopie,
 * w obu motywach.
 */

const LONG_FIRST = 'Bartłomiejaleksandranatalia';
const LONG_LAST = 'Konstantynopolitańczykiewiczówna-Wielkopolska';
const LONG_MEMBER = member(2, LONG_FIRST, LONG_LAST);
const DELETED = member(20, 'Zoja', 'Zawada', true);
const MEMBERS = [
  LONG_MEMBER,
  ...Array.from({ length: 11 }, (_, i) => member(3 + i, `Gracz${i + 1}`, `Testowy${i + 1}`)),
  DELETED,
];
const LONG_CLUB = 'Klub Miłośników Gier Planszowych i Karcianych „Pod Wesołym Meeplem” z Poznania';

const isMobile = () => test.info().project.name.startsWith('mobile');

async function open(page: Page, popup = '') {
  await mockSupabase(page, { members: MEMBERS, club: { name: LONG_CLUB, logo_path: null } });
  await storeSession(page, session());
  await page.goto(popup ? `/?p=${popup}` : '/');
  await expect(page.getByRole('heading', { level: 1, name: LONG_CLUB })).toBeVisible();
}

async function audit(page: Page) {
  await expectNoHorizontalOverflow(page);
  return axeViolations(page);
}

const POPUPS = [
  'members',
  `profile/${LONG_MEMBER.id}`,
  `profile/${ADA.id}`,
  'games',
  'calendar',
  'leaderboard',
  'club',
  'settings',
] as const;

for (const width of [null, 375] as const) {
  test(`hub i popupy z długimi nazwami: axe i szerokość${width ? ` (${width} px)` : ''}`, async ({
    page,
  }) => {
    test.skip(width !== null && !isMobile(), 'Szerokość 375 px dotyczy telefonu.');
    test.setTimeout(60_000);
    if (width) await page.setViewportSize({ width, height: 812 });
    await open(page);
    expect(await audit(page)).toEqual([]);
    for (const popup of POPUPS) {
      await page.goto(`/?p=${popup}`);
      const dialog = page.getByRole('dialog').last();
      await expect(dialog).toBeVisible();
      // Audyt dotyczy treści, nie szkieletu ładowania.
      await expect(page.locator('.skeleton, [aria-busy="true"]')).toHaveCount(0);
      expect(await audit(page), popup).toEqual([]);
    }
  });
}

test('lista członków pokazuje wszystkich (ponad 8), a długie nazwy nie rozpychają układu', async ({
  page,
}) => {
  await open(page, 'members');
  const list = page.getByRole('dialog', { name: 'Członkowie' });
  await expect(page.locator('.skeleton')).toHaveCount(0);
  // 12 aktywnych członków i Ada; brak globalnego limitu.
  await expect(list.getByRole('link', { name: /Gracz\d+ Testowy\d+/ })).toHaveCount(11);
  await expect(list.getByRole('link', { name: /Ada Adminowska/ })).toBeVisible();
  const row = list.getByRole('link', { name: new RegExp(`${LONG_FIRST} ${LONG_LAST}`) });
  await expect(row).toBeVisible();
  // Wiersz listy ucina długą nazwę wielokropkiem, ale pełna nazwa zostaje
  // w nazwie dostępnej linku dla czytnika ekranu.
  await expect(row).toHaveAccessibleName(new RegExp(`${LONG_FIRST} ${LONG_LAST}`));
  const box = await row.boundingBox();
  const dialogBox = await list.boundingBox();
  expect(box && dialogBox && box.x + box.width <= dialogBox.x + dialogBox.width + 0.5).toBe(true);
});
