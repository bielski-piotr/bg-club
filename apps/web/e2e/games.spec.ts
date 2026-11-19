import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { png } from './support/png';
import {
  ADA,
  mockGame,
  mockSupabase,
  session,
  storeSession,
  type MockOptions,
} from './support/supabaseMock';

/**
 * Kolekcja gier: widżet w kolejności, popup
 * z wyszukiwaniem bez polskich znaków, formularz admina z okładką i punktacją, miękkie
 * usunięcie. API Supabase i Storage są atrapą; każdy test przechodzi na 360 px i na
 * desktopie, w motywie jasnym i ciemnym.
 */

const CLUB = { name: 'Planszówki', logo_path: null };
const ZOLWIE = mockGame(1, 'Żółwie Wyścigi', { last_played_at: '2026-11-06T19:00:00Z' });
const LAKA = mockGame(2, 'Łąka i Pszczoły', {
  min_players: 1,
  max_players: 1,
  placement_points: [5],
});
const KOLEJKA = mockGame(3, 'Kolejka', { cover_path: 'games/kolejka.webp' });
const ARCHIWUM = mockGame(4, 'Archiwum', { deleted_at: '2026-11-01T10:00:00Z' });

async function openApp(page: Page, options: MockOptions, path = '/') {
  const mock = await mockSupabase(page, { club: CLUB, ...options });
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

/** Czeka, aż skończą się animacje wejścia (np. dialogu), żeby axe widział kolory końcowe. */
async function settled(page: Page) {
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => animation.playState !== 'running'),
  );
}

const search = (page: Page) => page.evaluate(() => decodeURIComponent(window.location.search));

test('widżet: ostatnio grane, potem dodane; usunięte gry nie są widoczne', async ({ page }) => {
  await openApp(page, { games: [ZOLWIE, LAKA, KOLEJKA, ARCHIWUM] });
  const widget = page.getByRole('region', { name: 'Kolekcja', exact: true });
  await expect(widget.getByText('3 gry')).toBeVisible();
  // Żółwie były grane, więc są pierwsze mimo najstarszej daty dodania; potem najnowsze.
  await expect(widget.locator('.collection-widget__title')).toHaveText('Żółwie Wyścigi');
  await expect(widget.locator('.row__title')).toHaveText(['Kolejka', 'Łąka i Pszczoły']);
  await expect(widget).not.toContainText('Archiwum');
  // Okładka z Storage albo monogram tytułu.
  await expect(widget.locator('.game-cover--thumb img')).toHaveCount(1);
  await expect(widget.locator('.collection-widget__featured .game-cover')).toHaveText('ŻW');
  expect(await horizontalOverflow(page)).toBe(0);
  expect(await axe(page)).toEqual([]);

  await widget.getByRole('link', { name: 'Zobacz więcej' }).click();
  await expect(page.getByRole('dialog', { name: 'Kolekcja' })).toBeVisible();
  expect(await search(page)).toBe('?p=games');
});

test('widżet pokazuje 5 gier, a licznik wszystkie', async ({ page }) => {
  const many = ['Azul', 'Dixit', 'Splendor', 'Wsiąść do Pociągu', 'Carcassonne', 'Patchwork'];
  await openApp(page, { games: many.map((title, i) => mockGame(10 + i, title)) });
  const widget = page.getByRole('region', { name: 'Kolekcja', exact: true });
  await expect(widget.getByText('6 gier')).toBeVisible();
  await expect(widget.locator('.collection-widget__title')).toHaveText('Patchwork');
  await expect(widget.locator('.row__title')).toHaveText([
    'Carcassonne',
    'Wsiąść do Pociągu',
    'Splendor',
    'Dixit',
  ]);
  expect(await horizontalOverflow(page)).toBe(0);
});

test('popup: wyszukiwanie na bieżąco bez polskich znaków', async ({ page }) => {
  const mock = await openApp(page, { games: [ZOLWIE, LAKA, KOLEJKA] }, '/?p=games');
  const dialog = page.getByRole('dialog', { name: 'Kolekcja' });
  const titles = dialog.locator('.game-tile__title');
  await expect(titles).toHaveText(['Kolejka', 'Łąka i Pszczoły', 'Żółwie Wyścigi']);
  expect(await horizontalOverflow(page)).toBe(0);
  expect(await axe(page)).toEqual([]);

  await dialog.getByRole('searchbox', { name: 'Szukaj gry' }).fill('LAKA');
  await expect(titles).toHaveText(['Łąka i Pszczoły']);
  expect(mock.gameSearches).toContain('LAKA');
  await dialog.getByRole('searchbox', { name: 'Szukaj gry' }).fill('szachy');
  await expect(dialog.getByText('Żadna gra nie pasuje do „szachy”')).toBeVisible();
  await dialog.getByRole('button', { name: 'Wyczyść wyszukiwanie' }).click();
  await expect(titles).toHaveCount(3);
});

test('gracz przegląda kolekcję bez akcji admina', async ({ page }) => {
  // Zalogowana osoba bez roli administratora (RLS: zapis gier tylko dla admina).
  await openApp(page, { profile: { ...ADA, role: 'player' }, games: [ZOLWIE] }, '/?p=games');
  const dialog = page.getByRole('dialog', { name: 'Kolekcja' });
  await expect(dialog.getByText('Żółwie Wyścigi')).toBeVisible();
  await expect(dialog.getByRole('button', { name: /Dodaj/ })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: /Akcje gry/ })).toHaveCount(0);
});

test('admin dodaje grę z okładką i punktacją', async ({ page }) => {
  const mock = await openApp(page, { games: [] });
  const widget = page.getByRole('region', { name: 'Kolekcja', exact: true });
  await expect(widget.getByText('Kolekcja jest pusta')).toBeVisible();
  await widget.getByRole('button', { name: 'Dodaj grę' }).click();

  const form = page.getByRole('dialog', { name: 'Dodaj grę' });
  await expect(form).toBeVisible();
  expect(await search(page)).toBe('?p=games/new');
  expect(await horizontalOverflow(page)).toBe(0);
  expect(await axe(page)).toEqual([]);

  // Puste pola: komunikaty po polsku i brak zapisu.
  await form.getByRole('button', { name: 'Zapisz' }).click();
  await expect(form.getByText('Wpisz tytuł gry.')).toBeVisible();
  await expect(form.getByText('Wpisz punkty.')).toHaveCount(4);
  expect(mock.gameWrites).toEqual([]);

  // Okładka 2400×1200 zmniejszona w przeglądarce do 800×400 WebP.
  await form.locator('input[type="file"]').setInputFiles({
    name: 'okladka.png',
    mimeType: 'image/png',
    buffer: png(2400, 1200),
  });
  await expect(form.getByRole('button', { name: 'Zmień okładkę' })).toBeVisible();

  await form.getByLabel('Tytuł').fill('Kolejka Górska');
  // Max 4 → 5: dochodzi pole 5. miejsca; bez górnego limitu.
  const max = form.getByRole('spinbutton', { name: 'Max. graczy' });
  await max.focus();
  await page.keyboard.press('ArrowUp');
  await expect(form.getByLabel(/\. miejsce$/)).toHaveCount(5);
  // Skomplikowanie przelicza punkty ze wzoru: M(3) = 2, n = 5.
  await form.getByLabel('Skomplikowanie').fill('3');
  await expect(form.getByLabel('1. miejsce')).toHaveValue('43,6');
  await expect(form.getByLabel('5. miejsce')).toHaveValue('4,4');
  // Punkty można poprawić ręcznie, także ułamkami.
  for (const [i, value] of ['10', '6', '4', '2,5', '3'].entries()) {
    await form.getByLabel(`${i + 1}. miejsce`).fill(value);
  }
  // 5. miejsce ma więcej niż 4.: ostrzeżenie bez blokady.
  await expect(form.getByText(/Niższe miejsce ma więcej punktów/)).toBeVisible();
  expect(await axe(page)).toEqual([]);
  await form.getByRole('button', { name: 'Zapisz' }).click();

  await expect(page.getByText('Dodano grę Kolejka Górska')).toBeVisible();
  expect(mock.uploads).toHaveLength(1);
  expect(mock.uploads[0]).toMatch(/^games\/[0-9a-f-]{36}-[0-9a-f-]{36}\.webp$/);
  expect(mock.gameWrites).toHaveLength(1);
  expect(mock.gameWrites[0]).toMatchObject({
    method: 'POST',
    body: {
      title: 'Kolejka Górska',
      min_players: 2,
      max_players: 5,
      complexity: 3,
      placement_points: [10, 6, 4, 2.5, 3],
      cover_path: mock.uploads[0],
    },
  });
  await expect(form).toBeHidden();
  await expect(widget.locator('.collection-widget__title')).toHaveText('Kolejka Górska');
  await expect(widget.getByText('1 gra')).toBeVisible();
});

test('admin edytuje i usuwa grę z popupu', async ({ page }) => {
  const mock = await openApp(page, { games: [ZOLWIE, LAKA] }, '/?p=games');
  const dialog = page.getByRole('dialog', { name: 'Kolekcja' });

  await dialog.getByRole('button', { name: 'Akcje gry Łąka i Pszczoły' }).click();
  await page.getByRole('menuitem', { name: 'Edytuj' }).click();
  const form = page.getByRole('dialog', { name: 'Edytuj grę' });
  await expect(form.getByLabel('Tytuł')).toHaveValue('Łąka i Pszczoły');
  expect(await search(page)).toBe(`?p=games&p=game/${LAKA.id}/edit`);
  await expect(form.getByText(/nie zmienia rozegranych partii/)).toBeVisible();
  expect(await horizontalOverflow(page)).toBe(0);
  expect(await axe(page)).toEqual([]);

  // Min 1 → 2 przy max 1: błąd zakresu; max 2 dodaje pole i usuwa błąd.
  await form.getByRole('spinbutton', { name: 'Min. graczy' }).focus();
  await page.keyboard.press('ArrowUp');
  await expect(form.getByText('Max. liczba graczy nie może być mniejsza niż min.')).toBeVisible();
  await form.getByRole('spinbutton', { name: 'Max. graczy' }).focus();
  await page.keyboard.press('ArrowUp');
  // Ze skomplikowaniem zmiana max przelicza punkty ze wzoru; poprawiamy je ręcznie.
  await expect(form.getByLabel('2. miejsce')).toHaveValue('3');
  await form.getByLabel('1. miejsce').fill('5');
  await form.getByLabel('2. miejsce').fill('0');
  await form.getByLabel('Tytuł').fill('Łąka i Pszczoły 2');
  await form.getByRole('button', { name: 'Zapisz' }).click();
  await expect(page.getByText('Zapisano zmiany w grze Łąka i Pszczoły 2')).toBeVisible();
  expect(mock.gameWrites.at(-1)).toMatchObject({
    method: 'PATCH',
    id: LAKA.id,
    body: {
      title: 'Łąka i Pszczoły 2',
      min_players: 2,
      max_players: 2,
      complexity: 2,
      placement_points: [5, 0],
    },
  });
  await expect(dialog.locator('.game-tile__title')).toHaveText([
    'Łąka i Pszczoły 2',
    'Żółwie Wyścigi',
  ]);

  await dialog.getByRole('button', { name: 'Akcje gry Żółwie Wyścigi' }).click();
  await page.getByRole('menuitem', { name: 'Usuń' }).click();
  const confirm = page.getByRole('dialog', { name: 'Usunąć grę?' });
  await expect(confirm).toContainText('Rozegrane partie, karteczki i punkty zostaną w historii.');
  await expect(confirm.getByRole('button', { name: 'Usuń' })).toBeEnabled();
  await settled(page);
  expect(await axe(page)).toEqual([]);
  await confirm.getByRole('button', { name: 'Usuń' }).click();
  await expect(page.getByText('Usunięto grę Żółwie Wyścigi')).toBeVisible();
  expect(mock.gameWrites.at(-1)).toMatchObject({ method: 'PATCH', id: ZOLWIE.id });
  expect(mock.gameWrites.at(-1)?.body).toHaveProperty('deleted_at');
  await expect(dialog.locator('.game-tile__title')).toHaveText(['Łąka i Pszczoły 2']);
  // Usunięcie miękkie: okładka zostaje w Storage dla historii.
  expect(mock.removed).toEqual([]);
});
