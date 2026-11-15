import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  ADA,
  member,
  mockMeeting,
  mockSupabase,
  session,
  storeSession,
  type MockOptions,
} from './support/supabaseMock';

/**
 * Planowanie spotkań (PRD PLAN-1…PLAN-5, MTG-1, NFR-10; DS §15): widżet, formularz admina
 * z uczestnikami i prowadzącym, edycja zaplanowanego i trwającego, usuwanie. API Supabase jest
 * atrapą; reguły statusów sprawdzają testy SQL (130_meetings). Każdy test przechodzi na
 * 360 px i na desktopie, w motywie jasnym i ciemnym.
 */

const CLUB = { name: 'Planszówki', logo_path: null, timezone: 'Europe/Warsaw' };
const BEA = member(2, 'Bea', 'Bobrowska');
const CEZARY = member(3, 'Cezary', 'Cichy');
const ZOJA = member(9, 'Zoja', 'Zawada', true);
const MEMBERS = [BEA, CEZARY, ZOJA];

async function openApp(page: Page, options: MockOptions, path = '/') {
  const mock = await mockSupabase(page, { club: CLUB, members: MEMBERS, ...options });
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

async function settled(page: Page) {
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => animation.playState !== 'running'),
  );
}

const search = (page: Page) => page.evaluate(() => decodeURIComponent(window.location.search));

async function pickTime(page: Page, time: string) {
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /^Godzina/ })
    .click();
  await page.getByRole('option', { name: time, exact: true }).click();
}

test('admin planuje spotkanie z pustego widżetu; widżet pokazuje je w strefie klubu', async ({
  page,
}) => {
  const mock = await openApp(page, { meetings: [] });
  const widget = page.getByRole('region', { name: 'Spotkanie', exact: true });
  await expect(widget.getByText('Nie ma zaplanowanych spotkań')).toBeVisible();
  await widget.getByRole('button', { name: 'Zaplanuj spotkanie' }).click();

  const dialog = page.getByRole('dialog', { name: 'Zaplanuj spotkanie' });
  await expect(dialog).toBeVisible();
  expect(await search(page)).toBe('?p=meetings/new');
  // Admin jest domyślnie uczestnikiem; usunięta Zoja nie jest na liście (MEM-6).
  await expect(dialog.getByText('Wybrano 1 z 3')).toBeVisible();
  await expect(dialog.getByRole('checkbox', { name: /Ada/ })).toBeChecked();
  await expect(dialog.getByText('Zoja Zawada')).toHaveCount(0);
  await expect(dialog.getByText('Strefa czasowa klubu: Europe/Warsaw.')).toBeVisible();

  // Puste pola i termin w przeszłości.
  await dialog.getByLabel('Data').fill('2020-01-04');
  await dialog.getByRole('button', { name: 'Zaplanuj', exact: true }).click();
  await expect(dialog.getByText('Popraw zaznaczone pola.')).toBeVisible();
  await expect(dialog.getByText('Wpisz tytuł spotkania.')).toBeVisible();
  await expect(dialog.getByText('Ten termin już minął. Wybierz późniejszy.')).toBeVisible();
  expect(mock.meetingSaves).toEqual([]);

  await dialog.getByLabel('Tytuł').fill('  Sobotnie granie ');
  await dialog.getByLabel('Data').fill('2030-11-30');
  await pickTime(page, '19:30');
  await dialog.getByRole('button', { name: 'Zaznacz wszystkich' }).click();
  await expect(dialog.getByText('Wybrano 3 z 3')).toBeVisible();
  // Prowadzący spośród uczestników innych niż admin (PLAN-1).
  await dialog.getByRole('button', { name: /^Prowadzący/ }).click();
  await expect(page.getByRole('option')).toHaveText([
    'Ada Adminowska (administrator)',
    'Bea Bobrowska',
    'Cezary Cichy',
  ]);
  await page.getByRole('option', { name: 'Bea Bobrowska' }).click();
  expect(await horizontalOverflow(page)).toBe(0);
  await settled(page);
  expect(await axe(page)).toEqual([]);

  await dialog.getByRole('button', { name: 'Zaplanuj', exact: true }).click();
  await expect(page.getByText('Spotkanie zaplanowane. Głosowanie otwarte.')).toBeVisible();
  await expect(dialog).toBeHidden();
  expect(mock.meetingSaves).toHaveLength(1);
  expect(mock.meetingSaves[0]).toMatchObject({
    title: 'Sobotnie granie',
    local_date: '2030-11-30',
    local_time: '19:30',
    host_id: BEA.id,
    is_new: true,
  });
  expect([...(mock.meetingSaves[0]?.participant_ids ?? [])].sort()).toEqual(
    [ADA.id, BEA.id, CEZARY.id].sort(),
  );

  // MTG-1: tytuł, data w strefie klubu, uczestnicy, prowadzący i stan głosowania.
  await expect(widget.getByRole('heading', { name: 'Sobotnie granie' })).toBeVisible();
  await expect(widget.getByText('sobota, 30 lis 2030 · 19:30')).toBeVisible();
  await expect(widget.getByText('3 uczestników · prowadzi Bea')).toBeVisible();
  await expect(widget.getByText('Głosowanie otwarte')).toBeVisible();
  expect(await horizontalOverflow(page)).toBe(0);
  expect(await axe(page)).toEqual([]);
});

test('edycja zaplanowanego: wszystkie pola; odznaczony prowadzący oddaje prowadzenie', async ({
  page,
}) => {
  const planned = mockMeeting(1, 'Listopadowe granie', {
    voting_open: false,
    participants: [ADA.id, BEA.id, CEZARY.id],
    host_id: BEA.id,
  });
  const mock = await openApp(page, { meetings: [planned] });
  const widget = page.getByRole('region', { name: 'Spotkanie', exact: true });
  await expect(widget.getByText('Gry wybrane')).toBeVisible();
  await widget.getByRole('button', { name: 'Akcje spotkania Listopadowe granie' }).click();
  await page.getByRole('menuitem', { name: 'Edytuj spotkanie' }).click();

  const dialog = page.getByRole('dialog', { name: 'Edytuj spotkanie' });
  expect(await search(page)).toBe(`?p=meeting/${planned.id}/edit`);
  // 17:00 UTC w listopadzie = 18:00 w Warszawie (NFR-10).
  await expect(dialog.getByLabel('Tytuł')).toHaveValue('Listopadowe granie');
  await expect(dialog.getByLabel('Data')).toHaveValue('2026-11-28');
  await expect(dialog.getByRole('button', { name: /^Godzina/ })).toContainText('18:00');
  await expect(dialog.getByRole('button', { name: /^Prowadzący/ })).toContainText('Bea Bobrowska');

  // Natywny checkbox jest pod stylizowanym polem: klikamy wiersz (etykietę).
  await dialog.getByRole('list', { name: 'Uczestnicy' }).getByText('Bea Bobrowska').click();
  await expect(dialog.getByRole('checkbox', { name: /Bea/ })).not.toBeChecked();
  await expect(dialog.getByRole('button', { name: /^Prowadzący/ })).toContainText(
    'Ada Adminowska (administrator)',
  );
  await dialog.getByLabel('Tytuł').fill('Grudniowe granie');
  await dialog.getByLabel('Data').fill('2026-12-05');
  await dialog.getByRole('button', { name: 'Zapisz' }).click();
  await expect(page.getByText('Zapisano zmiany w spotkaniu Grudniowe granie')).toBeVisible();
  expect(mock.meetingSaves.at(-1)).toMatchObject({
    meeting_id: planned.id,
    title: 'Grudniowe granie',
    local_date: '2026-12-05',
    local_time: '18:00',
    participant_ids: [ADA.id, CEZARY.id],
    host_id: null,
    is_new: false,
  });
  await expect(widget.getByText('sobota, 5 gru 2026 · 18:00')).toBeVisible();
  await expect(widget.getByText('2 uczestników', { exact: true })).toBeVisible();
});

test('w trakcie: tytuł i termin zablokowane, uczestnik z partią zostaje (PLAN-4)', async ({
  page,
}) => {
  const running = mockMeeting(2, 'Trwające granie', {
    status: 'in_progress',
    voting_open: false,
    started_at: '2026-11-28T17:05:00Z',
    participants: [ADA.id, BEA.id],
  });
  const mock = await openApp(
    page,
    {
      meetings: [running, mockMeeting(3, 'Następne')],
      playResults: [{ meeting_id: running.id, profile_id: BEA.id }],
    },
    `/?p=meeting/${running.id}/edit`,
  );
  const widget = page.getByRole('region', { name: 'Spotkanie', exact: true });
  await expect(widget.getByRole('heading', { name: 'Trwające granie' })).toBeVisible();
  await expect(widget.getByText('Trwa', { exact: true })).toBeVisible();

  const dialog = page.getByRole('dialog', { name: 'Edytuj spotkanie' });
  await expect(dialog.getByText(/Spotkanie trwa: możesz dopisać uczestnika/)).toBeVisible();
  await expect(dialog.getByLabel('Tytuł')).toBeDisabled();
  await expect(dialog.getByLabel('Data')).toBeDisabled();
  await expect(dialog.getByRole('checkbox', { name: /Bea/ })).toBeDisabled();
  await expect(dialog.getByRole('checkbox', { name: 'Bea Bobrowska Ma partię' })).toBeVisible();
  // „Odznacz wszystkich” zostawia gracza z partią.
  await dialog.getByRole('button', { name: 'Zaznacz wszystkich' }).click();
  await dialog.getByRole('button', { name: 'Odznacz wszystkich' }).click();
  await expect(dialog.getByRole('checkbox', { name: /Bea/ })).toBeChecked();
  await dialog.getByRole('list', { name: 'Uczestnicy' }).getByText('Cezary Cichy').click();
  await dialog.getByRole('button', { name: /^Prowadzący/ }).click();
  await page.getByRole('option', { name: 'Cezary Cichy' }).click();
  await settled(page);
  expect(await axe(page)).toEqual([]);

  await dialog.getByRole('button', { name: 'Zapisz' }).click();
  await expect(page.getByText('Zapisano zmiany w spotkaniu Trwające granie')).toBeVisible();
  // Termin bez zmian nie jest wysyłany (baza go nie przelicza, NFR-10).
  expect(mock.meetingSaves.at(-1)).toMatchObject({
    title: 'Trwające granie',
    local_date: null,
    local_time: null,
    participant_ids: [BEA.id, CEZARY.id],
    host_id: CEZARY.id,
    is_new: false,
  });

  // Menu trwającego spotkania nie ma usuwania (PLAN-3), a kolejne spotkanie da się zaplanować.
  // Edycja w trakcie to dopisanie uczestnika i zmiana prowadzącego (PLAN-4, DS §15).
  await widget.getByRole('button', { name: 'Akcje spotkania Trwające granie' }).click();
  await expect(page.getByRole('menuitem')).toHaveText([
    'Zaplanuj kolejne spotkanie',
    'Dodaj uczestnika',
    'Zmień prowadzącego',
  ]);
  await page.getByRole('menuitem', { name: 'Zaplanuj kolejne spotkanie' }).click();
  await expect(page.getByRole('dialog', { name: 'Zaplanuj spotkanie' })).toBeVisible();
  expect(await search(page)).toBe('?p=meetings/new');
});

test('błąd reguły z bazy pokazuje polski komunikat i zostawia formularz', async ({ page }) => {
  const planned = mockMeeting(4, 'Wiosenne granie', { starts_at: '2027-03-27T17:00:00Z' });
  await openApp(
    page,
    {
      meetings: [planned],
      saveMeetingError: {
        code: '23514',
        hint: 'meetings_local_time_exists',
        message: 'local time does not exist',
      },
    },
    `/?p=meeting/${planned.id}/edit`,
  );
  const dialog = page.getByRole('dialog', { name: 'Edytuj spotkanie' });
  await dialog.getByLabel('Data').fill('2027-03-28');
  await pickTime(page, '02:30');
  await dialog.getByRole('button', { name: 'Zapisz' }).click();
  await expect(
    dialog.getByText(
      'Tej godziny nie ma w tym dniu w strefie klubu (zmiana czasu). Wybierz inną godzinę.',
    ),
  ).toBeVisible();
  await expect(dialog).toBeVisible();
});

test('admin usuwa zaplanowane spotkanie z potwierdzeniem (PLAN-3)', async ({ page }) => {
  const planned = mockMeeting(5, 'Do odwołania');
  const mock = await openApp(page, { meetings: [planned] });
  const widget = page.getByRole('region', { name: 'Spotkanie', exact: true });
  await widget.getByRole('button', { name: 'Akcje spotkania Do odwołania' }).click();
  await page.getByRole('menuitem', { name: 'Usuń spotkanie' }).click();

  const dialog = page.getByRole('dialog', { name: 'Usunąć spotkanie?' });
  await expect(dialog.getByText(/„Do odwołania” zniknie z kalendarza/)).toBeVisible();
  expect(await search(page)).toBe(`?p=meeting/${planned.id}/delete`);
  await settled(page);
  expect(await axe(page)).toEqual([]);
  await dialog.getByRole('button', { name: 'Usuń' }).click();
  await expect(page.getByText('Usunięto spotkanie Do odwołania')).toBeVisible();
  expect(mock.meetingDeletes).toEqual([planned.id]);
  await expect(widget.getByText('Nie ma zaplanowanych spotkań')).toBeVisible();
});

test('gracz widzi spotkanie bez akcji i nie otworzy formularzy z linku', async ({ page }) => {
  const planned = mockMeeting(6, 'Klubowe granie', { participants: [ADA.id, BEA.id] });
  await openApp(page, { meetings: [], profile: { ...ADA, role: 'player' } });
  const widget = page.getByRole('region', { name: 'Spotkanie', exact: true });
  await expect(widget.getByText('Nie ma zaplanowanych spotkań')).toBeVisible();
  await expect(widget.getByRole('button', { name: 'Zaplanuj spotkanie' })).toHaveCount(0);

  for (const path of [
    'meetings/new',
    `meeting/${planned.id}/edit`,
    `meeting/${planned.id}/delete`,
  ]) {
    await page.goto(`/?p=${path}`);
    await expect(page.getByRole('dialog', { name: 'Nie znaleziono' })).toBeVisible();
  }
});

test('gracz widzi najbliższe spotkanie bez menu admina (MTG-1)', async ({ page }) => {
  await openApp(page, {
    meetings: [
      mockMeeting(8, 'Późniejsze', { starts_at: '2026-12-12T17:00:00Z' }),
      mockMeeting(7, 'Najbliższe', { participants: [ADA.id, BEA.id] }),
    ],
    profile: { ...ADA, role: 'player' },
  });
  const widget = page.getByRole('region', { name: 'Spotkanie', exact: true });
  await expect(widget.getByRole('heading', { name: 'Najbliższe' })).toBeVisible();
  await expect(widget.getByRole('button', { name: /Akcje spotkania/ })).toHaveCount(0);
  expect(await horizontalOverflow(page)).toBe(0);
  expect(await axe(page)).toEqual([]);
});
