import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  ADA,
  member,
  mockSupabase,
  session,
  storeSession,
  type MockOptions,
} from './support/supabaseMock';

/**
 * Profil i ustawienia (PRD USR-2…USR-5, USR-7, USR-8, AUTH-6): akcje właściciela i innych
 * graczy, zdjęcie z kadrowaniem 256×256, powrót do monogramu, motyw w profilu i localStorage,
 * zmiana hasła i propozycja przy pierwszym logowaniu. API Supabase jest atrapą; każdy test
 * przechodzi na 360 px i na desktopie, w motywie jasnym i ciemnym.
 */

const CLUB = { name: 'Planszówki', logo_path: null };
const BEA = member(2, 'Bea', 'Bobrowska');
const OLD_AVATAR = `${ADA.id}/avatar-stary.webp`;

async function openApp(page: Page, options: MockOptions = {}, path = '/') {
  const mock = await mockSupabase(page, { club: CLUB, members: [BEA], ...options });
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

/** Zdjęcie PNG 640×400 (dwa kolory), narysowane w przeglądarce. */
async function landscapePng(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 400;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('brak canvas');
    context.fillStyle = '#2e86ab';
    context.fillRect(0, 0, 640, 400);
    context.fillStyle = '#e09f1f';
    context.fillRect(320, 0, 320, 400);
    return canvas.toDataURL('image/png');
  });
  return Buffer.from(dataUrl.split(',')[1] ?? '', 'base64');
}

async function openSettings(page: Page) {
  await page.getByRole('button', { name: 'Twoje konto: Ada Adminowska' }).click();
  await page.getByRole('menuitem', { name: 'Ustawienia' }).click();
  const dialog = page.getByRole('dialog', { name: 'Ustawienia' });
  await expect(dialog).toBeVisible();
  return dialog;
}

test('własny profil ma Ustawienia i stany oczekiwania, cudzy nie ma akcji (USR-4, USR-7)', async ({
  page,
}) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Twoje konto: Ada Adminowska' }).click();
  await expect(page.getByRole('menu', { name: 'Menu konta' })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Mój profil' }).click();
  const own = page.getByRole('dialog', { name: 'Profil' });
  await expect(own.getByRole('button', { name: 'Ustawienia' })).toBeVisible();
  await expect(own.getByText('Statystyki pojawią się po pierwszej partii')).toBeVisible();
  await expect(own.getByText('Gablota jest jeszcze pusta')).toBeVisible();
  expect(await horizontalOverflow(page)).toBe(0);
  expect(await axe(page)).toEqual([]);

  // Admin ogląda profil gracza: bez ustawień i bez edycji (USR-7).
  await page.goto(`/?p=profile/${BEA.id}`);
  const other = page.getByRole('dialog', { name: 'Profil' });
  await expect(other.getByText('Bea Bobrowska')).toBeVisible();
  await expect(other.getByRole('button', { name: 'Ustawienia' })).toHaveCount(0);
  await expect(other.getByText('Statystyki pojawią się po pierwszej partii')).toBeVisible();
});

test('zdjęcie: wybór, kadrowanie 256×256 i zapis z nazwiskiem (USR-3, USR-5)', async ({ page }) => {
  const mock = await openApp(page);
  const dialog = await openSettings(page);
  expect(await search(page)).toBe('?p=settings');
  expect(await horizontalOverflow(page)).toBe(0);
  expect(await axe(page)).toEqual([]);

  await dialog.getByLabel('Zdjęcie profilowe', { exact: true }).setInputFiles({
    name: 'zdjecie.png',
    mimeType: 'image/png',
    buffer: await landscapePng(page),
  });
  const crop = page.getByRole('dialog', { name: 'Kadrowanie zdjęcia' });
  const stage = crop.getByRole('group', { name: /Kadr zdjęcia/ });
  await expect(stage).toBeVisible();
  expect(await horizontalOverflow(page)).toBe(0);
  expect(await axe(page)).toEqual([]);

  // Przeciągnięcie i klawiatura przesuwają zdjęcie, suwak je powiększa.
  const image = stage.locator('img');
  const before = await image.boundingBox();
  const box = await stage.boundingBox();
  if (!box || !before) throw new Error('brak kadru');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2, { steps: 4 });
  await page.mouse.up();
  await expect.poll(async () => (await image.boundingBox())?.x).toBeGreaterThan(before.x);
  await stage.focus();
  await page.keyboard.press('ArrowLeft');
  await crop.getByRole('slider', { name: 'Powiększenie' }).fill('200');
  await expect(crop.getByRole('slider', { name: 'Powiększenie' })).toHaveAttribute(
    'aria-valuetext',
    '200%',
  );
  await crop.getByRole('button', { name: 'Gotowe' }).click();

  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Zmień zdjęcie' })).toBeVisible();
  await dialog.getByLabel('Nazwisko').fill(' Adamska ');
  await dialog.getByRole('button', { name: 'Zapisz' }).click();
  await expect(page.getByText('Zapisano zmiany')).toBeVisible();
  expect(await search(page)).toBe('');

  expect(mock.avatarUploads).toEqual([
    expect.stringMatching(new RegExp(`^${ADA.id}/avatar-[0-9a-f-]{36}\\.webp$`)),
  ]);
  expect(mock.profileWrites.at(-1)).toEqual({
    first_name: 'Ada',
    last_name: 'Adamska',
    avatar_path: mock.avatarUploads[0],
  });
  // Nagłówek pokazuje nowe zdjęcie zamiast monogramu.
  await expect(
    page.getByRole('button', { name: 'Twoje konto: Ada Adamska' }).locator('img'),
  ).toBeVisible();
});

test('powrót do monogramu usuwa zdjęcie (USR-3)', async ({ page }) => {
  const mock = await openApp(page, { profile: { ...ADA, avatar_path: OLD_AVATAR } });
  await expect(
    page.getByRole('button', { name: 'Twoje konto: Ada Adminowska' }).locator('img'),
  ).toBeVisible();
  const dialog = await openSettings(page);
  await dialog.getByRole('button', { name: 'Usuń zdjęcie' }).click();
  await expect(dialog.getByRole('button', { name: 'Dodaj zdjęcie' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Zapisz' }).click();
  await expect(page.getByText('Zapisano zmiany')).toBeVisible();
  expect(mock.profileWrites.at(-1)).toMatchObject({ avatar_path: null });
  expect(mock.avatarRemoved).toEqual([OLD_AVATAR]);
  await expect(
    page.getByRole('button', { name: 'Twoje konto: Ada Adminowska' }).locator('img'),
  ).toHaveCount(0);
});

test('nieobsługiwany plik daje polski komunikat (USR-3)', async ({ page }) => {
  const mock = await openApp(page);
  const dialog = await openSettings(page);
  await dialog
    .getByLabel('Zdjęcie profilowe', { exact: true })
    .setInputFiles({ name: 'anim.gif', mimeType: 'image/gif', buffer: Buffer.from('GIF89a') });
  await expect(dialog.getByRole('alert')).toHaveText('Wybierz zdjęcie JPG, PNG lub WebP.');
  expect(mock.avatarUploads).toEqual([]);
});

test('motyw zapisuje się w profilu i localStorage i nie miga po przeładowaniu (USR-8)', async ({
  page,
}) => {
  const mock = await openApp(page);
  const dialog = await openSettings(page);
  await dialog.getByText('Ciemny', { exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect.poll(() => mock.profileWrites).toContainEqual({ theme: 'dark' });
  expect(await page.evaluate(() => localStorage.getItem('bg-club.theme'))).toBe('dark');

  // Skrypt w index.html stosuje motyw przed pierwszym renderem.
  await page.reload({ waitUntil: 'commit' });
  await page.waitForSelector('html[data-theme="dark"]', { state: 'attached', timeout: 2000 });
  await expect(page.getByRole('dialog', { name: 'Ustawienia' })).toBeVisible();
  expect(await axe(page)).toEqual([]);

  await page.getByRole('dialog', { name: 'Ustawienia' }).getByText('Systemowy').click();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme');
  expect(await page.evaluate(() => localStorage.getItem('bg-club.theme'))).toBeNull();
});

test('motyw z profilu działa na nowym urządzeniu (USR-8)', async ({ page }) => {
  await openApp(page, { profile: { ...ADA, theme: 'light' } });
  await expect(page.getByRole('heading', { level: 1, name: 'Planszówki' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await page.evaluate(() => localStorage.getItem('bg-club.theme'))).toBe('light');
});

test('zmiana hasła sprawdza obecne hasło i dwa nowe wpisy (USR-5)', async ({ page }) => {
  const mock = await openApp(page, {
    updateUserError: { status: 400, code: 'current_password_invalid' },
  });
  const settings = await openSettings(page);
  await settings.getByRole('button', { name: 'Zmień hasło' }).click();
  const dialog = page.getByRole('dialog', { name: 'Zmiana hasła' });
  expect(await search(page)).toBe('?p=settings&p=settings/password');

  await dialog.getByRole('button', { name: 'Zmień hasło' }).click();
  await expect(dialog.getByText('Wpisz obecne hasło.')).toBeVisible();
  await dialog.getByLabel('Obecne hasło').fill('zle-haslo');
  await dialog.getByLabel('Nowe hasło', { exact: true }).fill('krotkie');
  await dialog.getByLabel('Powtórz nowe hasło').fill('inne');
  await expect(dialog.getByText('Hasło musi mieć co najmniej 12 znaków.')).toBeVisible();
  await expect(dialog.getByText('Hasła nie są takie same.')).toBeVisible();
  expect(await horizontalOverflow(page)).toBe(0);
  expect(await axe(page)).toEqual([]);
  expect(mock.userUpdates).toEqual([]);

  await dialog.getByLabel('Nowe hasło', { exact: true }).fill('nowe-haslo-123');
  await dialog.getByLabel('Powtórz nowe hasło').fill('nowe-haslo-123');
  await dialog.getByRole('button', { name: 'Zmień hasło' }).click();
  await expect(dialog.getByText('Obecne hasło jest nieprawidłowe.')).toBeVisible();
  expect(mock.userUpdates).toEqual([
    expect.objectContaining({ password: 'nowe-haslo-123', current_password: 'zle-haslo' }),
  ]);

  mock.options.updateUserError = undefined;
  await dialog.getByLabel('Obecne hasło').fill('stare-haslo-123');
  await dialog.getByRole('button', { name: 'Zmień hasło' }).click();
  await expect(page.getByText('Hasło zostało zmienione')).toBeVisible();
  expect(await search(page)).toBe('?p=settings');
  expect(page.url()).not.toContain('haslo');
});

test('pierwsze logowanie proponuje własne hasło, które można pominąć (AUTH-6)', async ({
  page,
}) => {
  const mock = await openApp(page, { profile: { ...ADA, password_change_suggested: true } });
  const dialog = page.getByRole('dialog', { name: 'Ustaw własne hasło' });
  await expect(dialog).toBeVisible();
  expect(await search(page)).toBe('?p=first-login');
  await expect(dialog.getByLabel('Hasło od administratora')).toBeVisible();
  expect(await horizontalOverflow(page)).toBe(0);
  expect(await axe(page)).toEqual([]);

  await dialog.getByRole('button', { name: 'Pomiń' }).click();
  await expect(dialog).toBeHidden();
  expect(await search(page)).toBe('');
  expect(mock.profileWrites).toEqual([{ password_change_suggested: false }]);

  // Po pominięciu propozycja nie wraca po przeładowaniu.
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Planszówki' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
