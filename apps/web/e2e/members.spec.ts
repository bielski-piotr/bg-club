import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  ADA,
  member,
  mockSupabase,
  NEW_MEMBER_PASSWORD,
  session,
  storeSession,
  type MockOptions,
} from './support/supabaseMock';

/**
 * Członkowie: dodawanie członka z jednorazowym hasłem, lista z wyszukiwaniem. API Supabase i Edge
 * Function są atrapą; każdy test przechodzi na
 * 360 px i na desktopie, w motywie jasnym i ciemnym.
 */

const CLUB = { name: 'Planszówki', logo_path: null };
const BEA = member(2, 'Bea', 'Bobrowska');
const LUKASZ = member(3, 'Łukasz', 'Żółw');
const ZOJA = member(9, 'Zoja', 'Zawada', true);

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

const isMobile = () => test.info().project.name.startsWith('mobile');
const search = (page: Page) => page.evaluate(() => decodeURIComponent(window.location.search));

test('admin dodaje pierwszego członka i jednorazowo widzi hook oraz hasło', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const mock = await openApp(page, { members: [] });
  const widget = page.getByRole('region', { name: 'Członkowie', exact: true });
  await expect(widget.getByText('Na razie jesteś tu tylko Ty')).toBeVisible();
  await widget.getByRole('button', { name: 'Dodaj członka' }).click();

  const form = page.getByRole('dialog', { name: 'Dodaj członka' });
  await expect(form).toBeVisible();
  expect(await search(page)).toBe('?p=members/new');
  expect(await horizontalOverflow(page)).toBe(0);
  expect(await axe(page)).toEqual([]);

  await form.getByRole('button', { name: 'Dodaj członka' }).click();
  await expect(form.getByText('Wpisz imię.')).toBeVisible();
  await expect(form.getByText('Wpisz nazwisko.')).toBeVisible();
  expect(mock.memberBodies).toEqual([]);

  await form.getByLabel('Imię').fill('Łukasz');
  await form.getByLabel('Nazwisko').fill('Żółw');
  await form.getByRole('button', { name: 'Dodaj członka' }).click();

  const done = page.getByRole('dialog', { name: 'Członek dodany' });
  await expect(done.getByRole('textbox', { name: 'Hook (login)' })).toHaveValue('lukasz-zolw-7c1e');
  await expect(done.getByRole('textbox', { name: 'Hasło' })).toHaveValue(NEW_MEMBER_PASSWORD);
  await expect(done).toContainText('Hasło pokazujemy tylko teraz.');
  expect(mock.memberBodies).toEqual([{ firstName: 'Łukasz', lastName: 'Żółw' }]);
  // Hasło nie trafia do adresu ani do pamięci przeglądarki.
  expect(page.url()).not.toContain(NEW_MEMBER_PASSWORD);
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
  expect(stored).not.toContain(NEW_MEMBER_PASSWORD);
  expect(await horizontalOverflow(page)).toBe(0);
  expect(await axe(page)).toEqual([]);

  await done.getByRole('button', { name: 'Kopiuj hasło' }).click();
  await expect(page.getByText('Skopiowano hasło')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(NEW_MEMBER_PASSWORD);

  await done.getByRole('button', { name: 'Gotowe' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(widget.getByText('2 osoby')).toBeVisible();
  await expect(widget.getByRole('link', { name: 'Otwórz profil: Łukasz Żółw' })).toBeVisible();

  // Po zamknięciu hasła nie da się odzyskać: Dalej otwiera pusty formularz.
  await page.goForward();
  await expect(page.getByRole('dialog', { name: 'Dodaj członka' })).toBeVisible();
  await expect(page.getByText(NEW_MEMBER_PASSWORD)).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Dodaj członka' }).getByLabel('Imię')).toHaveValue(
    '',
  );
});

test('popup członków: wyszukiwanie bez polskich znaków i „Dodaj” w nagłówku', async ({ page }) => {
  await openApp(page, { members: [BEA, LUKASZ, ZOJA] }, '/?p=members');
  const list = page.getByRole('dialog', { name: 'Członkowie' });
  await expect(list.getByRole('listitem')).toHaveCount(3);
  await expect(list).not.toContainText('Zoja');

  const add = list.getByRole('button', { name: 'Dodaj członka' });
  await expect(add).toBeVisible();
  expect(await add.innerText()).toBe(isMobile() ? 'Dodaj' : 'Dodaj członka');

  const field = list.getByRole('searchbox', { name: 'Szukaj członka' });
  await field.fill('lukasz zol');
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await expect(list.getByRole('link', { name: /Łukasz Żółw/ })).toBeVisible();
  await field.fill(LUKASZ.hook.slice(-4));
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await field.fill('nikogo');
  await expect(list.getByText('Nikt nie pasuje do „nikogo”')).toBeVisible();
  expect(await axe(page)).toEqual([]);
  await field.press('Escape');
  await expect(list.getByRole('listitem')).toHaveCount(3);
  // Esc w wyszukiwarce czyści pole, nie zamyka popupu.
  await expect(list).toBeVisible();

  await list.getByRole('link', { name: /Łukasz Żółw/ }).click();
  await expect(page.getByRole('dialog', { name: 'Profil' }).getByText(LUKASZ.hook)).toBeVisible();

  await page.goBack();
  await add.click();
  await expect(page.getByRole('dialog', { name: 'Dodaj członka' })).toBeVisible();
  expect(await search(page)).toBe('?p=members&p=members/new');
  expect(await horizontalOverflow(page)).toBe(0);
});

test('błąd funkcji nie gubi danych formularza', async ({ page }) => {
  await openApp(
    page,
    { members: [BEA], createMember: { status: 500, body: { error: 'failed' } } },
    '/?p=members/new',
  );
  const form = page.getByRole('dialog', { name: 'Dodaj członka' });
  await form.getByLabel('Imię').fill('Ola');
  await form.getByLabel('Nazwisko').fill('Nowak');
  await form.getByRole('button', { name: 'Dodaj członka' }).click();
  await expect(
    form.getByText('Nie udało się dodać członka. Nic nie zostało zapisane, spróbuj ponownie.'),
  ).toBeVisible();
  await expect(form.getByLabel('Imię')).toHaveValue('Ola');
  expect(await axe(page)).toEqual([]);
});

test('gracz nie ma „Dodaj członka”, a formularz z linku jest niedostępny', async ({ page }) => {
  const mock = await openApp(
    page,
    { profile: { ...ADA, role: 'player' }, members: [BEA] },
    '/?p=members/new',
  );
  await expect(page.getByRole('dialog', { name: 'Nie znaleziono' })).toBeVisible();
  await page.goto('/?p=members');
  const list = page.getByRole('dialog', { name: 'Członkowie' });
  await expect(list.getByRole('listitem')).toHaveCount(2);
  await expect(list.getByRole('button', { name: 'Dodaj członka' })).toHaveCount(0);
  expect(mock.memberBodies).toEqual([]);
});
