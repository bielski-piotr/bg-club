import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { ADA, member, mockSupabase, session, storeSession } from './support/supabaseMock';

/**
 * Audyt dostępności całej aplikacji (#42; NFR-4–NFR-6; DS §0–18). Przegląd głównych popupów
 * z długimi nazwami i ponad 8 członkami (brak globalnego limitu): axe WCAG 2.1 A/AA na całej
 * stronie i brak poziomego przewijania przy 360 px (projekty mobilne), 375 px i na desktopie,
 * w obu motywach.
 */

const LONG_FIRST = 'Bartłomiejaleksandranatalia';
const LONG_LAST = 'Konstantynopolitańczykiewiczówna-Wielkopolska';
const MEMBERS = [
  member(2, LONG_FIRST, LONG_LAST),
  ...Array.from({ length: 11 }, (_, i) => member(3 + i, `Gracz${i + 1}`, `Testowy${i + 1}`)),
  member(20, 'Zoja', 'Zawada', true),
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
  // Bez trwających przejść (DS §16): axe liczy kontrast z bieżących, a nie docelowych kolorów.
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => animation.playState !== 'running'),
  );
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'poziome przewijanie strony').toBe(0);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  return results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`);
}

const POPUPS = [
  'members',
  `profile/${MEMBERS[0]?.id ?? ''}`,
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
      await expect(dialog).toBeFocused();
      await expect(dialog.locator('[aria-busy="true"]')).toHaveCount(0);
      expect(await audit(page), popup).toEqual([]);
    }
  });
}

test('lista członków pokazuje wszystkich (ponad 8) i długie nazwy się zawijają', async ({
  page,
}) => {
  await open(page, 'members');
  const list = page.getByRole('dialog', { name: 'Członkowie' });
  // 12 aktywnych + Ada; usunięta Zoja nie jest liczona jako aktywny członek.
  await expect(list.getByRole('listitem').filter({ hasText: /Gracz\d+/ })).toHaveCount(11);
  const row = list.getByRole('link', { name: new RegExp(LONG_FIRST) });
  await expect(row).toBeVisible();
  const box = await row.boundingBox();
  const dialogBox = await list.boundingBox();
  expect(box && dialogBox && box.x + box.width <= dialogBox.x + dialogBox.width + 0.5).toBe(true);
});
