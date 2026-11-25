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
 * Kolekcja gier (PRD GAME-1…GAME-6, GAME-8; DS §6, §7, §14): widżet w kolejności Q11, popup
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
  // Okładka z Storage albo monogram tytułu (GAME-6).
  await expect(widget.locator('.game-cover--thumb img')).toHaveCount(1);
  await expect(widget.locator('.collection-widget__featured .game-cover')).toHaveText('ŻW');
  expect(await horizontalOverflow(page)).toBe(0);
  expect(await axe(page)).toEqual([]);

  await widget.getByRole('link', { name: 'Zobacz więcej' }).click();
  await expect(page.getByRole('dialog', { name: 'Kolekcja' })).toBeVisible();
  expect(await search(page)).toBe('?p=games');
});

test('widżet pokazuje 5 gier, a licznik wszystkie (GAME-1)', async ({ page }) => {
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

test('popup: wyszukiwanie na bieżąco bez polskich znaków (GAME-2)', async ({ page }) => {
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

test('admin dodaje grę z okładką i punktacją (GAME-3…GAME-6)', async ({ page }) => {
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

  // Okładka 2400×1200 w edytorze okładki (kafelek z ołówkiem): oryginał zmniejszony do 1600 px,
  // potem kadr w kształcie okładki z widoku gry i kwadrat do 800 px WebP (GAME-6).
  await form.getByRole('button', { name: 'Dodaj okładkę' }).click();
  const crop = page.getByRole('dialog', { name: 'Okładka gry' });
  await expect(crop.getByText('Brak okładki')).toBeVisible();
  await expect(crop.getByRole('button', { name: 'Usuń okładkę' })).toHaveCount(0);
  await crop.locator('input[type="file"]').setInputFiles({
    name: 'okladka.png',
    mimeType: 'image/png',
    buffer: png(2400, 1200),
  });
  await expect(crop.locator('.cropper__mask--cover')).toBeVisible();
  await expect(crop.getByRole('button', { name: 'Usuń okładkę' })).toBeVisible();
  // Podgląd jest większy niż kadr: obraz widać także poza maską, a oddalić można poniżej 100%.
  const zoom = crop.getByRole('slider', { name: 'Powiększenie' });
  await expect(zoom).toHaveAttribute('min', '50');
  const stage = crop.getByRole('group', { name: /Kadr zdjęcia/ });
  await stage.focus();
  await page.keyboard.press('ArrowRight');
  expect(await axe(page)).toEqual([]);
  await crop.getByRole('button', { name: 'Gotowe' }).click();
  await expect(form.getByRole('button', { name: 'Edytuj okładkę' })).toBeVisible();
  await expect(form.getByText('Nowa okładka zapisze się razem z grą.')).toBeVisible();

  await form.getByLabel('Tytuł').fill('Kolejka Górska');
  // Max 4 → 5: dochodzi pole 5. miejsca (GAME-5); bez górnego limitu (GAME-4).
  const max = form.getByRole('spinbutton', { name: 'Max. graczy' });
  await max.focus();
  await page.keyboard.press('ArrowUp');
  await expect(form.getByLabel(/\. miejsce$/)).toHaveCount(5);
  // Skomplikowanie przelicza punkty ze wzoru (GAME-5): M(3) = 2, n = 5.
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
  expect(mock.uploads).toHaveLength(2);
  expect(mock.uploads[0]).toMatch(/^games\/[0-9a-f-]{36}-[0-9a-f-]{36}\.webp$/);
  expect(mock.uploads[1]).toMatch(/^games\/[0-9a-f-]{36}-source-[0-9a-f-]{36}\.webp$/);
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
      cover_source_path: mock.uploads[1],
      cover_crop: { zoom: 1, x: expect.any(Number) as unknown as number, y: 0 },
      base_game_id: null,
    },
  });
  await expect(form).toBeHidden();
  await expect(widget.locator('.collection-widget__title')).toHaveText('Kolejka Górska');
  await expect(widget.getByText('1 gra')).toBeVisible();
});

test('admin edytuje i usuwa grę z popupu (GAME-3, GAME-8)', async ({ page }) => {
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

test('edytor okładki: zapisana okładka wczytuje się do kadru, a usunięcie czeka na zapis (GAME-6)', async ({
  page,
}) => {
  const mock = await openApp(page, { games: [KOLEJKA] }, `/?p=game/${KOLEJKA.id}/edit`);
  const form = page.getByRole('dialog', { name: 'Edytuj grę' });
  await form.getByRole('button', { name: 'Edytuj okładkę' }).click();
  const editor = page.getByRole('dialog', { name: 'Okładka gry' });
  // Okładka sprzed kadrowania (bez oryginału) wczytuje się sama do kadru.
  await expect(editor.locator('.cropper__mask--cover')).toBeVisible();
  expect(await horizontalOverflow(page)).toBe(0);
  expect(await axe(page)).toEqual([]);

  // Bez zmian „Gotowe” niczego nie zmienia.
  await editor.getByRole('button', { name: 'Gotowe' }).click();
  await expect(form.getByText('Bez okładki pokazujemy monogram tytułu.')).toBeVisible();

  await form.getByRole('button', { name: 'Edytuj okładkę' }).click();
  await editor.getByRole('button', { name: 'Usuń okładkę' }).click();
  await expect(editor.getByText('Brak okładki')).toBeVisible();
  await editor.getByRole('button', { name: 'Gotowe' }).click();
  await expect(form.getByText('Okładka zostanie usunięta po zapisaniu gry.')).toBeVisible();
  await expect(form.getByRole('button', { name: 'Dodaj okładkę' })).toBeVisible();
  await form.getByRole('button', { name: 'Zapisz' }).click();
  await expect(page.getByText('Zapisano zmiany w grze Kolejka')).toBeVisible();
  expect(mock.gameWrites.at(-1)).toMatchObject({
    method: 'PATCH',
    id: KOLEJKA.id,
    body: { cover_path: null, cover_source_path: null, cover_crop: null },
  });
});

test('dodatki: tylko w widoku gry, z menu kolekcji i z widoku gry (bez kolekcji)', async ({
  page,
}) => {
  const EXPANSION = mockGame(5, 'Żółwie: Turbo', {
    base_game_id: ZOLWIE.id,
    max_players: 6,
    placement_points: [12, 9, 7, 5, 3, 1],
    complexity: 2.5,
    play_count: 3,
  });
  const mock = await openApp(page, { games: [ZOLWIE, LAKA, EXPANSION] }, '/?p=games');
  const collection = page.getByRole('dialog', { name: 'Kolekcja' });
  // Dodatku nie ma w kolekcji.
  await expect(collection.locator('.game-tile__title')).toHaveText([
    'Łąka i Pszczoły',
    'Żółwie Wyścigi',
  ]);

  // Menu gry w kolekcji: „Dodaj dodatek”.
  await collection.getByRole('button', { name: 'Akcje gry Żółwie Wyścigi' }).click();
  await page.getByRole('menuitem', { name: 'Dodaj dodatek' }).click();
  const form = page.getByRole('dialog', { name: 'Dodaj dodatek' });
  await expect(form.getByText('Dodatek do gry Żółwie Wyścigi.', { exact: false })).toBeVisible();
  expect(await search(page)).toBe(`?p=games&p=game/${ZOLWIE.id}/expansions/new`);
  expect(await axe(page)).toEqual([]);
  await form.getByLabel('Tytuł').fill('Żółwie: Pułapki');
  await form.getByLabel('Skomplikowanie').fill('3');
  await form.getByRole('button', { name: 'Zapisz' }).click();
  await expect(page.getByText('Dodano dodatek Żółwie: Pułapki')).toBeVisible();
  expect(mock.gameWrites.at(-1)).toMatchObject({
    method: 'POST',
    body: { title: 'Żółwie: Pułapki', complexity: 3, base_game_id: ZOLWIE.id },
  });
  await expect(collection.locator('.game-tile__title')).toHaveText([
    'Łąka i Pszczoły',
    'Żółwie Wyścigi',
  ]);

  // Widok gry: sekcja „Dodatki” z liczbą partii dodatku i akcje w nagłówku.
  await collection.getByRole('button', { name: 'Szczegóły gry Żółwie Wyścigi' }).click();
  const details = page.getByRole('dialog', { name: 'Żółwie Wyścigi' });
  const list = details.getByRole('list', { name: 'Dodatki gry Żółwie Wyścigi' });
  await expect(list.locator('.row__title')).toHaveText(['Żółwie: Pułapki', 'Żółwie: Turbo']);
  await expect(list.getByText('2–6 graczy · 3 partie')).toBeVisible();
  await expect(details.getByRole('button', { name: 'Dodaj dodatek' })).toBeVisible();
  expect(await horizontalOverflow(page)).toBe(0);
  expect(await axe(page)).toEqual([]);

  // Widok dodatku: gra podstawowa i liczba partii, bez statystyk i galerii.
  await list.getByRole('button', { name: /Żółwie: Turbo/ }).click();
  const expansion = page.getByRole('dialog', { name: 'Żółwie: Turbo' });
  await expect(
    expansion.getByRole('link', { name: 'Dodatek do gry Żółwie Wyścigi' }),
  ).toBeVisible();
  await expect(expansion.getByText('Rozegrane partie: 3')).toBeVisible();
  await expect(expansion.getByText('Statystyki')).toHaveCount(0);
  await expansion.getByRole('button', { name: 'Akcje gry Żółwie: Turbo' }).click();
  await expect(page.getByRole('menuitem', { name: 'Notesy' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Dodaj dodatek' })).toHaveCount(0);
  await page.getByRole('menuitem', { name: 'Usuń' }).click();
  await expect(page.getByRole('dialog', { name: 'Usunąć dodatek?' })).toBeVisible();
});
