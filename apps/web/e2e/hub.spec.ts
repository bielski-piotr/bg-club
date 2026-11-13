import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { ADA, member, mockSupabase, session, storeSession } from './support/supabaseMock';

/**
 * Hub i stos popupów z adresami (PRD §4, NFR-4, NFR-6; DS §6, §7, §17). API Supabase jest
 * atrapą; każdy test przechodzi na 360 px i na desktopie, w motywie jasnym i ciemnym.
 */

const BEA = member(2, 'Bea', 'Bobrowska');
const CELA = member(3, 'Cela', 'Cichocka');
const DORA = member(4, 'Dora', 'Dudek');
const EWA = member(5, 'Ewa', 'Elska');
const FELA = member(6, 'Fela', 'Fik');
const GAJA = member(7, 'Gaja', 'Gil');
const ZOJA = member(9, 'Zoja', 'Zawada', true);
const MEMBERS = [BEA, CELA, DORA, EWA, FELA, GAJA, ZOJA];

const isMobile = () => test.info().project.name.startsWith('mobile');

async function openHub(page: Page, path = '/') {
  const mock = await mockSupabase(page, {
    members: MEMBERS,
    club: { name: 'Planszówki', logo_path: null },
  });
  await storeSession(page, session());
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1, name: 'Planszówki' })).toBeVisible();
  return mock;
}

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

async function axe(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  return results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`);
}

const card = (page: Page, name: string) => page.getByRole('region', { name, exact: true });
const search = (page: Page) => page.evaluate(() => decodeURIComponent(window.location.search));

test('układ huba: dwie kolumny 520 px na desktopie, jedna kolumna na telefonie', async ({
  page,
}) => {
  await openHub(page);
  const titles = ['Spotkanie', 'Ranking', 'Timeline', 'Kolekcja', 'Członkowie'];
  // Kolejność dokumentu (czytnik ekranu, Tab) zawsze według PRD §4.
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(titles);
  const boxes = await Promise.all(
    titles.map(async (title) => (await card(page, title).boundingBox()) ?? undefined),
  );
  const [meeting, ranking, timeline, collection, members] = boxes.map((box) => {
    if (!box) throw new Error('karta bez wymiarów');
    return box;
  }) as [DOMRectLike, DOMRectLike, DOMRectLike, DOMRectLike, DOMRectLike];

  if (isMobile()) {
    // 360 px: karty na całą szerokość z marginesem 16, jedna pod drugą w kolejności PRD.
    for (const box of [meeting, ranking, timeline, collection, members]) {
      expect(box.x).toBe(16);
      expect(box.width).toBe(328);
    }
    expect(ranking.y).toBeGreaterThan(meeting.y);
    expect(timeline.y).toBeGreaterThan(ranking.y);
    expect(collection.y).toBeGreaterThan(timeline.y);
    expect(members.y).toBeGreaterThan(collection.y);
  } else {
    // 1280 px: treść 1064 px, lewa kolumna Spotkanie, Timeline, Członkowie; prawa Ranking, Kolekcja.
    for (const box of [meeting, ranking, timeline, collection, members]) {
      expect(box.width).toBe(520);
    }
    expect(meeting.x).toBe(108);
    expect(ranking.x).toBe(108 + 520 + 24);
    expect([timeline.x, members.x]).toEqual([meeting.x, meeting.x]);
    expect(collection.x).toBe(ranking.x);
    expect(ranking.y).toBe(meeting.y);
    // Kolumny mają niezależne wysokości: karta wyżej + odstęp 24.
    expect(timeline.y).toBeCloseTo(meeting.y + meeting.height + 24, 0);
    expect(members.y).toBeCloseTo(timeline.y + timeline.height + 24, 0);
    expect(collection.y).toBeCloseTo(ranking.y + ranking.height + 24, 0);
  }
  expect(await horizontalOverflow(page)).toBe(0);
  expect(await axe(page)).toEqual([]);
});

interface DOMRectLike {
  x: number;
  y: number;
  width: number;
  height: number;
}

test('widżet członków: 4 awatary, licznik +N i profil po kliknięciu awatara', async ({ page }) => {
  await openHub(page);
  const widget = card(page, 'Członkowie');
  // Ada + 6 aktywnych; usunięta Zoja nie jest liczona (MEM-5).
  await expect(widget.getByText('7 osób')).toBeVisible();
  await expect(widget).toContainText('Ada, Bea, Cela, Dora i 3 inne osoby');
  await expect(widget.getByRole('link', { name: /^Otwórz profil:/ })).toHaveCount(4);

  await widget.getByRole('link', { name: 'Otwórz profil: Cela Cichocka' }).click();
  const profile = page.getByRole('dialog', { name: 'Profil' });
  await expect(profile.getByText(CELA.hook)).toBeVisible();
  expect(await search(page)).toBe(`?p=profile/${CELA.id}`);
});

test('zagnieżdżone popupy: adres, odświeżenie, Wstecz i Dalej', async ({ page }) => {
  await openHub(page);
  await card(page, 'Członkowie').getByRole('link', { name: 'Zobacz więcej' }).click();
  const list = page.getByRole('dialog', { name: 'Członkowie' });
  await expect(list.getByText('7 osób').locator('visible=true')).toBeVisible();
  await expect(list.getByRole('listitem')).toHaveCount(7);
  await expect(list).not.toContainText('Zoja');
  expect(await search(page)).toBe('?p=members');

  await list.getByRole('link', { name: /Bea Bobrowska/ }).click();
  const profile = page.getByRole('dialog', { name: 'Profil' });
  await expect(profile.getByText(BEA.hook)).toBeVisible();
  await expect(list).toBeHidden();
  expect(await search(page)).toBe(`?p=members&p=profile/${BEA.id}`);

  // Odświeżenie odtwarza cały stos.
  await page.reload();
  await expect(profile.getByText(BEA.hook)).toBeVisible();
  await expect(profile).toBeFocused();

  await page.goBack();
  await expect(profile).toHaveCount(0);
  await expect(list).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await search(page)).toBe('');

  await page.goForward();
  await expect(list).toBeVisible();
  await page.goForward();
  await expect(profile.getByText(BEA.hook)).toBeVisible();

  // ← wraca o jeden poziom, × zamyka cały stos.
  await profile.getByRole('button', { name: 'Wróć' }).click();
  await expect(list).toBeVisible();
  await list.getByRole('link', { name: /Dora Dudek/ }).click();
  await page
    .getByRole('dialog', { name: 'Profil' })
    .getByRole('button', { name: 'Zamknij' })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await search(page)).toBe('');
});

test('link do popupu działa po zalogowaniu i nie wyprowadza z aplikacji', async ({ page }) => {
  await mockSupabase(page, { members: MEMBERS });
  await page.goto('/');
  const start = page.url();
  await page.goto(`/?p=members&p=profile/${EWA.id}`);
  await page.getByLabel('Hook').fill(ADA.hook);
  await page.getByLabel('Hasło', { exact: true }).fill('tajne-haslo-123');
  await page.getByRole('button', { name: 'Zaloguj się' }).click();

  const profile = page.getByRole('dialog', { name: 'Profil' });
  await expect(profile.getByText(EWA.hook)).toBeVisible();
  // Popup z linku nie ma pod sobą wpisu historii: ← i × podmieniają adres zamiast cofać.
  await profile.getByRole('button', { name: 'Wróć' }).click();
  await expect(page.getByRole('dialog', { name: 'Członkowie' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1, name: 'BG Club' })).toBeVisible();
  await page.goBack();
  expect(page.url()).toBe(start);
});

test('klawiatura: fokus w popupie, pętla Tab, Esc i powrót fokusu', async ({ page }) => {
  await openHub(page);
  const more = card(page, 'Członkowie').getByRole('link', { name: 'Zobacz więcej' });
  await more.focus();
  await page.keyboard.press('Enter');
  const list = page.getByRole('dialog', { name: 'Członkowie' });
  await expect(list).toBeFocused();
  await expect(list.getByRole('listitem')).toHaveCount(7);

  // Kolejność: × w nagłówku, potem wiersze; Tab nigdy nie wychodzi poza popup.
  const close = list.getByRole('button', { name: 'Zamknij' });
  await close.focus();
  await page.keyboard.press('Tab');
  await expect(list.getByRole('link', { name: /Ada Adminowska/ })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(close).toBeFocused();
  for (let i = 0; i < 20; i += 1) {
    await page.keyboard.press('Tab');
    expect(
      await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]'))),
    ).toBe(true);
  }

  // Enter na wierszu otwiera profil; Esc wraca i oddaje fokus wierszowi.
  const row = list.getByRole('link', { name: /Bea Bobrowska/ });
  await row.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Profil' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(row).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(more).toBeFocused();
});

test('popup: pełny ekran na telefonie, okno 560 na desktopie, tło nie przewija się', async ({
  page,
}) => {
  await openHub(page);
  // Widżet członków jest na dole strony: przewijamy do niego, zanim otworzymy popup.
  const avatar = card(page, 'Członkowie').getByRole('link', {
    name: 'Otwórz profil: Ada Adminowska',
  });
  await avatar.scrollIntoViewIfNeeded();
  const scrolled = await page.evaluate(() => window.scrollY);
  if (isMobile()) expect(scrolled).toBeGreaterThan(0);
  await avatar.click();
  const dialog = page.getByRole('dialog', { name: 'Profil' });
  await expect(dialog.getByText(ADA.hook)).toBeVisible();
  const box = await dialog.boundingBox();
  const viewport = page.viewportSize();
  if (!box || !viewport) throw new Error('brak wymiarów');

  if (isMobile()) {
    expect(box).toEqual({ x: 0, y: 0, width: viewport.width, height: viewport.height });
    // Klawiatura ekranowa zmniejsza widoczny obszar: arkusz idzie za nim.
    await page.setViewportSize({ width: viewport.width, height: 420 });
    await expect.poll(async () => (await dialog.boundingBox())?.height).toBe(420);
  } else {
    expect(box.width).toBe(560);
    expect(box.x).toBe((viewport.width - 560) / 2);
  }
  await page.mouse.wheel(0, 400);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrolled);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).toBe(
    'hidden',
  );
  expect(await horizontalOverflow(page)).toBe(0);
  expect(await axe(page)).toEqual([]);

  await dialog.getByRole('button', { name: 'Zamknij' }).click();
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).toBe(
    'visible',
  );
});

test('nieprawidłowe i niedostępne adresy mają czytelne stany', async ({ page }) => {
  await openHub(page, '/?p=gra/1');
  const invalid = page.getByRole('dialog', { name: 'Nie znaleziono' });
  await expect(invalid).toContainText(
    'Ten adres jest nieprawidłowy albo prowadzi do widoku, którego nie ma.',
  );
  expect(await axe(page)).toEqual([]);
  await invalid.getByRole('button', { name: 'Wróć do klubu' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.goto('/?p=profile/00000000-0000-4000-a000-0000000000ff');
  const missing = page.getByRole('dialog', { name: 'Profil' });
  await expect(missing.getByText('Nie znaleziono gracza')).toBeVisible();

  await page.goto(`/?p=profile/${ZOJA.id}`);
  const removed = page.getByRole('dialog', { name: 'Profil' });
  await expect(removed.getByText('(usunięty)')).toBeVisible();
  await expect(removed).toContainText('Profil jest tylko do odczytu.');
  expect(await axe(page)).toEqual([]);

  await page.goto('/klub/nieznany');
  await expect(page.getByRole('heading', { level: 1, name: 'Nie ma takiej strony' })).toBeVisible();
  await page.getByRole('link', { name: 'Przejdź do klubu' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Planszówki' })).toBeVisible();
});
