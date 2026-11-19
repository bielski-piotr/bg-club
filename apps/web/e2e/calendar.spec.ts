import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  ADA,
  member,
  mockMeeting,
  mockSupabase,
  session,
  storeSession,
  type MockMeeting,
  type MockOptions,
  type MockPlay,
} from './support/supabaseMock';

/**
 * Timeline i kalendarz. „Dziś” to czwartek
 * 12 listopada 2026 w strefie klubu (zegar przeglądarki jest ustawiony). Każdy test przechodzi
 * na 360 px (kompaktowa siatka i agenda) i na desktopie (siatka z chipami), w obu motywach.
 */

const CLUB = { name: 'Planszówki', logo_path: null, timezone: 'Europe/Warsaw' };
const BEA = member(2, 'Bea', 'Bobrowska');
const CEZARY = member(3, 'Cezary', 'Cichy');
const ZOJA = member(9, 'Zoja', 'Zawada', true);
const ALL = [ADA.id, BEA.id, CEZARY.id];

const NOW = new Date('2026-11-12T10:00:00+01:00');

const LIVE = mockMeeting(1, 'Dzisiejsze granie', {
  starts_at: '2026-11-12T08:00:00Z',
  status: 'in_progress',
  voting_open: false,
  started_at: '2026-11-12T08:05:00Z',
  participants: [ADA.id, BEA.id],
});
const SATURDAY = mockMeeting(2, 'Sobotnie granie', {
  starts_at: '2026-11-14T17:00:00Z',
  participants: ALL,
  host_id: BEA.id,
});
const AZUL = mockMeeting(3, 'Turniej Azul', { starts_at: '2026-11-28T17:00:00Z' });
const EVENING = mockMeeting(4, 'Wieczorna partia', {
  starts_at: '2026-11-28T20:00:00Z',
  voting_open: false,
});
const DECEMBER = mockMeeting(5, 'Grudniowe granie', { starts_at: '2026-12-19T17:00:00Z' });
const finished = (n: number, title: string, starts_at: string, participants = ALL) =>
  mockMeeting(n, title, {
    starts_at,
    status: 'finished',
    voting_open: false,
    started_at: starts_at,
    finished_at: starts_at,
    participants,
  });
const PLAYED = finished(6, 'Wieczór gier', '2026-11-08T17:00:00Z', [...ALL, ZOJA.id]);
const WEDNESDAY = finished(7, 'Środowe granie', '2026-11-04T17:00:00Z');
const OCTOBER_1 = finished(8, 'Halloweenowe granie', '2026-10-31T17:00:00Z');
const OCTOBER_2 = finished(10, 'Październikowe granie', '2026-10-24T16:00:00Z');
const OCTOBER_3 = finished(11, 'Najstarsze granie', '2026-10-17T16:00:00Z');

const MEETINGS: MockMeeting[] = [
  LIVE,
  SATURDAY,
  AZUL,
  EVENING,
  DECEMBER,
  PLAYED,
  WEDNESDAY,
  OCTOBER_1,
  OCTOBER_2,
  OCTOBER_3,
];

const play = (
  n: number,
  meeting: MockMeeting,
  saved_at: string | null,
  winners: string[],
): MockPlay => ({
  id: `00000000-0000-4000-d000-${n.toString(16).padStart(12, '0')}`,
  meeting_id: meeting.id,
  status: saved_at ? 'saved' : 'draft',
  saved_at,
  play_results: meeting.participants.map((profile_id) => ({
    profile_id,
    is_win: saved_at ? winners.includes(profile_id) : null,
  })),
});

// Wieczór gier: Zoja (konto usunięte) wygrała 2 partie; Ada i Bea dzielą 1. miejsce w drugiej.
const PLAYS: MockPlay[] = [
  play(1, PLAYED, '2026-11-08T18:00:00Z', [ZOJA.id]),
  play(2, PLAYED, '2026-11-08T19:00:00Z', [BEA.id, ADA.id]),
  play(3, PLAYED, '2026-11-08T20:00:00Z', [ZOJA.id]),
  play(4, LIVE, null, []),
];

const isMobile = () => test.info().project.name.startsWith('mobile');

async function openApp(page: Page, options: MockOptions = {}, path = '/') {
  await page.clock.setFixedTime(NOW);
  const mock = await mockSupabase(page, {
    club: CLUB,
    members: [BEA, CEZARY, ZOJA],
    meetings: MEETINGS.map((meeting) => ({ ...meeting })),
    plays: PLAYS,
    ...options,
  });
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

test('timeline: 2 nadchodzące od dalszego, divider „Dziś” i 4 ostatnie zakończone', async ({
  page,
}) => {
  await openApp(page);
  const widget = page.getByRole('region', { name: 'Timeline', exact: true });
  const list = widget.getByRole('list', { name: 'Nadchodzące i odbyte spotkania' });
  await expect(list.getByRole('link')).toHaveCount(6);
  await expect(list.getByRole('link').first()).toContainText('Sobotnie granie');
  const items = list.locator(':scope > li');
  await expect(items).toHaveCount(7);
  const texts = await items.evaluateAll((nodes) =>
    nodes.map(
      (node) =>
        (node.querySelector('.timeline__title, .timeline__divider-label') as HTMLElement).innerText,
    ),
  );
  expect(texts).toEqual([
    'Sobotnie granie',
    'Dzisiejsze granie',
    'Dziś · czwartek, 12 lis',
    'Wieczór gier',
    'Środowe granie',
    'Halloweenowe granie',
    'Październikowe granie',
  ]);

  // Daty w strefie klubu: 17:00 UTC = 18:00 w Warszawie.
  const saturday = list.getByRole('link', { name: /Sobotnie granie/ });
  await expect(saturday).toContainText('sobota, 18:00 · 3 uczestników');
  // Zakończone: uczestnicy, zapisane partie i zwycięzcy (usunięta Zoja zostaje w historii).
  const played = list.getByRole('link', { name: /Wieczór gier/ });
  await expect(played).toContainText('4 uczestników · 3 partie');
  await expect(played).toContainText('Zoja, Ada, Bea');
  await expect(list.getByRole('link', { name: /Środowe granie/ })).toContainText(
    '3 uczestników · 0 partii',
  );

  expect(await axe(page)).toEqual([]);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  // Wiersz otwiera popup spotkania.
  await played.click();
  const dialog = page.getByRole('dialog', { name: 'Wieczór gier' });
  await expect(dialog).toBeVisible();
  expect(await search(page)).toBe(`?p=meeting/${PLAYED.id}`);
  await expect(dialog.getByText('Zakończone', { exact: true })).toBeVisible();
  await expect(dialog.getByText('3 rozegrane')).toBeVisible();
  await expect(dialog.getByText('Zoja, Ada, Bea')).toBeVisible();
  // Partie w kolejności rozegrania, a usunięty członek zostaje w historii.
  await expect(
    dialog.getByRole('list', { name: 'Zapisane partie' }).getByRole('article'),
  ).toHaveCount(3);
  await expect(
    dialog.getByRole('list', { name: 'Uczestnicy spotkania' }).getByText('Zoja Zawada'),
  ).toBeVisible();
  // Zakończonego z partiami nie edytujemy ani nie usuwamy: brak menu.
  await expect(dialog.getByRole('button', { name: 'Akcje spotkania' })).toHaveCount(0);
  expect(await axe(page)).toEqual([]);
});

test('timeline bez spotkań ma pusty stan bez linku do kalendarza', async ({ page }) => {
  await openApp(page, { meetings: [], plays: [] });
  const widget = page.getByRole('region', { name: 'Timeline', exact: true });
  await expect(widget.getByText('Brak spotkań')).toBeVisible();
  await expect(widget.getByText('Zaplanowane i odbyte spotkania pojawią się tutaj.')).toBeVisible();
  await expect(widget.getByRole('link')).toHaveCount(0);
  await expect(widget.getByRole('button')).toHaveCount(0);
});

test('kalendarz: miesiące, Dziś, kilka spotkań jednego dnia i kolory statusów', async ({
  page,
}) => {
  await openApp(page);
  await page
    .getByRole('region', { name: 'Timeline', exact: true })
    .getByRole('link', { name: 'Zobacz więcej w kalendarzu' })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Kalendarz' });
  await expect(dialog).toBeVisible();
  expect(await search(page)).toBe('?p=calendar');
  await expect(dialog.getByRole('heading', { name: 'Listopad 2026' })).toBeVisible();

  if (isMobile()) {
    // Agenda miesiąca w kolejności dat, ze statusami.
    const agenda = dialog.getByRole('list', { name: 'Spotkania w tym miesiącu' });
    await expect(dialog.locator('.calendar__count:visible')).toHaveText('6 spotkań');
    await expect(agenda.getByRole('link')).toHaveText([
      /Środowe granie.*środa, 18:00 · 0 partii.*Zakończone/,
      /Wieczór gier.*niedziela, 18:00 · 3 partie.*Zakończone/,
      /Dzisiejsze granie.*czwartek, 09:00 · 2 uczestników.*W trakcie/,
      /Sobotnie granie.*sobota, 18:00 · 3 uczestników.*Głosowanie otwarte/,
      /Turniej Azul.*sobota, 18:00 · 1 uczestnik.*Głosowanie otwarte/,
      /Wieczorna partia.*sobota, 21:00 · 1 uczestnik.*Gry wybrane/,
    ]);
    // Dzień z dwoma spotkaniami przenosi do agendy, dzień z jednym otwiera spotkanie.
    await dialog
      .getByRole('button', { name: /28 listopada 2026: Turniej Azul, Wieczorna partia/ })
      .click();
    await expect(agenda.getByRole('link', { name: /Turniej Azul/ })).toBeFocused();
    await dialog.getByRole('link', { name: /14 listopada 2026: Sobotnie granie/ }).click();
  } else {
    await expect(dialog.locator('.calendar__count:visible')).toHaveText('6 spotkań');
    const grid = dialog.getByRole('group', { name: 'Spotkania w miesiącu Listopad 2026' });
    // Dwa spotkania 28 listopada: dwa chipy w jednym dniu, w kolejności godzin.
    const azul = grid.getByRole('link', { name: /Turniej Azul/ });
    const evening = grid.getByRole('link', { name: /Wieczorna partia/ });
    await expect(azul).toContainText('18:00');
    await expect(evening).toContainText('21:00');
    const azulBox = await azul.boundingBox();
    const eveningBox = await evening.boundingBox();
    expect(eveningBox?.y ?? 0).toBeGreaterThan(azulBox?.y ?? 0);
    expect(Math.abs((eveningBox?.x ?? 0) - (azulBox?.x ?? -10))).toBeLessThan(1);
    await expect(azul).toHaveClass(/calendar-chip--planned/);
    await expect(grid.getByRole('link', { name: /Dzisiejsze granie/ })).toHaveClass(
      /calendar-chip--in_progress/,
    );
    await expect(grid.getByRole('link', { name: /Wieczór gier/ })).toHaveClass(
      /calendar-chip--finished/,
    );
    await grid.getByRole('link', { name: /Sobotnie granie/ }).click();
  }
  const meeting = page.getByRole('dialog', { name: 'Sobotnie granie' });
  await expect(meeting).toBeVisible();
  expect(await search(page)).toBe(`?p=calendar&p=meeting/${SATURDAY.id}`);
  await expect(meeting.getByText('Głosowanie otwarte')).toBeVisible();
  await expect(meeting.getByText('sobota, 14 lis 2026 · 18:00')).toBeVisible();
  await expect(meeting.getByText('Prowadzi', { exact: true })).toBeVisible();
  await meeting.getByRole('button', { name: 'Akcje spotkania' }).click();
  await expect(page.getByRole('menuitem', { name: 'Edytuj spotkanie' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Usuń spotkanie' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();

  // Nawigacja miesięcy i „Dziś”.
  await dialog.getByRole('button', { name: 'Następny miesiąc' }).click();
  await expect(dialog.getByRole('heading', { name: 'Grudzień 2026' })).toBeVisible();
  await expect(dialog.locator('.calendar__count:visible')).toHaveText('1 spotkanie');
  await expect(dialog.getByRole('link', { name: /Grudniowe granie/ }).first()).toBeAttached();
  await dialog.getByRole('button', { name: 'Poprzedni miesiąc' }).click();
  await dialog.getByRole('button', { name: 'Poprzedni miesiąc' }).click();
  await expect(dialog.getByRole('heading', { name: 'Październik 2026' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Dziś', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: 'Listopad 2026' })).toBeVisible();

  expect(await axe(page)).toEqual([]);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
});

test('admin planuje z kalendarza: przycisk i pusty dzień z wypełnioną datą', async ({ page }) => {
  await openApp(page, {}, '/?p=calendar');
  const dialog = page.getByRole('dialog', { name: 'Kalendarz' });
  await expect(dialog.getByRole('heading', { name: 'Listopad 2026' })).toBeVisible();
  // Przeszłe dni i dni ze spotkaniem nie planują; dziś i później tak.
  await expect(
    dialog.getByRole('button', { name: /Zaplanuj spotkanie wtorek, 10 listopada/ }),
  ).toHaveCount(0);
  await expect(
    dialog.getByRole('button', { name: /Zaplanuj spotkanie sobota, 14 listopada/ }),
  ).toHaveCount(0);
  if (!isMobile()) {
    await expect(dialog.getByText('Kliknij pusty dzień, aby zaplanować spotkanie.')).toBeVisible();
  }

  await dialog
    .getByRole('button', { name: 'Zaplanuj spotkanie piątek, 20 listopada 2026' })
    .click();
  const form = page.getByRole('dialog', { name: 'Zaplanuj spotkanie' });
  await expect(form).toBeVisible();
  expect(await search(page)).toBe('?p=calendar&p=meetings/new/2026-11-20');
  await expect(form.getByLabel('Data')).toHaveValue('2026-11-20');
  await page.keyboard.press('Escape');

  await dialog.getByRole('button', { name: 'Zaplanuj spotkanie', exact: true }).click();
  await expect(form).toBeVisible();
  expect(await search(page)).toBe('?p=calendar&p=meetings/new');
});

test('gracz widzi kalendarz bez planowania', async ({ page }) => {
  await openApp(page, { profile: { ...ADA, role: 'player' } }, '/?p=calendar');
  const dialog = page.getByRole('dialog', { name: 'Kalendarz' });
  await expect(dialog.getByRole('heading', { name: 'Listopad 2026' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /Zaplanuj/ })).toHaveCount(0);
  await expect(dialog.getByText('Kliknij pusty dzień, aby zaplanować spotkanie.')).toHaveCount(0);
  await dialog
    .getByRole('link', { name: /Wieczór gier/ })
    .first()
    .click();
  const meeting = page.getByRole('dialog', { name: 'Wieczór gier' });
  await expect(meeting).toBeVisible();
  await expect(meeting.getByRole('button', { name: 'Akcje spotkania' })).toHaveCount(0);
  expect(await axe(page)).toEqual([]);
});

test('usunięcie spotkania z jego popupu zamyka też popup spotkania', async ({ page }) => {
  const mock = await openApp(page);
  await page
    .getByRole('region', { name: 'Timeline', exact: true })
    .getByRole('link', { name: /Środowe granie/ })
    .click();
  const meeting = page.getByRole('dialog', { name: 'Środowe granie' });
  await expect(meeting.getByText('Brak zapisanych partii.')).toBeVisible();
  await meeting.getByRole('button', { name: 'Akcje spotkania' }).click();
  await page.getByRole('menuitem', { name: 'Usuń spotkanie' }).click();
  const confirm = page.getByRole('dialog', { name: 'Usunąć spotkanie?' });
  await confirm.getByRole('button', { name: 'Usuń', exact: true }).click();
  await expect(confirm).toBeHidden();
  await expect(meeting).toBeHidden();
  await expect(page.getByText('Nie znaleziono spotkania')).toHaveCount(0);
  expect(await search(page)).toBe('');
  expect(mock.meetingDeletes).toEqual([WEDNESDAY.id]);
  await expect(
    page.getByRole('region', { name: 'Timeline', exact: true }).getByText('Środowe granie'),
  ).toHaveCount(0);
});
