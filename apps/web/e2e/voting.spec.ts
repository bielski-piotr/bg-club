import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  ADA,
  member,
  mockGame,
  mockMeeting,
  mockSupabase,
  session,
  storeSession,
  type MockOptions,
} from './support/supabaseMock';

/**
 * Głosowanie, publikacja gier i ponowne otwarcie (PRD VOTE-1…VOTE-6, DS §15): popup
 * spotkania z listą głosowania, przełącznik głosu uczestnika, „Opublikuj gry” i „Otwórz
 * głosowanie ponownie” administratora. API Supabase jest atrapą; reguły (duplikaty, głos po
 * zamknięciu, usunięte gry i uczestnicy) sprawdzają testy SQL (140_voting). Każdy test
 * przechodzi na 360 px i na desktopie, w motywie jasnym i ciemnym.
 */

const CLUB = { name: 'Planszówki', logo_path: null, timezone: 'Europe/Warsaw' };
const BEA = member(2, 'Bea', 'Bobrowska');
const CEZARY = member(3, 'Cezary', 'Cichy');
const MEMBERS = [BEA, CEZARY];

const AZUL = mockGame(1, 'Azul');
const ZOLWIE = mockGame(2, 'Żółwie Wyścigi');
const PASJANS = mockGame(3, 'Pasjans Klubowy', { min_players: 1, max_players: 1 });
const BRZDEK = mockGame(4, 'Brzdęk');
const GAMES = [AZUL, ZOLWIE, PASJANS, BRZDEK];

const MEETING = mockMeeting(5, 'Sobotnie granie', { participants: [ADA.id, BEA.id, CEZARY.id] });

async function openApp(page: Page, options: MockOptions, path = '/') {
  const mock = await mockSupabase(page, {
    club: CLUB,
    members: MEMBERS,
    games: GAMES.map((g) => ({ ...g })),
    meetings: [{ ...MEETING }],
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

async function settled(page: Page) {
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => animation.playState !== 'running'),
  );
}

const search = (page: Page) => page.evaluate(() => decodeURIComponent(window.location.search));

const voteNames = (page: Page) =>
  page
    .getByRole('dialog', { name: 'Sobotnie granie' })
    .getByRole('list', { name: 'Gry do głosowania' })
    .locator('.vote-row__name')
    .allTextContents();

test('uczestnik głosuje i cofa głos; lista jest jawna, sortowana i ma wyszukiwarkę', async ({
  page,
}) => {
  const mock = await openApp(page, {
    profile: { ...ADA, role: 'player' },
    votes: [
      { meeting_id: MEETING.id, game_id: ZOLWIE.id, profile_id: BEA.id },
      { meeting_id: MEETING.id, game_id: ZOLWIE.id, profile_id: CEZARY.id },
      { meeting_id: MEETING.id, game_id: BRZDEK.id, profile_id: CEZARY.id },
    ],
  });
  const widget = page.getByRole('region', { name: 'Spotkanie', exact: true });
  await widget.getByRole('button', { name: 'Sobotnie granie', exact: true }).click();

  const dialog = page.getByRole('dialog', { name: 'Sobotnie granie' });
  await expect(dialog).toBeVisible();
  expect(await search(page)).toBe(`?p=meeting/${MEETING.id}`);
  await expect(dialog.getByText('Głosowanie otwarte')).toBeVisible();
  await expect(dialog.getByText('Twoje głosy: 0')).toBeVisible();
  // Gracz nie ma akcji administratora.
  await expect(dialog.getByRole('button', { name: 'Opublikuj gry' })).toHaveCount(0);

  // Malejąco po głosach, potem alfabetycznie (VOTE-3).
  expect(await voteNames(page)).toEqual(['Żółwie Wyścigi', 'Brzdęk', 'Azul', 'Pasjans Klubowy']);
  const zolwie = dialog.getByRole('listitem').filter({ hasText: 'Żółwie Wyścigi' });
  await expect(zolwie.getByText('2 głosy')).toBeVisible();
  await expect(zolwie.getByRole('img', { name: 'Bea Bobrowska, Cezary Cichy' })).toBeVisible();
  // Gra dla 1 gracza nie pasuje do 3 uczestników, ale przyjmuje głosy (VOTE-4).
  const pasjans = dialog.getByRole('listitem').filter({ hasText: 'Pasjans Klubowy' });
  await expect(pasjans.getByText('Dla 1 gracza')).toBeVisible();
  await expect(pasjans.getByText('Brak głosów')).toBeVisible();

  await settled(page);
  expect(await horizontalOverflow(page)).toBe(0);
  expect(await axe(page)).toEqual([]);

  await pasjans.getByRole('button', { name: 'Zagłosuj na Pasjans Klubowy' }).click();
  await expect(page.getByText('Głos zapisany')).toBeVisible();
  await expect(
    pasjans.getByRole('button', { name: 'Cofnij głos na Pasjans Klubowy' }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(pasjans.getByText('1 głos')).toBeVisible();
  await expect(dialog.getByText('Twoje głosy: 1')).toBeVisible();
  // Drugi głos na inną grę (bez limitu, VOTE-2).
  await zolwie.getByRole('button', { name: 'Zagłosuj na Żółwie Wyścigi' }).click();
  await expect(zolwie.getByText('3 głosy')).toBeVisible();
  await expect(dialog.getByText('Twoje głosy: 2')).toBeVisible();
  expect(mock.options.votes?.filter((v) => v.profile_id === ADA.id)).toHaveLength(2);

  await pasjans.getByRole('button', { name: 'Cofnij głos na Pasjans Klubowy' }).click();
  await expect(page.getByText('Głos cofnięty')).toBeVisible();
  await expect(pasjans.getByText('Brak głosów')).toBeVisible();
  await expect(dialog.getByText('Twoje głosy: 1')).toBeVisible();

  // Wyszukiwarka bez polskich znaków.
  await dialog.getByRole('searchbox', { name: 'Szukaj gry' }).fill('zolw');
  expect(await voteNames(page)).toEqual(['Żółwie Wyścigi']);
  await dialog.getByRole('searchbox', { name: 'Szukaj gry' }).fill('xyz');
  await expect(dialog.getByText('Brak gier pasujących do „xyz”')).toBeVisible();
});

test('głos po zamknięciu w innej karcie: komunikat i odświeżony widok „Gramy w”', async ({
  page,
}) => {
  const mock = await openApp(
    page,
    { profile: { ...ADA, role: 'player' } },
    `/?p=meeting/${MEETING.id}`,
  );
  const dialog = page.getByRole('dialog', { name: 'Sobotnie granie' });
  await expect(dialog.getByRole('button', { name: 'Zagłosuj na Azul' })).toBeVisible();

  // Administrator publikuje gry w międzyczasie.
  mock.options.meetings = [{ ...MEETING, voting_open: false }];
  mock.options.meetingGames = [{ meeting_id: MEETING.id, game_id: BRZDEK.id }];
  await dialog.getByRole('button', { name: 'Zagłosuj na Azul' }).click();
  await expect(page.getByText('Głosowanie jest już zamknięte.')).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Gramy w' })).toBeVisible();
  await expect(
    dialog.getByRole('list', { name: 'Opublikowane gry' }).getByText('Brzdęk'),
  ).toBeVisible();
  await expect(dialog.getByRole('button', { name: /Zagłosuj/ })).toHaveCount(0);
  expect(mock.options.votes ?? []).toEqual([]);
});

test('admin publikuje dowolne gry, potem otwiera głosowanie ponownie (VOTE-5, VOTE-6)', async ({
  page,
}) => {
  const mock = await openApp(
    page,
    {
      votes: [
        { meeting_id: MEETING.id, game_id: ZOLWIE.id, profile_id: BEA.id },
        { meeting_id: MEETING.id, game_id: ZOLWIE.id, profile_id: CEZARY.id },
        { meeting_id: MEETING.id, game_id: AZUL.id, profile_id: BEA.id },
      ],
    },
    `/?p=meeting/${MEETING.id}`,
  );
  const dialog = page.getByRole('dialog', { name: 'Sobotnie granie' });
  await dialog.getByRole('button', { name: 'Opublikuj gry' }).click();

  const publish = page.getByRole('dialog', { name: 'Opublikuj gry' });
  await expect(publish).toBeVisible();
  expect(await search(page)).toBe(`?p=meeting/${MEETING.id}&p=meeting/${MEETING.id}/publish`);
  await expect(publish.getByText('Nie wybrano gier')).toBeVisible();
  await expect(publish.getByRole('button', { name: 'Opublikuj', exact: true })).toBeDisabled();
  await settled(page);
  expect(await horizontalOverflow(page)).toBe(0);
  expect(await axe(page)).toEqual([]);

  // Nie musi to być gra z największą liczbą głosów ani gra z głosami.
  // Natywny checkbox jest pod stylizowanym polem: klikamy wiersz (etykietę).
  await publish.getByRole('listitem').filter({ hasText: 'Brzdęk' }).click();
  await publish.getByRole('listitem').filter({ hasText: 'Azul' }).click();
  await expect(publish.getByRole('checkbox', { name: /Azul/ })).toBeChecked();
  await expect(publish.getByText('Wybrano 2 gry')).toBeVisible();
  await publish.getByRole('button', { name: 'Opublikuj', exact: true }).click();

  await expect(page.getByText('Gry opublikowane. Głosowanie zamknięte.')).toBeVisible();
  await expect(publish).toHaveCount(0);
  // Kolejność jak na liście głosowania: najpierw więcej głosów.
  expect(mock.publishes).toEqual([{ meeting_id: MEETING.id, game_ids: [AZUL.id, BRZDEK.id] }]);
  await expect(dialog.getByText('Gry wybrane')).toBeVisible();
  const playing = dialog.getByRole('list', { name: 'Opublikowane gry' });
  await expect(playing.locator('.vote-row__name')).toHaveText(['Azul', 'Brzdęk']);
  await expect(
    playing.getByRole('listitem').filter({ hasText: 'Azul' }).getByText('1 głos'),
  ).toBeVisible();
  await expect(dialog.getByRole('list', { name: 'Gry do głosowania' })).toHaveCount(0);

  await settled(page);
  expect(await horizontalOverflow(page)).toBe(0);
  expect(await axe(page)).toEqual([]);

  await dialog.getByRole('button', { name: 'Otwórz głosowanie ponownie' }).click();
  await expect(page.getByText('Głosowanie otwarte ponownie')).toBeVisible();
  expect(mock.reopens).toEqual([MEETING.id]);
  await expect(dialog.getByText('Głosowanie otwarte', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('list', { name: 'Gry do głosowania' })).toBeVisible();
  // Głosy zostały.
  expect(await voteNames(page)).toEqual(['Żółwie Wyścigi', 'Azul', 'Brzdęk', 'Pasjans Klubowy']);
});

test('admin otwiera głosowanie ponownie z menu widżetu', async ({ page }) => {
  const mock = await openApp(page, {
    meetings: [{ ...MEETING, voting_open: false }],
    meetingGames: [{ meeting_id: MEETING.id, game_id: AZUL.id }],
  });
  const widget = page.getByRole('region', { name: 'Spotkanie', exact: true });
  await expect(widget.getByText('Gry wybrane')).toBeVisible();
  await widget.getByRole('button', { name: /Akcje spotkania/ }).click();
  await page.getByRole('menuitem', { name: 'Otwórz głosowanie ponownie' }).click();
  await expect(page.getByText('Głosowanie otwarte ponownie')).toBeVisible();
  await expect(widget.getByText('Głosowanie otwarte')).toBeVisible();
  expect(mock.reopens).toEqual([MEETING.id]);
});

test('gracz spoza spotkania widzi głosy bez przełącznika i nie opublikuje gier z linku', async ({
  page,
}) => {
  await openApp(
    page,
    {
      profile: { ...ADA, role: 'player' },
      meetings: [{ ...MEETING, participants: [BEA.id, CEZARY.id] }],
      votes: [{ meeting_id: MEETING.id, game_id: AZUL.id, profile_id: BEA.id }],
    },
    `/?p=meeting/${MEETING.id}`,
  );
  const dialog = page.getByRole('dialog', { name: 'Sobotnie granie' });
  await expect(
    dialog.getByText('Głosują tylko uczestnicy spotkania.', { exact: false }),
  ).toBeVisible();
  await expect(
    dialog.getByRole('listitem').filter({ hasText: 'Azul' }).getByText('1 głos'),
  ).toBeVisible();
  await expect(dialog.getByRole('button', { name: /Zagłosuj|Cofnij głos/ })).toHaveCount(0);
  await expect(dialog.getByText(/Twoje głosy/)).toHaveCount(0);

  await page.goto(`/?p=meeting/${MEETING.id}/publish`);
  await expect(page.getByRole('dialog', { name: 'Nie znaleziono' })).toBeVisible();
});
