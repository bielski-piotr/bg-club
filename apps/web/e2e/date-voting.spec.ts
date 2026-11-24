import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  ADA,
  member,
  mockMeeting,
  mockSupabase,
  session,
  storeSession,
  type MockDateOption,
  type MockOptions,
} from './support/supabaseMock';

/**
 * Głosowanie na termin: propozycje administratora w formularzu, głosy uczestników
 * w popupie spotkania i decyzja administratora („Wybierz”), która nie musi pokrywać się
 * z głosami. API Supabase jest atrapą; reguły (RLS, zamknięte głosowanie, limit) sprawdza test
 * SQL `290_date_voting_records_changes`.
 */

const NOW = new Date('2026-11-20T10:00:00Z');
const CLUB = { name: 'Planszówki', logo_path: null, timezone: 'Europe/Warsaw' };
const BEA = member(2, 'Bea', 'Bobrowska');
const CEZARY = member(3, 'Cezary', 'Cichy');

const MEETING = mockMeeting(5, 'Sobotnie granie', {
  participants: [ADA.id, BEA.id, CEZARY.id],
  date_voting_open: true,
});

const SATURDAY: MockDateOption = {
  id: '00000000-0000-4000-9000-000000000101',
  meeting_id: MEETING.id,
  starts_at: '2026-11-28T17:00:00+00:00',
};
const SUNDAY: MockDateOption = {
  id: '00000000-0000-4000-9000-000000000102',
  meeting_id: MEETING.id,
  starts_at: '2026-11-29T16:30:00+00:00',
};

const SATURDAY_LABEL = 'sobota, 28 lis 2026 · 18:00';
const SUNDAY_LABEL = 'niedziela, 29 lis 2026 · 17:30';

async function openApp(page: Page, path: string, options: MockOptions = {}) {
  await page.clock.setFixedTime(NOW);
  const mock = await mockSupabase(page, {
    club: CLUB,
    members: [BEA, CEZARY],
    meetings: [{ ...MEETING }],
    dateOptions: [{ ...SATURDAY }, { ...SUNDAY }],
    dateVotes: [
      { option_id: SATURDAY.id, meeting_id: MEETING.id, profile_id: BEA.id },
      { option_id: SUNDAY.id, meeting_id: MEETING.id, profile_id: BEA.id },
      { option_id: SUNDAY.id, meeting_id: MEETING.id, profile_id: CEZARY.id },
    ],
    ...options,
  });
  await storeSession(page, session());
  await page.goto(path);
  return mock;
}

async function check(page: Page) {
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => animation.playState !== 'running'),
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBe(0);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`),
  ).toEqual([]);
}

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Sobotnie granie' });
const options = (page: Page) =>
  dialog(page).getByRole('list', { name: 'Proponowane terminy' }).locator(':scope > li');

test('uczestnik głosuje na terminy, admin wybiera termin wbrew głosom i otwiera głosowanie ponownie', async ({
  page,
}) => {
  const mock = await openApp(page, `/?p=meeting/${MEETING.id}`);
  await expect(dialog(page).getByRole('heading', { name: 'Termin' })).toBeVisible();
  await expect(options(page)).toHaveCount(2);
  await expect(options(page).nth(0)).toContainText(SATURDAY_LABEL);
  await expect(options(page).nth(0)).toContainText('1 głos');
  await expect(options(page).nth(0)).toContainText('Termin spotkania');
  await expect(options(page).nth(1)).toContainText('2 głosy');
  await expect(options(page).nth(1)).toContainText('Najwięcej głosów');
  await check(page);

  // Głos administratora (uczestnika) na niedzielę.
  await dialog(page)
    .getByRole('button', { name: `Zagłosuj na termin ${SUNDAY_LABEL}` })
    .click();
  await expect(page.getByText('Głos zapisany')).toBeVisible();
  await expect(options(page).nth(1)).toContainText('3 głosy');
  expect(
    mock.options.dateVotes?.some((v) => v.option_id === SUNDAY.id && v.profile_id === ADA.id),
  ).toBe(true);

  // Decyzja administratora: sobota, choć niedziela ma więcej głosów (głosy to opinia).
  await dialog(page)
    .getByRole('button', { name: `Ustal termin spotkania: ${SATURDAY_LABEL}` })
    .click();
  await expect(page.getByText('Termin spotkania ustalony')).toBeVisible();
  expect(mock.dateDecisions).toEqual([{ meetingId: MEETING.id, optionId: SATURDAY.id }]);
  // Głosowanie na termin zamknięte: bez przełączników, z ponownym otwarciem.
  await expect(
    dialog(page).getByText('Głosowanie na termin jest zamknięte.', { exact: false }),
  ).toBeVisible();
  await expect(dialog(page).getByRole('button', { name: /^Zagłosuj na termin/ })).toHaveCount(0);

  await dialog(page)
    .getByRole('button', { name: 'Ustal termin spotkania: ' + SUNDAY_LABEL })
    .click();
  await expect(dialog(page).locator('.meeting-view__date')).toContainText(SUNDAY_LABEL);
  await expect(options(page).nth(1)).toContainText('Termin spotkania');

  await dialog(page).getByRole('button', { name: 'Otwórz głosowanie na termin ponownie' }).click();
  await expect(page.getByText('Głosowanie na termin otwarte ponownie')).toBeVisible();
  await expect(
    dialog(page).getByRole('button', { name: `Cofnij głos na termin ${SUNDAY_LABEL}` }),
  ).toBeVisible();
  await check(page);
});

test('gracz spoza spotkania widzi głosy bez przełącznika i bez wyboru terminu', async ({
  page,
}) => {
  await openApp(page, `/?p=meeting/${MEETING.id}`, {
    profile: { ...ADA, role: 'player' },
    meetings: [{ ...MEETING, participants: [BEA.id, CEZARY.id] }],
  });
  await expect(options(page)).toHaveCount(2);
  await expect(
    dialog(page).getByText('Głosują tylko uczestnicy spotkania.', { exact: false }).first(),
  ).toBeVisible();
  await expect(dialog(page).getByRole('button', { name: /^Zagłosuj na termin/ })).toHaveCount(0);
  await expect(dialog(page).getByRole('button', { name: /^Ustal termin spotkania/ })).toHaveCount(
    0,
  );
});

test('uczestnik proponuje własny termin i od razu na niego głosuje (bez limitu)', async ({
  page,
}) => {
  const mock = await openApp(page, `/?p=meeting/${MEETING.id}`, {
    profile: { ...ADA, role: 'player' },
    dateOptions: [],
    dateVotes: [],
  });
  await expect(dialog(page).getByText('Nikt jeszcze nie zaproponował terminu.')).toBeVisible();
  const propose = dialog(page).getByRole('form', { name: 'Zaproponuj termin' });
  await propose.getByLabel('Data').fill('2026-11-29');
  await propose.getByRole('button', { name: 'Zaproponuj' }).click();
  await expect(page.getByText('Termin zaproponowany')).toBeVisible();
  await propose.getByLabel('Data').fill('2026-11-30');
  await propose.getByRole('button', { name: 'Zaproponuj' }).click();
  await expect(options(page)).toHaveCount(2);
  await expect(options(page).nth(0)).toContainText('niedziela, 29 lis 2026 · 18:00');
  await expect(options(page).nth(0)).toContainText('1 głos');
  await expect(
    dialog(page).getByRole('button', {
      name: 'Cofnij głos na termin niedziela, 29 lis 2026 · 18:00',
    }),
  ).toBeVisible();
  expect(mock.dateProposals).toEqual([
    { meeting_id: MEETING.id, local_date: '2026-11-29', local_time: '18:00' },
    { meeting_id: MEETING.id, local_date: '2026-11-30', local_time: '18:00' },
  ]);
  // Gracz nie ustala terminu.
  await expect(dialog(page).getByRole('button', { name: /^Ustal termin spotkania/ })).toHaveCount(
    0,
  );
  await check(page);
});

test('spotkanie bez głosowania na termin nie ma sekcji „Termin”', async ({ page }) => {
  await openApp(page, `/?p=meeting/${MEETING.id}`, {
    meetings: [{ ...MEETING, date_voting_open: false }],
    dateOptions: [],
    dateVotes: [],
  });
  await expect(dialog(page).getByRole('heading', { name: 'Głosowanie' })).toBeVisible();
  await expect(dialog(page).getByRole('heading', { name: 'Termin' })).toHaveCount(0);
});

test('formularz: admin dodaje, zmienia i usuwa propozycje terminu', async ({ page }) => {
  const mock = await openApp(page, `/?p=meeting/${MEETING.id}&p=meeting/${MEETING.id}/edit`);
  const form = page.getByRole('dialog', { name: 'Edytuj spotkanie' });
  await expect(form.getByRole('checkbox', { name: 'Głosowanie na termin' })).toBeChecked();
  const rows = form.getByRole('list', { name: 'Proponowane terminy' }).locator(':scope > li');
  await expect(rows).toHaveCount(2);
  await expect(form.getByLabel('Data propozycji 2')).toHaveValue('2026-11-29');

  await form.getByRole('button', { name: 'Usuń propozycję 1' }).click();
  await expect(rows).toHaveCount(1);
  await form.getByRole('button', { name: 'Dodaj propozycję terminu' }).click();
  await expect(rows).toHaveCount(2);
  // Nowa propozycja kopiuje ostatnią: powtórzony termin blokuje zapis.
  await form.getByRole('button', { name: 'Zapisz' }).click();
  await expect(form.getByText('Ten sam termin jest na liście dwa razy.').first()).toBeVisible();
  await form.getByLabel('Data propozycji 2').fill('2026-11-30');
  await check(page);
  await form.getByRole('button', { name: 'Zapisz' }).click();
  await expect(form).toHaveCount(0);
  expect(mock.meetingSaves.at(-1)?.date_options).toEqual([
    { date: '2026-11-29', time: '17:30' },
    { date: '2026-11-30', time: '17:30' },
  ]);
  // Pozostała propozycja zachowuje głosy, usunięta traci swoje.
  await expect(options(page)).toHaveCount(2);
  await expect(options(page).nth(0)).toContainText('2 głosy');
  await expect(options(page).nth(1)).toContainText('Brak głosów');
});

test('formularz: admin włącza głosowanie na termin', async ({ page }) => {
  const mock = await openApp(page, `/?p=meeting/${MEETING.id}&p=meeting/${MEETING.id}/edit`, {
    meetings: [{ ...MEETING, date_voting_open: false }],
    dateOptions: [],
    dateVotes: [],
  });
  const form = page.getByRole('dialog', { name: 'Edytuj spotkanie' });
  await expect(form.getByRole('button', { name: 'Dodaj propozycję terminu' })).toHaveCount(0);
  await form.getByText('Głosowanie na termin', { exact: true }).last().click();
  await expect(form.getByRole('button', { name: 'Dodaj propozycję terminu' })).toBeVisible();
  await form.getByRole('button', { name: 'Zapisz' }).click();
  await expect(form).toHaveCount(0);
  expect(mock.meetingSaves.at(-1)).toMatchObject({ date_voting: true });
  expect(mock.meetingSaves.at(-1)).not.toHaveProperty('date_options');
  await expect(dialog(page).getByRole('form', { name: 'Zaproponuj termin' })).toBeVisible();
});

test('formularz bez zmian propozycji nie wysyła listy', async ({ page }) => {
  const mock = await openApp(page, `/?p=meeting/${MEETING.id}/edit`);
  const form = page.getByRole('dialog', { name: 'Edytuj spotkanie' });
  await form.getByLabel('Tytuł').fill('Sobotnie granie');
  await form.getByRole('button', { name: 'Zapisz' }).click();
  await expect(form).toHaveCount(0);
  expect(mock.meetingSaves.at(-1)).not.toHaveProperty('date_options');
  expect(mock.meetingSaves.at(-1)).not.toHaveProperty('date_voting');
});
