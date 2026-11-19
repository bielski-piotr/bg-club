import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  ADA_EMAIL,
  mockSupabase,
  SESSION_STORAGE_KEY,
  session,
  storeSession,
} from './support/supabaseMock';

/**
 * Logowanie hookiem, sesja i wylogowanie w przeglądarce.
 * API Supabase jest atrapą (support/supabaseMock.ts); każdy test przechodzi na 360 px i na
 * desktopie, w motywie jasnym i ciemnym.
 */

const loginHeading = (page: Page) => page.getByRole('heading', { level: 1, name: 'Zaloguj się' });
// Atrapa domyślnie jest pustą instalacją: admin po zalogowaniu widzi pierwsze uruchomienie.
const homeHeading = (page: Page) =>
  page.getByRole('heading', { level: 1, name: 'Załóż swój klub' });

async function logIn(page: Page, hook: string, password: string) {
  await page.getByLabel('Hook').fill(hook);
  await page.getByLabel('Hasło', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Zaloguj się' }).click();
}

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

const storedSession = (page: Page) =>
  page.evaluate((key) => localStorage.getItem(key), SESSION_STORAGE_KEY);

test('logowanie hookiem, widok po zalogowaniu i wylogowanie', async ({ page }) => {
  const mock = await mockSupabase(page);
  await page.goto('/');
  await expect(loginHeading(page)).toBeVisible();

  await logIn(page, '  Ada-Adminowska-A001 ', 'tajne-haslo-123');
  await expect(homeHeading(page)).toBeVisible();
  expect(mock.passwordBodies).toEqual([
    expect.objectContaining({ email: ADA_EMAIL, password: 'tajne-haslo-123' }),
  ]);
  expect(await horizontalOverflow(page)).toBe(0);

  // Hook jest we własnym profilu, wylogowanie w ustawieniach (menu chipu użytkownika).
  await page.getByRole('button', { name: 'Twoje konto: Ada Adminowska' }).click();
  await page.getByRole('menuitem', { name: 'Mój profil' }).click();
  const profile = page.getByRole('dialog', { name: 'Profil' });
  await expect(profile.getByText('ada-adminowska-a001', { exact: true })).toBeVisible();
  // Techniczny e-mail nigdy nie jest widoczny.
  await expect(page.locator('body')).not.toContainText('bgclub.invalid');

  await profile.getByRole('button', { name: 'Ustawienia' }).click();
  await page
    .getByRole('dialog', { name: 'Ustawienia' })
    .getByRole('button', { name: 'Wyloguj się' })
    .click();
  await expect(loginHeading(page)).toBeVisible();
  expect(mock.calls).toContain('POST /auth/v1/logout?scope=local');
  expect(await storedSession(page)).toBeNull();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('sesja trwa po przeładowaniu strony', async ({ page }) => {
  const mock = await mockSupabase(page);
  await page.goto('/');
  await logIn(page, 'ada-adminowska-a001', 'tajne-haslo-123');
  await expect(homeHeading(page)).toBeVisible();

  await page.reload();
  await expect(homeHeading(page)).toBeVisible();
  expect(mock.calls.filter((call) => call.includes('grant_type=password'))).toHaveLength(1);
});

test('wygasły token dostępu odświeża się bez ponownego logowania', async ({ page }) => {
  const mock = await mockSupabase(page);
  await storeSession(page, session(-60));
  await page.goto('/');

  await expect(homeHeading(page)).toBeVisible();
  expect(mock.calls).toContain('POST /auth/v1/token?grant_type=refresh_token');
  expect(mock.calls.filter((call) => call.includes('grant_type=password'))).toHaveLength(0);
});

test('odrzucone odświeżenie usuniętego konta wraca do logowania', async ({ page }) => {
  const mock = await mockSupabase(page, { refresh: { kind: 'accountInactive' } });
  await storeSession(page, session(-60));
  await page.goto('/');

  await expect(loginHeading(page)).toBeVisible();
  expect(mock.calls).toContain('POST /auth/v1/token?grant_type=refresh_token');
  expect(mock.calls.some((call) => call.startsWith('GET /rest/v1/'))).toBe(false);
  expect(await storedSession(page)).toBeNull();
});

test('ważna sesja usuniętego konta nie pokazuje danych i kończy się', async ({ page }) => {
  const mock = await mockSupabase(page, { profile: null });
  await storeSession(page, session());
  await page.goto('/');

  await expect(loginHeading(page)).toBeVisible();
  await expect(page.getByRole('alert')).toHaveText(
    'To konto zostało usunięte. Jeśli to pomyłka, skontaktuj się z administratorem klubu.',
  );
  expect(mock.calls).toContain('POST /auth/v1/logout?scope=local');
  expect(await storedSession(page)).toBeNull();
});

test('błędy logowania są po polsku i nie zostawiają sesji', async ({ page }) => {
  const mock = await mockSupabase(page, { password: { kind: 'invalidCredentials' } });
  await page.goto('/');

  await page.getByRole('button', { name: 'Zaloguj się' }).click();
  await expect(page.getByText('Wpisz swój hook.')).toBeVisible();
  await expect(page.getByText('Wpisz hasło.')).toBeVisible();
  await expect(page.getByLabel('Hook')).toBeFocused();

  await logIn(page, 'jan.kowalski', 'haslo');
  await expect(
    page.getByText('Hook to małe litery, cyfry i myślniki, np. jan-kowalski-3f9a.'),
  ).toBeVisible();
  expect(mock.passwordBodies).toHaveLength(0);

  await logIn(page, 'ada-adminowska-a001', 'zle-haslo');
  await expect(page.getByRole('alert')).toHaveText('Nieprawidłowy hook lub hasło.');
  await expect(page.getByLabel('Hasło', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Hasło', { exact: true })).toBeFocused();

  mock.options.password = { kind: 'accountInactive' };
  await page.getByLabel('Hasło', { exact: true }).fill('tajne-haslo-123');
  await page.getByRole('button', { name: 'Zaloguj się' }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'To konto zostało usunięte. Jeśli to pomyłka, skontaktuj się z administratorem klubu.',
  );

  mock.options.password = { kind: 'offline' };
  await page.getByRole('button', { name: 'Zaloguj się' }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'Brak połączenia z serwerem. Sprawdź internet i spróbuj ponownie.',
  );
  expect(await storedSession(page)).toBeNull();
  expect(await horizontalOverflow(page)).toBe(0);
});

test('ekran logowania i widok po zalogowaniu bez naruszeń WCAG A/AA (axe)', async ({ page }) => {
  const mock = await mockSupabase(page, { password: { kind: 'invalidCredentials' } });
  await page.goto('/');
  await logIn(page, 'ada-adminowska-a001', 'zle-haslo');
  await expect(page.getByRole('alert')).toBeVisible();
  const login = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    login.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`),
  ).toEqual([]);

  mock.options.password = { kind: 'session' };
  await page.getByLabel('Hasło', { exact: true }).fill('tajne-haslo-123');
  await page.getByRole('button', { name: 'Zaloguj się' }).click();
  await expect(homeHeading(page)).toBeVisible();
  const home = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(
    home.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`),
  ).toEqual([]);
});
