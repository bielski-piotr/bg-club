import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  ADA,
  member,
  mockSupabase,
  OWN_ACCOUNT_PASSWORD,
  session,
  storeSession,
  type MockOptions,
} from './support/supabaseMock';

/**
 * Usuwanie członka przez administratora i własnego konta przez gracza: potwierdzenia, stan tylko do
 * odczytu po usunięciu, zniknięcie z listy,
 * hasło przy własnym koncie i brak tych opcji tam, gdzie nie wolno. API Supabase jest atrapą
 * (skutki w bazie sprawdza `pnpm test:auth`); każdy test przechodzi na 360 px i na desktopie,
 * w motywie jasnym i ciemnym.
 */

const CLUB = { name: 'Planszówki', logo_path: null };
const BEA = member(2, 'Bea', 'Bobrowska');
const CEZARY = member(3, 'Cezary', 'Cichy');
const PLAYER_ADA = { ...ADA, role: 'player' as const };

async function openApp(page: Page, options: MockOptions = {}, path = '/') {
  const mock = await mockSupabase(page, { club: CLUB, members: [BEA, CEZARY], ...options });
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

async function openSettings(page: Page, name: string) {
  await page.getByRole('button', { name: `Twoje konto: ${name}` }).click();
  await page.getByRole('menuitem', { name: 'Ustawienia' }).click();
  const dialog = page.getByRole('dialog', { name: 'Ustawienia' });
  await expect(dialog).toBeVisible();
  return dialog;
}

test('admin usuwa członka z potwierdzeniem; profil zostaje tylko do odczytu', async ({ page }) => {
  const mock = await openApp(page, {}, '/?p=members');
  const members = page.getByRole('dialog', { name: 'Członkowie' });
  await members.getByRole('link', { name: /Bea Bobrowska/ }).click();
  const profile = page.getByRole('dialog', { name: 'Profil' });
  await profile.getByRole('button', { name: 'Usuń członka' }).click();

  const confirm = page.getByRole('dialog', { name: 'Usunąć członka?' });
  await expect(confirm).toBeVisible();
  await expect(confirm.getByText(/Bea Bobrowska zniknie z listy członków/)).toBeVisible();
  expect(await search(page)).toBe(`?p=members&p=profile/${BEA.id}&p=profile/${BEA.id}/delete`);
  expect(await horizontalOverflow(page)).toBe(0);
  expect(await axe(page)).toEqual([]);

  // Anuluj wraca do profilu bez wywołania funkcji.
  await confirm.getByRole('button', { name: 'Anuluj' }).click();
  await expect(profile).toBeVisible();
  expect(mock.deleteMemberBodies).toEqual([]);

  await profile.getByRole('button', { name: 'Usuń członka' }).click();
  await page
    .getByRole('dialog', { name: 'Usunąć członka?' })
    .getByRole('button', { name: 'Usuń' })
    .click();
  await expect(page.getByText('Usunięto członka Bea Bobrowska')).toBeVisible();
  expect(mock.deleteMemberBodies).toEqual([{ memberId: BEA.id }]);

  // Profil po usunięciu jest tylko do odczytu, bez akcji administratora.
  await expect(profile.getByText('(usunięty)')).toBeVisible();
  await expect(profile.getByText('Profil jest tylko do odczytu.', { exact: false })).toBeVisible();
  await expect(profile.getByRole('button', { name: 'Usuń członka' })).toHaveCount(0);
  expect(await search(page)).toBe(`?p=members&p=profile/${BEA.id}`);

  // Lista członków go nie pokazuje.
  await profile.getByRole('button', { name: 'Wróć' }).click();
  await expect(members.getByRole('link', { name: /Cezary Cichy/ })).toBeVisible();
  await expect(members.getByRole('link', { name: /Bea Bobrowska/ })).toHaveCount(0);

  // Link do potwierdzenia usuniętego członka nie pozwala usunąć go drugi raz.
  await page.goto(`/?p=profile/${BEA.id}/delete`);
  await expect(page.getByRole('dialog', { name: 'Nie znaleziono' })).toBeVisible();
});

test('błąd funkcji pokazuje komunikat, a ponowienie usuwa członka', async ({ page }) => {
  const mock = await openApp(
    page,
    { deleteMember: { status: 500, body: { error: 'failed' } } },
    `/?p=profile/${CEZARY.id}&p=profile/${CEZARY.id}/delete`,
  );
  const confirm = page.getByRole('dialog', { name: 'Usunąć członka?' });
  await confirm.getByRole('button', { name: 'Usuń' }).click();
  await expect(confirm.getByText('Nie udało się usunąć członka. Spróbuj ponownie.')).toBeVisible();

  mock.options.deleteMember = undefined;
  await confirm.getByRole('button', { name: 'Usuń' }).click();
  await expect(page.getByText('Usunięto członka Cezary Cichy')).toBeVisible();
  expect(mock.deleteMemberBodies).toHaveLength(2);
});

test('administratora nie da się usunąć: brak opcji w profilu i w ustawieniach', async ({
  page,
}) => {
  await openApp(page, {}, `/?p=profile/${ADA.id}`);
  const profile = page.getByRole('dialog', { name: 'Profil' });
  await expect(profile.getByText('Ada Adminowska')).toBeVisible();
  await expect(profile.getByRole('button', { name: 'Usuń członka' })).toHaveCount(0);

  await page.goto('/');
  const settings = await openSettings(page, 'Ada Adminowska');
  await expect(settings.getByRole('button', { name: 'Zmień hasło' })).toBeVisible();
  await expect(settings.getByRole('button', { name: 'Usuń konto' })).toHaveCount(0);

  await page.goto(`/?p=profile/${ADA.id}/delete`);
  await expect(page.getByRole('dialog', { name: 'Nie znaleziono' })).toBeVisible();
  await page.goto('/?p=settings&p=settings/delete');
  await expect(page.getByRole('dialog', { name: 'Nie znaleziono' })).toBeVisible();
});

test('gracz nie usuwa innych członków', async ({ page }) => {
  const mock = await openApp(page, { profile: PLAYER_ADA }, `/?p=profile/${BEA.id}`);
  const profile = page.getByRole('dialog', { name: 'Profil' });
  await expect(profile.getByText('Bea Bobrowska')).toBeVisible();
  await expect(profile.getByRole('button', { name: 'Usuń członka' })).toHaveCount(0);
  await page.goto(`/?p=profile/${BEA.id}/delete`);
  await expect(page.getByRole('dialog', { name: 'Nie znaleziono' })).toBeVisible();
  expect(mock.deleteMemberBodies).toEqual([]);
});

test('gracz usuwa własne konto po podaniu hasła i wraca do logowania', async ({ page }) => {
  const mock = await openApp(page, { profile: PLAYER_ADA });
  const settings = await openSettings(page, 'Ada Adminowska');
  await expect(settings.getByText('Twoje partie i wyniki zostaną w historii klubu')).toBeVisible();
  await settings.getByRole('button', { name: 'Usuń konto' }).click();

  const confirm = page.getByRole('dialog', { name: 'Usunąć konto?' });
  await expect(confirm).toBeVisible();
  expect(await search(page)).toBe('?p=settings&p=settings/delete');
  await confirm.getByRole('button', { name: 'Usuń konto' }).click();
  await expect(confirm.getByText('Wpisz hasło.')).toBeVisible();
  expect(mock.deleteOwnBodies).toEqual([]);
  expect(await horizontalOverflow(page)).toBe(0);
  expect(await axe(page)).toEqual([]);

  await confirm.getByLabel('Hasło', { exact: true }).fill('zle-haslo-123');
  await confirm.getByRole('button', { name: 'Usuń konto' }).click();
  await expect(confirm.getByText('Nieprawidłowe hasło.')).toBeVisible();

  await confirm.getByLabel('Hasło', { exact: true }).fill(OWN_ACCOUNT_PASSWORD);
  await confirm.getByRole('button', { name: 'Usuń konto' }).click();
  await expect(page.getByRole('heading', { name: 'Zaloguj się' })).toBeVisible();
  await expect(page.getByText('Twoje konto zostało usunięte.', { exact: false })).toBeVisible();
  expect(mock.deleteOwnBodies).toEqual([
    { password: 'zle-haslo-123' },
    { password: OWN_ACCOUNT_PASSWORD },
  ]);
  // Hasło nie trafia do adresu, a popupy poprzedniej sesji znikają z niego.
  expect(page.url()).not.toContain('Haslo');
  expect(await search(page)).toBe('');
  expect(await axe(page)).toEqual([]);
});

test('limit prób przy usuwaniu konta daje polski komunikat', async ({ page }) => {
  await openApp(
    page,
    { profile: PLAYER_ADA, deleteOwnAccount: { status: 429, body: { error: 'rate_limited' } } },
    '/?p=settings&p=settings/delete',
  );
  const confirm = page.getByRole('dialog', { name: 'Usunąć konto?' });
  await confirm.getByLabel('Hasło', { exact: true }).fill(OWN_ACCOUNT_PASSWORD);
  await confirm.getByRole('button', { name: 'Usuń konto' }).click();
  await expect(
    confirm.getByText('Zbyt wiele prób. Odczekaj chwilę i spróbuj ponownie.'),
  ).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Usunąć konto?' })).toBeVisible();
});
