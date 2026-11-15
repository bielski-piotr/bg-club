import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { png } from './support/png';
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
  type MockScorepad,
} from './support/supabaseMock';

/**
 * Szkice i wznawianie partii (PRD PAD-4, PAD-8, PAD-9, RUN-3, zadanie [028]): notes partii
 * w toku zapisuje wpisy w bazie z opóźnieniem i lokalnie, odświeżenie i utrata sieci ich nie
 * gubią, nowszy szkic z innego urządzenia daje konflikt zamiast cichego nadpisania, porzucenie
 * usuwa szkic i kopię lokalną, a gracz widzi tylko „Trwa partia”. API Supabase jest atrapą;
 * reguły bazy (wersje, uprawnienia) sprawdza test SQL 160_play_drafts. Każdy test przechodzi
 * na 360 px i na desktopie, w motywie jasnym i ciemnym.
 */

const NOW = new Date('2026-11-12T19:00:00Z');
const CLUB = { name: 'Planszówki', logo_path: null, timezone: 'Europe/Warsaw' };
const BEA = member(2, 'Bea', 'Bobrowska');
const CEZARY = member(3, 'Cezary', 'Cichy');
const AZUL = mockGame(1, 'Azul');
const ZOLWIE = mockGame(2, 'Żółwie Wyścigi');

const GRID = { x: [0, 0.2, 0.4, 0.6, 0.8, 1], y: [0, 0.25, 0.5, 0.75, 1] };
const PAD: MockScorepad = {
  id: '00000000-0000-4000-d000-000000000001',
  game_id: AZUL.id,
  name: 'Azul podstawowy',
  created_at: '2026-11-01T12:00:00Z',
  current: {
    id: '00000000-0000-4000-e000-000000000001',
    version: 1,
    image_path: `${AZUL.id}/azul.png`,
    player_slots: 4,
    created_at: '2026-11-01T12:00:00Z',
  },
  template: {
    v: 2,
    id: '00000000-0000-4000-d000-000000000001',
    name: 'Azul podstawowy',
    size: { w: 10, h: 14 },
    tape: '#161A2B',
    grid: { ...GRID, players: 'cols', labels: 1 },
    lines: [
      { id: 'n', label: 'Gracze', kind: 'names' },
      { id: 'a', label: 'Płytki', kind: 'input', min: 0, max: 99 },
      { id: 'b', label: 'Premie', kind: 'input', min: 0, max: 99 },
      { id: 's', label: 'Suma', kind: 'total', of: ['a', 'b'] },
    ],
  },
  image: png(300, 420),
};

const RUNNING = mockMeeting(6, 'Czwartkowe granie', {
  status: 'in_progress',
  voting_open: false,
  starts_at: '2026-11-12T17:00:00Z',
  started_at: '2026-11-12T17:05:00Z',
  participants: [ADA.id, BEA.id, CEZARY.id],
  host_id: BEA.id,
});

const PLAY_ID = '00000000-0000-4000-f000-000000000001';
const OTHER_ID = '00000000-0000-4000-f000-000000000002';
const NAMES = ['Bea Bobrowska', 'Cezary Cichy', null, null];

function draft(extra: Partial<MockPlay> = {}): MockPlay {
  return {
    id: PLAY_ID,
    meeting_id: RUNNING.id,
    status: 'draft',
    started_at: '2026-11-12T18:30:00Z',
    saved_at: null,
    game_id: AZUL.id,
    scorepad_id: PAD.id,
    play_results: [
      { profile_id: BEA.id, is_win: null, seat: 1 },
      { profile_id: CEZARY.id, is_win: null, seat: 2 },
    ],
    ...extra,
  };
}

/** Druga partia w toku przy drugim stole (RUN-3). */
const OTHER: MockPlay = {
  id: OTHER_ID,
  meeting_id: RUNNING.id,
  status: 'draft',
  started_at: '2026-11-12T18:40:00Z',
  saved_at: null,
  game_id: ZOLWIE.id,
  play_results: [
    { profile_id: ADA.id, is_win: null, seat: 1 },
    { profile_id: BEA.id, is_win: null, seat: 2 },
  ],
};

type Cells = Record<string, (number | 'x' | null)[]>;

function sheet(a: number | null, b: number | null = null) {
  return { game: 1, names: NAMES, cells: { a: [a, b, null, null] } };
}

async function openApp(page: Page, options: MockOptions, path: string) {
  await page.clock.setFixedTime(NOW);
  const mock = await mockSupabase(page, {
    club: CLUB,
    members: [BEA, CEZARY],
    games: [AZUL, ZOLWIE].map((g) => ({ ...g })),
    scorepads: [PAD],
    meetings: [{ ...RUNNING }],
    ...options,
  });
  await storeSession(page, session());
  await page.goto(path);
  return mock;
}

const meetingPath = `/?p=meeting/${RUNNING.id}`;
const padPath = `${meetingPath}&p=play/${PLAY_ID}`;

async function padReady(page: Page) {
  const pad = page.locator('score-pad');
  await expect(pad.locator('.sp.ready')).toBeVisible({ timeout: 15_000 });
  return pad;
}

/** Wpisy kartki tak, jak po wpisaniu w notesie (zmiana stanu wysyła `scorepad:change`). */
async function write(page: Page, cells: Cells) {
  await page.evaluate((next) => {
    type El = HTMLElement & {
      pad: { setSheet(s: unknown): void; exportConfig(o: { sheet: boolean }): { sheet: unknown } };
    };
    const element = document.querySelector<El>('score-pad');
    if (!element) throw new Error('Brak notesu');
    const current = element.pad.exportConfig({ sheet: true }).sheet as { names: unknown };
    element.pad.setSheet({ game: 1, names: current.names, cells: next });
  }, cells);
}

async function padCells(page: Page) {
  return page.evaluate(() => {
    type El = HTMLElement & {
      pad: { exportConfig(o: { sheet: boolean }): { sheet: { cells: Cells; names: unknown[] } } };
    };
    const element = document.querySelector<El>('score-pad');
    if (!element) throw new Error('Brak notesu');
    return element.pad.exportConfig({ sheet: true }).sheet;
  });
}

async function localCopy(page: Page) {
  return page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    return raw
      ? (JSON.parse(raw) as { dirty: boolean; baseVersion: number; sheet: unknown })
      : null;
  }, `bg-club:play-draft:${ADA.id}:${PLAY_ID}`);
}

async function axe(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    // Płótno WebGL notesu nie jest treścią do sprawdzania (kontrast, nazwy).
    .exclude('score-pad')
    .analyze();
  return results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`);
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
  expect(await axe(page)).toEqual([]);
}

const search = (page: Page) => page.evaluate(() => decodeURIComponent(window.location.search));

test('admin wraca do notesu, wpisy zapisują się z opóźnieniem i przetrwają odświeżenie (PAD-4)', async ({
  page,
}) => {
  test.slow();
  const mock = await openApp(page, { plays: [draft(), OTHER] }, meetingPath);
  const meeting = page.getByRole('dialog', { name: 'Czwartkowe granie' });
  const live = meeting.getByRole('list', { name: 'Partie w toku' });
  await expect(live.getByRole('listitem')).toHaveCount(2);
  await expect(live.getByRole('listitem').first()).toContainText('Trwa partia · od 19:30');
  await check(page);

  await live.getByRole('button', { name: 'Wróć do notesu partii Azul' }).click();
  const popup = page.getByRole('dialog', { name: 'Azul' });
  await expect(popup).toBeVisible();
  expect(await search(page)).toBe(`?p=meeting/${RUNNING.id}&p=play/${PLAY_ID}`);
  await padReady(page);

  // Notes ma graczy z miejsc partii (PAD-2); samo otwarcie niczego nie zapisuje.
  expect((await padCells(page)).names).toEqual(NAMES);
  await expect(popup.getByRole('status')).toHaveText('Szkic zapisany');
  await check(page);
  await page.waitForTimeout(2000);
  expect(mock.draftSaves).toHaveLength(0);

  // Wpis: od razu kopia lokalna, do bazy dopiero po ~1,5 s od ostatniej zmiany.
  await write(page, { a: [12, null, null, null] });
  await write(page, { a: [12, 7, null, null] });
  expect(await localCopy(page)).toMatchObject({ dirty: true, sheet: sheet(12, 7) });
  expect(mock.draftSaves).toHaveLength(0);
  await expect.poll(() => mock.draftSaves.length, { timeout: 5000 }).toBe(1);
  expect(mock.draftSaves[0]).toMatchObject({
    play_id: PLAY_ID,
    base_version: 0,
    sheet: { names: NAMES, cells: { a: [12, 7, null, null] } },
  });
  await expect(popup.getByRole('status')).toHaveText('Szkic zapisany');
  expect(await localCopy(page)).toMatchObject({ dirty: false, baseVersion: 1 });

  // Odświeżenie: notes wczytuje szkic z bazy bez ponownego zapisu.
  await page.reload();
  await padReady(page);
  expect((await padCells(page)).cells.a?.slice(0, 2)).toEqual([12, 7]);
  await page.waitForTimeout(2000);
  expect(mock.draftSaves).toHaveLength(1);
});

test('inne urządzenie bez kopii lokalnej wczytuje szkic z bazy (PAD-4, bez synchronizacji na żywo)', async ({
  page,
}) => {
  const mock = await openApp(
    page,
    {
      plays: [
        draft({
          sheet: sheet(30, 25),
          draft_version: 4,
          draft_saved_at: '2026-11-12T18:50:00Z',
          draft_saved_by: BEA.id,
        }),
      ],
    },
    padPath,
  );
  await padReady(page);
  expect((await padCells(page)).cells.a?.slice(0, 2)).toEqual([30, 25]);
  await write(page, { a: [30, 26, null, null] });
  await expect.poll(() => mock.draftSaves.length, { timeout: 5000 }).toBe(1);
  expect(mock.draftSaves[0]?.base_version).toBe(4);
  await check(page);
});

test('utrata sieci: wpisy zostają na urządzeniu i wracają po odświeżeniu i połączeniu (PAD-4)', async ({
  page,
}) => {
  test.slow();
  const mock = await openApp(
    page,
    { plays: [draft({ sheet: sheet(null), draft_version: 1 })], draftOffline: true },
    padPath,
  );
  const popup = page.getByRole('dialog', { name: 'Azul' });
  await padReady(page);
  await write(page, { a: [9, 4, null, null] });
  await expect(popup.getByRole('status')).toHaveText(
    'Brak połączenia. Wpisy są bezpieczne na tym urządzeniu i zapiszą się same.',
    { timeout: 5000 },
  );
  expect(await localCopy(page)).toMatchObject({ dirty: true, baseVersion: 1, sheet: sheet(9, 4) });
  await check(page);

  // Odświeżenie (albo awaria karty) nadal bez sieci: notes zaczyna od kopii lokalnej.
  await page.reload();
  await padReady(page);
  expect((await padCells(page)).cells.a?.slice(0, 2)).toEqual([9, 4]);

  // Sieć wraca: zapis od wersji z bazy, bez konfliktu.
  mock.options.draftOffline = false;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(popup.getByRole('status')).toHaveText('Szkic zapisany', { timeout: 10_000 });
  const last = mock.draftSaves.at(-1);
  expect(last).toMatchObject({ base_version: 1, sheet: { cells: { a: [9, 4, null, null] } } });
  expect(await localCopy(page)).toMatchObject({ dirty: false, baseVersion: 2 });
});

test('nowszy szkic z innego urządzenia: konflikt zamiast nadpisania, wybór wersji (PAD-4)', async ({
  page,
}) => {
  test.slow();
  const mock = await openApp(
    page,
    { plays: [draft({ sheet: sheet(5), draft_version: 2 })] },
    padPath,
  );
  const popup = page.getByRole('dialog', { name: 'Azul' });
  await padReady(page);

  // Bea zapisuje szkic na swoim telefonie, gdy ten notes jest otwarty.
  const other = draft({
    sheet: sheet(40, 41),
    draft_version: 3,
    draft_saved_at: '2026-11-12T18:55:00Z',
    draft_saved_by: BEA.id,
  });
  mock.options.plays = [other];
  await write(page, { a: [6, null, null, null] });

  const conflict = popup.getByRole('alert').filter({ hasText: 'Szkic zmienił się' });
  await expect(conflict).toBeVisible({ timeout: 5000 });
  await expect(conflict).toContainText('Nowszy szkic: Bea Bobrowska, 19:55.');
  await expect(popup.getByRole('status')).toHaveText('Szkic zmienił się na innym urządzeniu.');
  // Nic nie zostało nadpisane, a dalsze wpisy nie idą do bazy do czasu decyzji.
  expect(mock.options.plays?.[0]?.sheet).toEqual(sheet(40, 41));
  await check(page);

  await conflict.getByRole('button', { name: 'Wczytaj szkic z bazy' }).click();
  await expect(conflict).toHaveCount(0);
  // Notes powstaje od nowa z wpisami z bazy.
  await padReady(page);
  await expect.poll(async () => (await padCells(page)).cells.a?.slice(0, 2)).toEqual([40, 41]);

  // Kolejny konflikt: tym razem zachowujemy wpisy z tego urządzenia (świadome nadpisanie).
  await expect(popup.getByRole('status')).toHaveText('Szkic zapisany', { timeout: 5000 });
  const version = mock.options.plays?.[0]?.draft_version ?? 0;
  mock.options.plays = [draft({ sheet: sheet(1, 1), draft_version: version + 1 })];
  await write(page, { a: [44, 41, null, null] });
  await expect(conflict).toBeVisible({ timeout: 5000 });
  await conflict.getByRole('button', { name: 'Zachowaj wpisy z tego urządzenia' }).click();
  await expect(popup.getByRole('status')).toHaveText('Szkic zapisany', { timeout: 5000 });
  expect(mock.draftSaves.at(-1)).toMatchObject({
    base_version: version + 1,
    sheet: { cells: { a: [44, 41, null, null] } },
  });
});

test('kopia z tego urządzenia i nowszy szkic w bazie: wybór przed otwarciem notesu', async ({
  page,
}) => {
  await page.addInitScript(([key, value]) => window.localStorage.setItem(key, value), [
    `bg-club:play-draft:${ADA.id}:${PLAY_ID}`,
    JSON.stringify({
      v: 1,
      profileId: ADA.id,
      playId: PLAY_ID,
      baseVersion: 1,
      sheet: sheet(3, 3),
      dirty: true,
      updatedAt: '2026-11-12T18:45:00Z',
    }),
  ] as const);
  const mock = await openApp(
    page,
    {
      plays: [
        draft({
          sheet: sheet(20, 21),
          draft_version: 3,
          draft_saved_at: '2026-11-12T18:58:00Z',
          draft_saved_by: BEA.id,
        }),
      ],
    },
    padPath,
  );
  const popup = page.getByRole('dialog', { name: 'Azul' });
  const conflict = popup.getByRole('alert').filter({ hasText: 'Szkic zmienił się' });
  await expect(conflict).toContainText('Nowszy szkic: Bea Bobrowska, 19:58.');
  await expect(page.locator('score-pad')).toHaveCount(0);
  await check(page);

  await conflict.getByRole('button', { name: 'Zachowaj wpisy z tego urządzenia' }).click();
  await padReady(page);
  expect((await padCells(page)).cells.a?.slice(0, 2)).toEqual([3, 3]);
  await expect.poll(() => mock.draftSaves.length).toBe(1);
  expect(mock.draftSaves[0]).toMatchObject({
    base_version: 3,
    sheet: { cells: { a: [3, 3, null, null] } },
  });
});

test('porzucenie usuwa szkic i kopię lokalną; druga partia zostaje (PAD-8, RUN-3)', async ({
  page,
}) => {
  const mock = await openApp(
    page,
    { plays: [draft({ draft_version: 1, sheet: sheet(2) }), OTHER] },
    padPath,
  );
  const popup = page.getByRole('dialog', { name: 'Azul' });
  await padReady(page);
  await write(page, { a: [2, 8, null, null] });
  await expect.poll(async () => (await localCopy(page))?.sheet).toMatchObject(sheet(2, 8));

  await popup.getByRole('button', { name: 'Porzuć partię Azul' }).click();
  const dialog = page.getByRole('dialog', { name: 'Porzucić partię?' });
  await expect(dialog).toContainText(
    'Partia Azul zostanie usunięta razem z wpisami z kartki. Nie trafi do historii ani statystyk.',
  );
  await check(page);
  await dialog.getByRole('button', { name: 'Porzuć partię' }).click();

  await expect(page.getByText('Partia porzucona: Azul')).toBeVisible();
  expect(mock.discards).toEqual([PLAY_ID]);
  // Dialog i notes porzuconej partii są zamknięte; zostaje spotkanie z drugą partią.
  await expect(popup).toHaveCount(0);
  await expect(dialog).toHaveCount(0);
  expect(await search(page)).toBe(`?p=meeting/${RUNNING.id}`);
  const live = page
    .getByRole('dialog', { name: 'Czwartkowe granie' })
    .getByRole('list', { name: 'Partie w toku' });
  await expect(live.getByRole('listitem')).toHaveCount(1);
  await expect(live).toContainText('Żółwie Wyścigi');
  expect(await localCopy(page)).toBeNull();

  // Porzucenie z karty partii w toku, bez otwierania notesu.
  await live.getByRole('button', { name: 'Porzuć partię Żółwie Wyścigi' }).click();
  await page
    .getByRole('dialog', { name: 'Porzucić partię?' })
    .getByRole('button', { name: 'Porzuć partię' })
    .click();
  await expect(page.getByText('Partia porzucona: Żółwie Wyścigi')).toBeVisible();
  expect(mock.discards).toEqual([PLAY_ID, OTHER_ID]);
  await expect(
    page
      .getByRole('dialog', { name: 'Czwartkowe granie' })
      .getByRole('list', { name: 'Partie w toku' }),
  ).toHaveCount(0);
});

test('gracz widzi tylko „Trwa partia”, bez notesu i akcji; link do notesu wyjaśnia (PAD-9)', async ({
  page,
}) => {
  const mock = await openApp(
    page,
    { profile: { ...ADA, role: 'player' }, plays: [draft({ sheet: sheet(5), draft_version: 1 })] },
    meetingPath,
  );
  const meeting = page.getByRole('dialog', { name: 'Czwartkowe granie' });
  const live = meeting.getByRole('list', { name: 'Partie w toku' });
  await expect(live).toContainText('Trwa partia · od 19:30');
  await expect(live.getByRole('button')).toHaveCount(0);
  await check(page);

  await page.goto(padPath);
  const popup = page.getByRole('dialog', { name: 'Trwa partia: Azul' });
  await expect(popup).toContainText('Gracze: Bea Bobrowska, Cezary Cichy');
  await expect(popup).toContainText(
    'Notes partii jest dostępny tylko dla administratora i prowadzącego spotkania.',
  );
  await expect(page.locator('score-pad')).toHaveCount(0);
  await check(page);

  await page.goto(`${padPath}&p=play/${PLAY_ID}/discard`);
  await expect(page.getByRole('dialog', { name: 'Porzucić partię?' })).toHaveCount(0);
  expect(mock.draftSaves).toEqual([]);
  expect(mock.discards).toEqual([]);
});

test('porzuconej partii nie ma: notes pokazuje wyjaśnienie i czyści kopię lokalną', async ({
  page,
}) => {
  await page.addInitScript(([key]) => window.localStorage.setItem(key, '{}'), [
    `bg-club:play-draft:${ADA.id}:${PLAY_ID}`,
  ] as const);
  await openApp(page, { plays: [] }, padPath);
  await expect(
    page.getByText('Tej partii już nie ma. Mogła zostać porzucona na innym urządzeniu.'),
  ).toBeVisible();
  await expect.poll(() => localCopy(page)).toBeNull();
});
