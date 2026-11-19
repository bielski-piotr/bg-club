import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { png } from './support/png';
import { ADA, mockSupabase, session, storeSession, type MockOptions } from './support/supabaseMock';

/**
 * Pierwsze uruchomienie i zakładanie klubu. API Supabase
 * i Storage są atrapą; każdy test przechodzi na 360 px i na desktopie, w obu motywach.
 */

const isMobile = () => test.info().project.name.startsWith('mobile');
const WIDGETS = ['Spotkanie', 'Ranking', 'Timeline', 'Kolekcja', 'Członkowie'];

async function openApp(page: Page, options: MockOptions, path = '/') {
  const mock = await mockSupabase(page, options);
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

test.describe('pierwsze uruchomienie', () => {
  // Strefa przeglądarki administratora jest domyślną strefą klubu.
  test.use({ timezoneId: 'Asia/Tokyo' });

  test('admin zakłada klub z logo i strefą; hub pokazuje pięć pustych widżetów', async ({
    page,
  }) => {
    const mock = await openApp(page, { club: null });

    // Ilustracja, powitanie i jedyny przycisk zamiast widżetów; nagłówek bez klubu.
    await expect(page.getByRole('heading', { level: 1, name: 'Załóż swój klub' })).toBeVisible();
    const art = page.locator('.first-run__art');
    await expect(art).toBeVisible();
    expect((await art.boundingBox())?.width).toBe(isMobile() ? 280 : 400);
    await expect(page.getByRole('heading', { level: 2 })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Twoje konto: Ada Adminowska' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edytuj klub' })).toHaveCount(0);
    expect(await horizontalOverflow(page)).toBe(0);
    expect(await axe(page)).toEqual([]);

    const add = page.getByRole('button', { name: 'Dodaj klub' });
    const addBox = await add.boundingBox();
    // Telefon: przycisk na całą szerokość (16 px marginesu), desktop: pigułka pod tekstem.
    if (isMobile()) expect(addBox?.width).toBe(328);
    await add.click();
    const dialog = page.getByRole('dialog', { name: 'Dodaj klub' });
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(/\?p=club$/);

    const zone = dialog.getByRole('button', { name: /Strefa czasowa/ });
    await expect(zone).toContainText('Asia/Tokyo');
    await expect(zone).toContainText('UTC+09:00');
    await expect(dialog).toContainText('Domyślnie strefa Twojej przeglądarki.');

    // Logo 1600×800 zmniejszone w przeglądarce do 800×400 (dłuższy bok 800 px).
    await dialog.locator('input[type="file"]').setInputFiles({
      name: 'logo.png',
      mimeType: 'image/png',
      buffer: png(1600, 800),
    });
    const preview = dialog.locator('.club-logo__img');
    await expect(preview).toBeVisible();
    expect(
      await preview.evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight]),
    ).toEqual([800, 400]);
    await expect(dialog.getByRole('button', { name: 'Zmień logo' })).toBeVisible();

    // Bez nazwy nic nie jest wysyłane.
    await dialog.getByRole('button', { name: 'Zapisz' }).click();
    await expect(dialog.getByText('Wpisz nazwę klubu.')).toBeVisible();
    expect(mock.clubWrites).toEqual([]);

    await dialog.getByLabel('Nazwa klubu').fill('Planszówki na Woli');

    // Wyszukiwanie strefy: panel mieści się w oknie i nie jest przycięty przez popup.
    await zone.click();
    const search = page.getByRole('combobox', { name: 'Szukaj strefy' });
    await expect(search).toBeFocused();
    await search.fill('warsz');
    await expect(page.getByRole('option')).toHaveCount(0);
    await search.fill('warsaw');
    await expect(page.getByRole('option')).toHaveText([/^Europe\/WarsawUTC\+0[12]:00/]);
    const panel = page.locator('.select__menu--search');
    const box = await panel.boundingBox();
    const viewport = page.viewportSize();
    expect(box && viewport).toBeTruthy();
    if (box && viewport) {
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    }
    expect(await axe(page)).toEqual([]);
    await page.getByRole('option', { name: /Europe\/Warsaw/ }).click();
    await expect(zone).toContainText('Europe/Warsaw');
    await expect(zone).toBeFocused();

    await dialog.getByRole('button', { name: 'Zapisz' }).click();

    // Nazwa i logo w nagłówku oraz pięć widżetów z pustymi stanami.
    await expect(page.getByRole('heading', { level: 1, name: 'Planszówki na Woli' })).toBeVisible();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { level: 2 })).toHaveText(WIDGETS);
    await expect(page.getByText('Klub założony')).toBeVisible();
    await expect(page.locator('.app-header .club-logo__img')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edytuj klub' })).toBeVisible();

    expect(mock.uploads).toHaveLength(1);
    expect(mock.uploads[0]).toMatch(/^club\/logo-[0-9a-f-]{36}\.webp$/);
    expect(mock.clubWrites).toEqual([
      {
        method: 'POST',
        body: { name: 'Planszówki na Woli', timezone: 'Europe/Warsaw', logo_path: mock.uploads[0] },
      },
    ]);
    expect(await horizontalOverflow(page)).toBe(0);
    expect(await axe(page)).toEqual([]);
  });

  test('gracz widzi ilustrację bez przycisku', async ({ page }) => {
    await openApp(page, { club: null, profile: { ...ADA, role: 'player' } });
    await expect(
      page.getByRole('heading', { level: 1, name: 'Klub nie został jeszcze założony' }),
    ).toBeVisible();
    await expect(page.locator('.first-run__art')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Dodaj klub' })).toHaveCount(0);
    expect(await axe(page)).toEqual([]);
  });

  test('równoległa próba nie tworzy drugiego klubu', async ({ page }) => {
    const mock = await openApp(page, {
      club: null,
      clubConflict: { name: 'Klub z drugiej karty', logo_path: null, timezone: 'Europe/Warsaw' },
    });
    await page.getByRole('button', { name: 'Dodaj klub' }).click();
    const dialog = page.getByRole('dialog', { name: 'Dodaj klub' });
    await dialog.getByLabel('Nazwa klubu').fill('Drugi klub');
    await dialog.getByRole('button', { name: 'Zapisz' }).click();

    await expect(page.getByText('Klub został już założony, więc drugi nie powstał.')).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Klub z drugiej karty' }),
    ).toBeVisible();
    await expect(dialog).toBeHidden();
    expect(mock.clubWrites.map((w) => w.method)).toEqual(['POST']);
  });
});

test('admin edytuje klub z nagłówka, a zmiana strefy zapisuje tylko strefę', async ({ page }) => {
  const mock = await openApp(page, {
    club: { name: 'Planszówki', logo_path: 'club/logo-stare.webp', timezone: 'Europe/Warsaw' },
  });
  await expect(page.getByRole('heading', { level: 1, name: 'Planszówki' })).toBeVisible();
  await expect(page.locator('.app-header .club-logo__img')).toBeVisible();

  await page.getByRole('button', { name: 'Edytuj klub' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edytuj klub' });
  await expect(dialog.getByLabel('Nazwa klubu')).toHaveValue('Planszówki');
  await expect(dialog.locator('.club-logo__img')).toBeVisible();

  const footer = dialog.locator('.modal__footer');
  const [cancel, save] = await Promise.all([
    footer.getByRole('button', { name: 'Anuluj' }).boundingBox(),
    footer.getByRole('button', { name: 'Zapisz' }).boundingBox(),
  ]);
  if (isMobile()) {
    // Telefon: dwa przyciski po równo na dole arkusza.
    expect(cancel?.width).toBe(save?.width);
    expect((save?.y ?? 0) + (save?.height ?? 0)).toBeGreaterThan(700);
  } else {
    // Desktop: przyciski do prawej, Zapisz ostatni.
    expect((save?.x ?? 0) > (cancel?.x ?? 0)).toBe(true);
  }
  expect(await axe(page)).toEqual([]);

  await dialog.getByRole('button', { name: /Strefa czasowa/ }).click();
  await page.getByRole('combobox', { name: 'Szukaj strefy' }).fill('new york');
  await page.keyboard.press('Enter');
  await dialog.getByRole('button', { name: 'Usuń logo' }).click();
  await dialog.getByRole('button', { name: 'Zapisz' }).click();

  await expect(page.getByText('Zapisano zmiany w klubie')).toBeVisible();
  await expect(dialog).toBeHidden();
  expect(mock.clubWrites).toEqual([
    {
      method: 'PATCH',
      body: { name: 'Planszówki', timezone: 'America/New_York', logo_path: null },
    },
  ]);
  expect(mock.removed).toEqual(['club/logo-stare.webp']);
  await expect(page.locator('.app-header .club-logo')).toHaveText('P');
});

test('gracz nie edytuje klubu, także z linku', async ({ page }) => {
  await openApp(
    page,
    { club: { name: 'Planszówki', logo_path: null }, profile: { ...ADA, role: 'player' } },
    '/?p=club',
  );
  await expect(page.getByRole('dialog', { name: 'Nie znaleziono' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { level: 1, name: 'Planszówki' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edytuj klub' })).toHaveCount(0);
});
