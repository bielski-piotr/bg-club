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
  type MockPlay,
} from './support/supabaseMock';

/**
 * Widżet i przebieg spotkania (PRD MTG-1, VIEW-1…VIEW-3, RUN-1, RUN-4, DS §15): taca stanu
 * w widżecie, rozpoczęcie i zakończenie z potwierdzeniem, komunikaty błędów, lista partii
 * w toku blokujących koniec i akcje zależne od roli (prowadzący bez edycji uczestników).
 * API Supabase jest atrapą z regułami jak w bazie; same reguły sprawdzają testy SQL
 * (130_meetings). Każdy test przechodzi na 360 px i na desktopie, w motywie jasnym i ciemnym.
 */

const NOW = new Date('2026-11-12T12:00:00Z');
const CLUB = { name: 'Planszówki', logo_path: null, timezone: 'Europe/Warsaw' };
const BEA = member(2, 'Bea', 'Bobrowska');
const CEZARY = member(3, 'Cezary', 'Cichy');

const AZUL = mockGame(1, 'Azul');
const ZOLWIE = mockGame(2, 'Żółwie Wyścigi');
const BRZDEK = mockGame(3, 'Brzdęk');
const GAMES = [AZUL, ZOLWIE, BRZDEK];

const PLANNED = mockMeeting(5, 'Sobotnie granie', {
  participants: [ADA.id, BEA.id, CEZARY.id],
  host_id: BEA.id,
});
const RUNNING = mockMeeting(6, 'Czwartkowe granie', {
  status: 'in_progress',
  voting_open: false,
  starts_at: '2026-11-12T17:00:00Z',
  started_at: '2026-11-12T17:05:00Z',
  participants: [ADA.id, BEA.id, CEZARY.id],
  host_id: BEA.id,
});

const SAVED: MockPlay = {
  id: '00000000-0000-4000-d000-000000000001',
  meeting_id: RUNNING.id,
  status: 'saved',
  started_at: '2026-11-12T17:10:00Z',
  saved_at: '2026-11-12T18:10:00Z',
  game_id: ZOLWIE.id,
  play_results: [
    { profile_id: BEA.id, is_win: false, seat: 1, place: 2, points: 2, ranking_value: 41 },
    { profile_id: ADA.id, is_win: true, seat: 2, place: 1, points: 4, ranking_value: 57 },
    { profile_id: CEZARY.id, is_win: false, seat: 3, place: 3, points: 0, ranking_value: 12 },
  ],
};
const DRAFT: MockPlay = {
  id: '00000000-0000-4000-d000-000000000002',
  meeting_id: RUNNING.id,
  status: 'draft',
  started_at: '2026-11-12T19:55:00Z',
  saved_at: null,
  game_id: AZUL.id,
  play_results: [
    { profile_id: ADA.id, is_win: null },
    { profile_id: CEZARY.id, is_win: null },
  ],
};

async function openApp(page: Page, options: MockOptions, path = '/') {
  await page.clock.setFixedTime(NOW);
  const mock = await mockSupabase(page, {
    club: CLUB,
    members: [BEA, CEZARY],
    games: GAMES.map((g) => ({ ...g })),
    meetings: [{ ...PLANNED }],
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

const FINISHED = { ...RUNNING, status: 'finished' as const, finished_at: '2026-11-12T20:00:00Z' };

test('RUN-5: admin potwierdza otwarcie, anulowanie zachowuje historię, kolejne cykle działają', async ({
  page,
}) => {
  const mock = await openApp(
    page,
    { meetings: [{ ...FINISHED }], plays: [SAVED] },
    `/?p=meeting/${FINISHED.id}`,
  );
  const meeting = page.getByRole('dialog', { name: FINISHED.title });
  await expect(meeting.getByRole('list', { name: 'Zapisane partie' })).toContainText(
    'Żółwie Wyścigi',
  );
  await meeting.getByRole('button', { name: 'Akcje spotkania' }).click();
  await page.getByRole('menuitem', { name: 'Otwórz spotkanie ponownie' }).click();
  const confirm = page.getByRole('dialog', { name: 'Otworzyć spotkanie ponownie?' });
  await expect(
    confirm.getByText(/Dotychczasowe partie, wyniki i karteczki pozostaną/),
  ).toBeVisible();
  await settled(page);
  expect(await horizontalOverflow(page)).toBe(0);
  expect(await axe(page)).toEqual([]);
  await confirm.getByRole('button', { name: 'Anuluj' }).click();
  expect(mock.runs).toEqual([]);
  expect(mock.options.meetings?.[0]?.status).toBe('finished');

  for (let cycle = 0; cycle < 2; cycle++) {
    await meeting.getByRole('button', { name: 'Akcje spotkania' }).click();
    await page.getByRole('menuitem', { name: 'Otwórz spotkanie ponownie' }).click();
    await confirm.getByRole('button', { name: 'Otwórz ponownie', exact: true }).click();
    await expect(confirm).toHaveCount(0);
    await expect(meeting.getByText('Trwa', { exact: true })).toBeVisible();
    await expect(meeting.getByRole('button', { name: 'Nowa partia' })).toBeVisible();
    // Zapisana partia zostaje (karteczka z grą); wynik 57 widać w podsumowaniu partii.
    await expect(meeting.getByRole('list', { name: 'Zapisane partie' })).toContainText(
      'Żółwie Wyścigi',
    );
    await meeting.getByRole('button', { name: 'Zakończ spotkanie' }).click();
    await page
      .getByRole('dialog', { name: 'Zakończyć spotkanie?' })
      .getByRole('button', { name: 'Zakończ', exact: true })
      .click();
    await expect(meeting.getByText('Zakończone', { exact: true })).toBeVisible();
  }
  expect(mock.runs.map((run) => run.action)).toEqual(['reopen', 'finish', 'reopen', 'finish']);
  expect(mock.options.plays).toEqual([SAVED]);
});

for (const host of [false, true]) {
  test(`RUN-5: ${host ? 'prowadzący' : 'gracz'} nie ma akcji ani dostępu z deep linku`, async ({
    page,
  }) => {
    const mock = await openApp(
      page,
      {
        profile: { ...ADA, role: 'player' },
        meetings: [{ ...FINISHED, host_id: host ? ADA.id : BEA.id }],
        plays: [SAVED],
      },
      `/?p=meeting/${FINISHED.id}`,
    );
    await expect(page.getByRole('dialog', { name: FINISHED.title })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Akcje spotkania', exact: true })).toHaveCount(0);
    await page.goto(`/?p=meeting/${FINISHED.id}/reopen`);
    await expect(page.getByRole('button', { name: 'Otwórz ponownie', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Wróć do klubu' })).toBeVisible();
    expect(mock.runs).toEqual([]);
  });
}

test('RUN-5: deep link, konflikt z innym spotkaniem i zmieniony status', async ({ page }) => {
  const other = { ...RUNNING, id: PLANNED.id };
  const mock = await openApp(
    page,
    { meetings: [{ ...FINISHED }, other] },
    `/?p=meeting/${FINISHED.id}/reopen`,
  );
  const confirm = page.getByRole('dialog', { name: 'Otworzyć spotkanie ponownie?' });
  await confirm.getByRole('button', { name: 'Otwórz ponownie', exact: true }).click();
  await expect(confirm.getByText('Trwa już inne spotkanie. Najpierw je zakończ.')).toBeVisible();
  expect(mock.options.meetings?.[0]?.status).toBe('finished');
  await page.goto(`/?p=meeting/${other.id}/reopen`);
  await expect(
    confirm.getByText('Tylko zakończone spotkanie można otworzyć ponownie.'),
  ).toBeVisible();
  await expect(
    confirm.getByRole('button', { name: 'Otwórz ponownie', exact: true }),
  ).toBeDisabled();
  // Stary link do spotkania usuniętego w innej karcie.
  await page.goto('/?p=meeting/00000000-0000-4000-c000-000000000099/reopen');
  await expect(page.getByRole('button', { name: 'Wróć do klubu' })).toBeVisible();
  expect(mock.runs).toHaveLength(1);
});

test('widżet: odliczanie i najwięcej głosów; admin rozpoczyna spotkanie (MTG-1, RUN-1)', async ({
  page,
}) => {
  const mock = await openApp(page, {
    votes: [
      { meeting_id: PLANNED.id, game_id: ZOLWIE.id, profile_id: BEA.id },
      { meeting_id: PLANNED.id, game_id: ZOLWIE.id, profile_id: CEZARY.id },
      { meeting_id: PLANNED.id, game_id: AZUL.id, profile_id: ADA.id },
    ],
  });
  const widget = page.getByRole('region', { name: 'Spotkanie', exact: true });
  await expect(widget.getByText('za 16 dni')).toBeVisible();
  await expect(widget.getByText('Głosowanie otwarte')).toBeVisible();
  await expect(widget.getByText('Twoje głosy: 1')).toBeVisible();
  const top = widget.getByRole('list', { name: 'Gry z największą liczbą głosów' });
  await expect(top.getByRole('listitem')).toHaveCount(2);
  await expect(top.getByRole('listitem').first()).toContainText('Żółwie Wyścigi');
  await expect(top.getByRole('listitem').first().getByText('2 głosy')).toBeAttached();
  await settled(page);
  expect(await horizontalOverflow(page)).toBe(0);
  expect(await axe(page)).toEqual([]);

  await widget.getByRole('button', { name: 'Sobotnie granie', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Sobotnie granie' });
  await dialog.getByRole('button', { name: 'Rozpocznij spotkanie' }).click();

  const confirm = page.getByRole('dialog', { name: 'Rozpocząć spotkanie?' });
  await expect(confirm).toBeVisible();
  expect(await search(page)).toBe(`?p=meeting/${PLANNED.id}&p=meeting/${PLANNED.id}/start`);
  await expect(confirm.getByText(/Głosowanie jest otwarte. Rozpoczęcie je zamknie/)).toBeVisible();
  await settled(page);
  expect(await horizontalOverflow(page)).toBe(0);
  expect(await axe(page)).toEqual([]);
  await confirm.getByRole('button', { name: 'Rozpocznij', exact: true }).click();

  await expect(page.getByText('Spotkanie rozpoczęte')).toBeVisible();
  await expect(confirm).toHaveCount(0);
  expect(mock.runs).toEqual([{ action: 'start', meeting_id: PLANNED.id }]);
  await expect(dialog.getByText('Trwa', { exact: true })).toBeVisible();
  await expect(dialog.getByText(/Jeszcze nie zapisano partii/)).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Zakończ spotkanie' })).toBeVisible();
  await expect(widget.getByText('Trwa', { exact: true })).toBeVisible();
  await expect(widget.getByText('0 rozegranych')).toBeVisible();
});

test('drugie trwające spotkanie: start kończy się komunikatem (MTG-2)', async ({ page }) => {
  const other = { ...RUNNING };
  const mock = await openApp(
    page,
    { meetings: [{ ...PLANNED }, other] },
    `/?p=meeting/${PLANNED.id}/start`,
  );
  const confirm = page.getByRole('dialog', { name: 'Rozpocząć spotkanie?' });
  await confirm.getByRole('button', { name: 'Rozpocznij', exact: true }).click();
  await expect(confirm.getByText('Trwa już inne spotkanie. Najpierw je zakończ.')).toBeVisible();
  expect(mock.options.meetings?.find((m) => m.id === PLANNED.id)?.status).toBe('planned');
});

test('prowadzący: partie w toku blokują koniec, potem kończy spotkanie (VIEW-3, RUN-4)', async ({
  page,
}) => {
  const mock = await openApp(
    page,
    {
      profile: { ...ADA, role: 'player' },
      meetings: [{ ...RUNNING, host_id: ADA.id }],
      plays: [SAVED, DRAFT],
    },
    `/?p=meeting/${RUNNING.id}`,
  );
  const dialog = page.getByRole('dialog', { name: 'Czwartkowe granie' });
  await expect(dialog.getByText('1 rozegrana · 1 w toku')).toBeVisible();
  const live = dialog.getByRole('list', { name: 'Partie w toku' });
  await expect(live.getByText('Azul')).toBeVisible();
  await expect(live.getByText('Trwa partia · od 20:55')).toBeVisible();
  const saved = dialog.getByRole('list', { name: 'Zapisane partie' });
  // Zapisana partia to sama karteczka z notesu (wyniki są w podsumowaniu partii).
  await expect(saved.getByText('Partia 1 · 19:10')).toBeVisible();
  await expect(
    saved.getByRole('button', { name: 'Karteczka partii 1: Żółwie Wyścigi, zapisana o 19:10' }),
  ).toBeVisible();
  await expect(saved.getByRole('list', { name: 'Wyniki partii Żółwie Wyścigi' })).toHaveCount(0);
  await settled(page);
  expect(await horizontalOverflow(page)).toBe(0);
  expect(await axe(page)).toEqual([]);

  // Prowadzący nie ma akcji administracyjnych (PLAN-4, Q14): w menu tylko „Zakończ spotkanie”.
  await dialog.getByRole('button', { name: 'Akcje spotkania' }).click();
  await expect(page.getByRole('menuitem')).toHaveText(['Zakończ spotkanie']);
  await page.getByRole('menuitem', { name: 'Zakończ spotkanie' }).click();

  const blocked = page.getByRole('dialog', { name: 'Najpierw dokończ partie w toku' });
  await expect(blocked).toBeVisible();
  expect(await search(page)).toBe(`?p=meeting/${RUNNING.id}&p=meeting/${RUNNING.id}/finish`);
  await expect(blocked.getByRole('list', { name: 'Partie w toku' })).toContainText('Azul');
  await expect(blocked.getByRole('button', { name: 'Zakończ', exact: true })).toHaveCount(0);
  await settled(page);
  expect(await axe(page)).toEqual([]);
  await blocked.getByRole('button', { name: 'Zamknij' }).click();
  await expect(blocked).toHaveCount(0);

  // Partia w toku zapisana w innym urządzeniu: teraz można zakończyć.
  mock.options.plays = [SAVED, { ...DRAFT, status: 'saved', saved_at: '2026-11-12T20:40:00Z' }];
  await dialog.getByRole('button', { name: 'Zakończ spotkanie' }).click();
  const confirm = page.getByRole('dialog', { name: 'Zakończyć spotkanie?' });
  await confirm.getByRole('button', { name: 'Zakończ', exact: true }).click();
  await expect(page.getByText('Spotkanie zakończone')).toBeVisible();
  expect(mock.runs).toEqual([{ action: 'finish', meeting_id: RUNNING.id }]);
  await expect(dialog.getByText('Zakończone', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Zakończ spotkanie' })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Akcje spotkania' })).toHaveCount(0);
});

test('szkic dodany w międzyczasie: baza odrzuca koniec, dialog pokazuje partię', async ({
  page,
}) => {
  const mock = await openApp(
    page,
    { meetings: [{ ...RUNNING }], plays: [SAVED] },
    `/?p=meeting/${RUNNING.id}/finish`,
  );
  const confirm = page.getByRole('dialog', { name: 'Zakończyć spotkanie?' });
  await expect(confirm.getByRole('button', { name: 'Zakończ', exact: true })).toBeEnabled();
  mock.options.plays = [SAVED, DRAFT];
  await confirm.getByRole('button', { name: 'Zakończ', exact: true }).click();
  const blocked = page.getByRole('dialog', { name: 'Najpierw dokończ partie w toku' });
  await expect(blocked.getByRole('list', { name: 'Partie w toku' })).toContainText('Azul');
  expect(mock.options.meetings?.[0]?.status).toBe('in_progress');
});

test('admin w trakcie: widżet z partiami, menu z uczestnikiem i prowadzącym', async ({ page }) => {
  await openApp(page, { meetings: [{ ...RUNNING }], plays: [SAVED, DRAFT] });
  const widget = page.getByRole('region', { name: 'Spotkanie', exact: true });
  await expect(widget.getByText('Trwa', { exact: true })).toBeVisible();
  await expect(widget.getByText('1 rozegrana · 1 w toku')).toBeVisible();
  const plays = widget.getByRole('list', { name: 'Partie spotkania' });
  await expect(plays.getByRole('listitem')).toHaveCount(2);
  await expect(plays.getByRole('listitem').first()).toContainText('Azul');
  await expect(plays.getByRole('listitem').first()).toContainText('Trwa partia · od 20:55');
  await expect(plays.getByRole('listitem').nth(1)).toContainText('Ada');
  await settled(page);
  expect(await horizontalOverflow(page)).toBe(0);
  expect(await axe(page)).toEqual([]);

  await widget.getByRole('button', { name: 'Akcje spotkania Czwartkowe granie' }).click();
  await expect(page.getByRole('menuitem')).toHaveText([
    'Zaplanuj kolejne spotkanie',
    'Dodaj uczestnika',
    'Zmień prowadzącego',
  ]);
  await page.getByRole('menuitem', { name: 'Dodaj uczestnika' }).click();
  expect(await search(page)).toBe(`?p=meeting/${RUNNING.id}/edit`);
});

test('gracz bez prowadzenia: bez akcji, a dialog z linku nie rozpocznie spotkania', async ({
  page,
}) => {
  const mock = await openApp(
    page,
    { profile: { ...ADA, role: 'player' } },
    `/?p=meeting/${PLANNED.id}`,
  );
  const dialog = page.getByRole('dialog', { name: 'Sobotnie granie' });
  await expect(dialog.getByText('Głosowanie otwarte')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Rozpocznij spotkanie' })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Akcje spotkania' })).toHaveCount(0);

  await page.goto(`/?p=meeting/${PLANNED.id}/start`);
  const confirm = page.getByRole('dialog', { name: 'Rozpocząć spotkanie?' });
  await expect(
    confirm.getByText('Spotkanie rozpoczyna i kończy administrator albo prowadzący.'),
  ).toBeVisible();
  await expect(confirm.getByRole('button', { name: 'Rozpocznij', exact: true })).toBeDisabled();
  expect(mock.runs).toEqual([]);
});
