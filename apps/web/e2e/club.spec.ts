import { deflateSync } from 'node:zlib';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { ADA, mockSupabase, session, storeSession, type MockOptions } from './support/supabaseMock';

/**
 * Pierwsze uruchomienie i zakładanie klubu (PRD CLUB-1…CLUB-4, NFR-10; DS §17). API Supabase
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

/** Jednokolorowy PNG `width`×`height` (bez zewnętrznych plików w repozytorium). */
function png(width: number, height: number): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const byte of buf) c = (crcTable[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([length, body, sum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // 8 bitów na kanał
  header[9] = 2; // RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0x2e)]);
  const pixels = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

test.describe('pierwsze uruchomienie', () => {
  // Strefa przeglądarki administratora jest domyślną strefą klubu (CLUB-2).
  test.use({ timezoneId: 'Asia/Tokyo' });

  test('admin zakłada klub z logo i strefą; hub pokazuje pięć pustych widżetów', async ({
    page,
  }) => {
    const mock = await openApp(page, { club: null });

    // CLUB-1: ilustracja, powitanie i jedyny przycisk zamiast widżetów; nagłówek bez klubu.
    await expect(page.getByRole('heading', { level: 1, name: 'Załóż swój klub' })).toBeVisible();
    const art = page.locator('.first-run__art');
    await expect(art).toBeVisible();
    expect((await art.boundingBox())?.width).toBe(isMobile() ? 280 : 400);
    await expect(page.getByRole('heading', { level: 2 })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Twój profil: Ada Adminowska' })).toBeVisible();
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

    // CLUB-4: nazwa i logo w nagłówku oraz pięć widżetów z pustymi stanami.
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
