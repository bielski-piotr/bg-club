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
 * Obrazy karteczek i historia (PRD PAD-6, GAME-10, VIEW-3, zadanie [030]): oderwanie robi obraz
 * kartki z pismem (WebP do ok. 150 KB), który trafia do bucketu `sheets` i do partii po zapisie;
 * anulowane podsumowanie usuwa plik, a przerwany upload nie blokuje zapisu wyników. Karta partii
 * w spotkaniu i galeria gry pokazują obraz, karteczka otwiera powiększenie z wynikami, linkiem do
 * spotkania i podglądem 3D tylko do odczytu, także po usunięciu gry i notesu. API Supabase jest
 * atrapą; reguły bazy (ścieżki, pierwszy obraz, sprzątanie, polityki) sprawdza test SQL 180.
 * Każdy test przechodzi na 360 px i na desktopie, w obu motywach.
 */

const NOW = new Date('2026-11-12T19:00:00Z');
const CLUB = { name: 'Planszówki', logo_path: null, timezone: 'Europe/Warsaw' };
const BEA = member(2, 'Bea', 'Bobrowska');
const CEZARY = member(3, 'Cezary', 'Cichy');
const AZUL = mockGame(1, 'Azul');

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

type Cells = Record<string, (number | null)[]>;

async function openApp(page: Page, options: MockOptions) {
  await page.clock.setFixedTime(NOW);
  const mock = await mockSupabase(page, {
    club: CLUB,
    members: [BEA, CEZARY],
    games: [{ ...AZUL }],
    scorepads: [PAD],
    meetings: [{ ...RUNNING }],
    ...options,
  });
  await storeSession(page, session());
  await page.goto(`/?p=meeting/${RUNNING.id}&p=play/${PLAY_ID}`);
  await expect(page.locator('score-pad').locator('.sp.ready')).toBeVisible({ timeout: 15_000 });
  return mock;
}

const SAVED_PATH = `${RUNNING.id}/${PLAY_ID}-0123456789abcdef01.webp`;
const FINISHED = mockMeeting(5, 'Listopadowe granie', {
  status: 'finished',
  voting_open: false,
  starts_at: '2026-11-08T17:00:00Z',
  started_at: '2026-11-08T17:05:00Z',
  finished_at: '2026-11-08T21:00:00Z',
  participants: [ADA.id, BEA.id, CEZARY.id],
});

/** Zapisana partia z historii z obrazem karteczki (albo bez, gdy upload się nie udał). */
function savedPlay(n: number, extra: Partial<MockPlay> = {}): MockPlay {
  return {
    id: `00000000-0000-4000-f000-${n.toString(16).padStart(12, '0')}`,
    meeting_id: FINISHED.id,
    status: 'saved',
    started_at: '2026-11-08T18:00:00Z',
    saved_at: `2026-11-08T${18 + n}:00:00Z`,
    game_id: AZUL.id,
    scorepad_id: PAD.id,
    sheet: { game: n, names: ['Bea Bobrowska', 'Cezary Cichy'], cells: { a: [20, 11], b: [2, 0] } },
    sheet_image_path: `${FINISHED.id}/00000000-0000-4000-f000-${n
      .toString(16)
      .padStart(12, '0')}-abcdefabcdef.webp`,
    play_results: [
      { profile_id: BEA.id, is_win: true, seat: 1, place: 1, points: 10, ranking_value: 22 },
      { profile_id: CEZARY.id, is_win: false, seat: 2, place: 2, points: 6, ranking_value: 11 },
    ],
    ...extra,
  };
}

async function openHistory(page: Page, url: string, options: MockOptions = {}) {
  await page.clock.setFixedTime(NOW);
  const mock = await mockSupabase(page, {
    club: CLUB,
    members: [BEA, CEZARY],
    games: [{ ...AZUL }],
    scorepads: [PAD],
    meetings: [{ ...FINISHED }],
    plays: [savedPlay(1), savedPlay(2, { sheet_image_path: null })],
    ...options,
  });
  await storeSession(page, session());
  await page.goto(url);
  return mock;
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
    // Płótno WebGL notesu nie jest treścią do sprawdzania (kontrast, nazwy).
    .exclude('score-pad')
    .analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`),
  ).toEqual([]);
}

const tear = (page: Page) =>
  page.getByRole('button', { name: 'Oderwij kartkę i zakończ partię Azul' }).click();
const summaryDialog = (page: Page) => page.getByRole('dialog', { name: 'Podsumowanie partii' });

test('oderwanie: obraz karteczki WebP ≤ 150 KB do Storage i do partii po zapisie (PAD-6)', async ({
  page,
}) => {
  test.slow();
  const mock = await openApp(page, { plays: [draft()], orphanSheets: [SAVED_PATH] });
  await write(page, { a: [12, 7, null, null], b: [3, null, null, null] });

  // Anulowane podsumowanie: obraz wgrany przy oderwaniu jest usuwany.
  await tear(page);
  const summary = summaryDialog(page);
  await expect(summary).toBeVisible();
  await expect.poll(() => mock.sheetUploads.length).toBe(1);
  const first = mock.sheetUploads[0];
  expect(first?.path).toMatch(new RegExp(`^${RUNNING.id}/${PLAY_ID}-[0-9a-f]{18}\\.(webp|png)$`));
  expect(first?.type).toMatch(/^image\/(webp|png)$/);
  expect(first?.size).toBeGreaterThan(1000);
  expect(first?.size).toBeLessThanOrEqual(150 * 1024);
  await summary.getByRole('button', { name: 'Wróć do kartki' }).click();
  // Otwarcie spotkania przez prowadzącego też sprząta osierocone pliki (SAVED_PATH).
  await expect.poll(() => mock.sheetRemoved).toContain(first?.path);

  // Zapis: nowy obraz, dołączony do partii po `save_play`, potem sprzątanie osieroconych plików.
  await tear(page);
  await summary.getByRole('button', { name: 'Zapisz partię' }).click();
  await expect(page.getByText('Partia zapisana: Azul')).toBeVisible();
  expect(mock.playSaves).toHaveLength(1);
  const second = mock.sheetUploads[1]?.path;
  expect(second).toBeDefined();
  expect(second).not.toBe(first?.path);
  // Dołączenie i sprzątanie idą w tle po zapisie wyników.
  await expect.poll(() => mock.sheetAttaches).toEqual([{ play_id: PLAY_ID, image_path: second }]);
  await expect
    .poll(() => [...new Set(mock.sheetRemoved)].sort())
    .toEqual([first?.path, SAVED_PATH].sort());
  expect(mock.sheetRemoved).not.toContain(second);
  await expect.poll(() => mock.options.plays?.[0]?.sheet_image_path).toBe(second);

  // Karta partii w spotkaniu pokazuje obraz karteczki.
  const meeting = page.getByRole('dialog', { name: 'Czwartkowe granie' });
  const thumb = meeting.locator('.play-card .play-sheet__img');
  await expect(thumb).toBeVisible();
  await check(page);
});

test('przerwany upload obrazu: partia i tak zapisana, bez obrazu i bez dołączenia', async ({
  page,
}) => {
  test.slow();
  const mock = await openApp(page, { plays: [draft()], sheetUploadOffline: true });
  await write(page, { a: [9, 4, null, null] });
  await tear(page);
  await summaryDialog(page).getByRole('button', { name: 'Zapisz partię' }).click();
  await expect(page.getByText('Partia zapisana: Azul')).toBeVisible({ timeout: 15_000 });
  expect(mock.playSaves).toHaveLength(1);
  expect(mock.sheetAttaches).toEqual([]);
  expect(mock.options.plays?.[0]?.status).toBe('saved');
  expect(mock.options.plays?.[0]?.sheet_image_path ?? null).toBeNull();
  // Bez obrazu karta partii ma karteczkę zastępczą w kolorze gry.
  const meeting = page.getByRole('dialog', { name: 'Czwartkowe granie' });
  await expect(meeting.locator('.play-card .play-sheet__band')).toBeVisible();
});

test('karteczka z historii: powiększenie, wyniki, link do spotkania i 3D tylko do odczytu', async ({
  page,
}) => {
  test.slow();
  const mock = await openHistory(page, `/?p=meeting/${FINISHED.id}`);
  const meeting = page.getByRole('dialog', { name: 'Listopadowe granie' });
  const cards = meeting.getByRole('list', { name: 'Zapisane partie' }).locator(':scope > li');
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0).locator('.play-sheet__img')).toBeVisible();
  await expect(cards.nth(1).locator('.play-sheet__band')).toBeVisible();
  await check(page);

  await cards.nth(0).getByRole('button', { name: 'Karteczka partii Azul' }).click();
  const sheet = page.getByRole('dialog', { name: 'Azul' });
  await expect(sheet.getByRole('img', { name: /^Karteczka partii Azul z / })).toBeVisible();
  const results = sheet.getByRole('list', { name: 'Wyniki partii Azul' }).getByRole('listitem');
  await expect(results).toHaveCount(2);
  await expect(results.nth(0)).toContainText('Bea Bobrowska');
  await expect(results.nth(0)).toContainText('22');
  await expect(results.nth(0)).toContainText('+10');
  await expect(sheet.getByText('Notes: Azul podstawowy')).toBeVisible();
  await check(page);

  // Ponowny render w 3D z zapisanych wpisów: notes bez odrywania i bez zmian wpisów.
  await sheet.getByRole('button', { name: 'Pokaż w 3D' }).click();
  await expect(page.locator('score-pad').locator('.sp.ready')).toBeVisible({ timeout: 15_000 });
  await expect(sheet.getByText('Podgląd tylko do odczytu')).toBeVisible();
  const state = await page.evaluate(() => {
    type El = HTMLElement & {
      pad: {
        tear(): void;
        exportConfig(o: { sheet: boolean }): { sheet: { cells: Record<string, unknown[]> } };
      };
      options: { readOnly?: boolean; tear?: boolean };
    };
    const element = document.querySelector<El>('score-pad');
    if (!element) throw new Error('Brak notesu');
    let tears = 0;
    element.addEventListener('scorepad:tear', () => (tears += 1));
    element.pad.tear();
    return {
      readOnly: element.options.readOnly,
      tears,
      cells: element.pad.exportConfig({ sheet: true }).sheet.cells,
    };
  });
  expect(state.readOnly).toBe(true);
  expect(state.tears).toBe(0);
  expect(state.cells.a?.slice(0, 2)).toEqual([20, 11]);
  await sheet.getByRole('button', { name: 'Pokaż obraz' }).click();
  await expect(page.locator('score-pad')).toHaveCount(0);

  // Link do spotkania otwiera jego popup.
  await sheet.getByRole('button', { name: 'Otwórz spotkanie Listopadowe granie' }).click();
  await expect(page.getByRole('dialog', { name: 'Listopadowe granie' })).toBeVisible();
  expect(mock.calls.some((call) => call.includes('/storage/v1/object/sign/sheets/'))).toBe(true);

  // Karteczka bez obrazu: wyjaśnienie i podgląd 3D.
  await page.goto(`/?p=sheet/${savedPlay(2).id}`);
  const fallback = page.getByRole('dialog', { name: 'Azul' });
  await expect(fallback.getByText('Obraz tej karteczki nie został zapisany.')).toBeVisible();
  await expect(fallback.getByRole('button', { name: 'Pokaż w 3D' })).toBeVisible();
  await check(page);
});

test('galeria gry od najnowszej karteczki; historia zostaje po usunięciu gry i notesu (GAME-10)', async ({
  page,
}) => {
  test.slow();
  await openHistory(page, '/?p=games');
  await page.getByRole('button', { name: 'Szczegóły gry Azul' }).click();
  const details = page.getByRole('dialog', { name: 'Azul' });
  const gallery = details.getByRole('list', { name: 'Karteczki gry Azul, od najnowszej' });
  const items = gallery.locator(':scope > li');
  await expect(items).toHaveCount(2);
  await expect(details.getByText('2 partie')).toBeVisible();
  // Najnowsza (partia 2, bez obrazu) pierwsza, z karteczką zastępczą; starsza z obrazem.
  await expect(items.nth(0).locator('.play-sheet__band')).toBeVisible();
  await expect(items.nth(1).locator('.play-sheet__img')).toBeVisible();
  await expect(items.nth(1)).toContainText('Listopadowe granie');
  await check(page);
  await items.nth(1).getByRole('button').click();
  await expect(
    page.getByRole('dialog', { name: 'Azul' }).getByRole('img', { name: /^Karteczka partii/ }),
  ).toBeVisible();
});

test('po usunięciu gry i notesu karteczka zostaje w historii (GAME-8, GAME-10)', async ({
  page,
}) => {
  test.slow();
  await openHistory(page, `/?p=sheet/${savedPlay(1).id}`, {
    games: [{ ...AZUL, deleted_at: '2026-11-10T10:00:00Z' }],
  });
  const sheet = page.getByRole('dialog', { name: 'Azul' });
  await expect(sheet.getByRole('img', { name: /^Karteczka partii Azul z / })).toBeVisible();
  await expect(
    sheet.getByRole('list', { name: 'Wyniki partii Azul' }).getByRole('listitem'),
  ).toHaveCount(2);
  // Szczegóły usuniętej gry: czytelny stan zamiast galerii.
  await page.goto(`/?p=game/${AZUL.id}`);
  await expect(page.getByRole('dialog', { name: 'Nie znaleziono gry' })).toBeVisible();
});

test('nieznana karteczka albo partia w toku: czytelny stan', async ({ page }) => {
  await openHistory(page, `/?p=sheet/${PLAY_ID}`, {
    plays: [draft({ meeting_id: FINISHED.id })],
  });
  await expect(page.getByRole('dialog', { name: 'Nie znaleziono karteczki' })).toBeVisible();
  await expect(page.getByText('Nie ma takiej karteczki.')).toBeVisible();
  await check(page);
});
