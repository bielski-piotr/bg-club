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
 * Zakończenie partii (PRD PAD-5, PAD-7, §5.6, zadanie [029]): oderwanie karteczki pokazuje
 * podsumowanie z miejscami i punktami, „Wróć do kartki” kładzie kartkę z powrotem, a „Zapisz
 * partię” wysyła kartkę i wyniki bez punktów (liczy je baza). Przekroczony czas po zapisie
 * ponawia to samo żądanie bez duplikatu. API Supabase jest atrapą; reguły bazy (uprawnienia,
 * miejsca, punkty floor, ponowienia i równoległe żądania) sprawdzają testy SQL 170 i 171 oraz
 * test integracyjny. Każdy test przechodzi na 360 px i na desktopie, w obu motywach.
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

async function padSheet(page: Page) {
  return page.evaluate(() => {
    type El = HTMLElement & {
      pad: {
        exportConfig(o: { sheet: boolean }): {
          sheet: { game: number; cells: Cells; names: unknown[] };
        };
      };
    };
    const element = document.querySelector<El>('score-pad');
    if (!element) throw new Error('Brak notesu');
    return element.pad.exportConfig({ sheet: true }).sheet;
  });
}

const localCopy = (page: Page) =>
  page.evaluate(
    (key) => window.localStorage.getItem(key),
    `bg-club:play-draft:${ADA.id}:${PLAY_ID}`,
  );

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

test('oderwanie: podsumowanie, powrót do kartki i zapis wyników bez punktów (PAD-5, §5.6.2)', async ({
  page,
}) => {
  test.slow();
  const mock = await openApp(page, { plays: [draft()] });
  const pad = page.getByRole('dialog', { name: 'Azul' });
  await expect(pad.getByText('Gdy skończycie, oderwij karteczkę')).toBeVisible();
  await write(page, { a: [12, 7, null, null], b: [3, null, null, null] });

  await tear(page);
  const summary = summaryDialog(page);
  await expect(summary).toBeVisible();
  const rows = summary.getByRole('list', { name: 'Wyniki partii Azul' }).getByRole('listitem');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('Bea Bobrowska');
  await expect(rows.nth(0)).toContainText('Wygrana');
  await expect(rows.nth(0)).toContainText('15');
  await expect(rows.nth(0)).toContainText('+10 pkt');
  await expect(rows.nth(1)).toContainText('Cezary Cichy');
  await expect(rows.nth(1)).toContainText('+6 pkt');
  await check(page);

  // „Wróć do kartki”: kartka wraca na notes z wpisami i numerem partii, nic nie trafia do bazy.
  await summary.getByRole('button', { name: 'Wróć do kartki' }).click();
  await expect(summary).toBeHidden();
  const restored = await padSheet(page);
  expect(restored.game).toBe(1);
  expect(restored.cells.a?.slice(0, 2)).toEqual([12, 7]);
  expect(restored.names).toEqual(NAMES);
  expect(mock.playSaves).toHaveLength(0);

  // Esc przy podsumowaniu też wraca do kartki, a notes zostaje otwarty.
  await tear(page);
  await expect(summary).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(summary).toBeHidden();
  await expect(pad).toBeVisible();

  // Zapis: kartka i wyniki bez punktów, potem powrót do spotkania z zapisaną partią.
  await tear(page);
  await summary.getByRole('button', { name: 'Zapisz partię' }).click();
  await expect(page.getByText('Partia zapisana: Azul')).toBeVisible();
  await expect(pad).toBeHidden();
  expect(mock.playSaves).toHaveLength(1);
  expect(mock.playSaves[0]).toMatchObject({
    play_id: PLAY_ID,
    scorepad_version_id: PAD.current.id,
    sheet: { names: NAMES, cells: { a: [12, 7, null, null] } },
    results: [
      { profile_id: BEA.id, seat: 1, place: 1, scores: { a: 12, b: 3 }, ranking_value: 15 },
      { profile_id: CEZARY.id, seat: 2, place: 2, scores: { a: 7, b: null }, ranking_value: 7 },
    ],
  });
  for (const result of mock.playSaves[0]?.results ?? []) {
    expect(Object.keys(result).sort()).toEqual([
      'place',
      'profile_id',
      'ranking_value',
      'scores',
      'seat',
    ]);
  }
  const meeting = page.getByRole('dialog', { name: 'Czwartkowe granie' });
  const results = meeting.getByRole('list', { name: 'Wyniki partii Azul' });
  await expect(results.getByRole('listitem').first()).toContainText('Bea Bobrowska');
  await expect(results.getByRole('listitem').first()).toContainText('+10');
  expect(await localCopy(page)).toBeNull();
  await check(page);
});

test('remis: wspólne 1. miejsce, każdy wygrywa, floor((10+6)/2) = 8 (§5.6.2, §5.6.3)', async ({
  page,
}) => {
  test.slow();
  await openApp(page, { plays: [draft()] });
  await write(page, { a: [20, 20, null, null] });
  await tear(page);
  const rows = summaryDialog(page).getByRole('listitem');
  await expect(rows).toHaveCount(2);
  for (const row of [rows.nth(0), rows.nth(1)]) {
    await expect(row).toContainText('Wygrana · Wspólne miejsce');
    await expect(row).toContainText('+8 pkt');
  }
  await check(page);
});

test('przekroczony czas po zapisie: ponowienie tej samej treści, partia zapisana raz', async ({
  page,
}) => {
  test.slow();
  const mock = await openApp(page, { plays: [draft()], savePlayLostReplies: 1 });
  await write(page, { a: [9, 4, null, null] });
  await tear(page);
  await summaryDialog(page).getByRole('button', { name: 'Zapisz partię' }).click();
  await expect(page.getByText('Partia zapisana: Azul')).toBeVisible({ timeout: 10_000 });
  expect(mock.playSaves).toHaveLength(2);
  expect(mock.playSaves[1]).toEqual(mock.playSaves[0]);
  const saved = (mock.options.plays ?? []).filter((p) => p.status === 'saved');
  expect(saved).toHaveLength(1);
  expect(saved[0]?.play_results.map((r) => r.points)).toEqual([10, 6]);
});

test('pusta kartka wraca na notes z wyjaśnieniem; błąd zapisu zostawia podsumowanie', async ({
  page,
}) => {
  test.slow();
  const mock = await openApp(page, {
    plays: [draft()],
    savePlayError: { code: '23514', hint: 'plays_already_saved', message: 'already saved' },
  });
  const pad = page.getByRole('dialog', { name: 'Azul' });
  await tear(page);
  await expect(pad.getByText('Kartka nie ma jeszcze wyników.')).toBeVisible();
  await expect(summaryDialog(page)).toBeHidden();
  expect((await padSheet(page)).names).toEqual(NAMES);
  await check(page);

  await write(page, { a: [5, 8, null, null] });
  await tear(page);
  const summary = summaryDialog(page);
  await summary.getByRole('button', { name: 'Zapisz partię' }).click();
  await expect(summary.getByText('Ta partia została już zapisana z innymi wynikami')).toBeVisible();
  expect(mock.playSaves).toHaveLength(1);
  await check(page);
  await summary.getByRole('button', { name: 'Wróć do kartki' }).click();
  expect((await padSheet(page)).cells.a?.slice(0, 2)).toEqual([5, 8]);
});

test('manual: podgrupa po kategorii, anulowanie, pozostały remis i odczyt karteczki', async ({
  page,
}) => {
  test.slow();
  const DAN = member(4, 'Daniel', 'Długi');
  const manualPad = {
    ...PAD,
    template: {
      ...PAD.template,
      ranking: {
        line: 'a',
        dir: 'desc',
        tiebreak: [{ type: 'line', line: 'b', dir: 'asc' }, { type: 'manual' }],
      },
    },
  };
  const mock = await openApp(page, {
    members: [BEA, CEZARY, DAN],
    scorepads: [manualPad],
    meetings: [{ ...RUNNING, participants: [ADA.id, BEA.id, CEZARY.id, DAN.id] }],
    plays: [
      draft({
        play_results: [ADA, BEA, CEZARY, DAN].map((p, i) => ({
          profile_id: p.id,
          seat: i + 1,
          is_win: null,
        })),
      }),
    ],
  });
  await write(page, { a: [10, 10, 10, 10], b: [1, 2, 2, 2] });
  await tear(page);
  const summary = summaryDialog(page);
  await expect(summary.getByRole('group', { name: 'Remis 1' })).toBeVisible();
  // Ada already won on category b. Only the other three can be reordered.
  await expect(summary.getByRole('button', { name: /^Kolejność:/ })).toHaveCount(3);
  const chooseOrder = async (name: string, order: number) => {
    await summary.getByRole('button', { name: `Kolejność: ${name}` }).click();
    await page.getByRole('option', { name: `${order}. w grupie`, exact: true }).click();
  };
  await chooseOrder('Bea Bobrowska', 2);
  await chooseOrder('Daniel Długi', 2);
  const results = summary.getByRole('list', { name: 'Wyniki partii Azul' }).getByRole('listitem');
  await expect(results.nth(1)).toContainText('Cezary Cichy');
  await expect(results.nth(1)).toContainText('+6 pkt');
  await expect(results.nth(2)).toContainText('Wspólne miejsce');
  await expect(results.nth(2)).toContainText('+3 pkt');
  await check(page);
  await page.screenshot({
    path: `test-results/manual-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page.keyboard.press('Escape');
  await expect(summary).toBeHidden();
  expect(mock.playSaves).toHaveLength(0);
  expect((await padSheet(page)).cells.b).toEqual([1, 2, 2, 2]);
  await tear(page);
  await expect(summary.getByRole('button', { name: 'Kolejność: Bea Bobrowska' })).toContainText(
    '1. w grupie',
  );
  await chooseOrder('Bea Bobrowska', 2);
  await chooseOrder('Daniel Długi', 2);
  await summary.getByRole('button', { name: 'Zapisz partię' }).click();
  await expect(page.getByText('Partia zapisana: Azul')).toBeVisible();
  expect(mock.playSaves[0]?.results.map((r) => [r.seat, r.place])).toEqual([
    [1, 1],
    [2, 3],
    [3, 2],
    [4, 3],
  ]);
  const meeting = page.getByRole('dialog', { name: 'Czwartkowe granie' });
  await meeting.getByRole('button', { name: 'Karteczka partii Azul' }).click();
  const sheet = page.getByRole('dialog', { name: 'Azul' });
  const savedRows = sheet.getByRole('list', { name: 'Wyniki partii Azul' }).getByRole('listitem');
  await expect(savedRows.nth(1)).toContainText('Cezary Cichy');
  await expect(savedRows.nth(2)).toContainText('Bea Bobrowska');
  await expect(savedRows.nth(2)).toContainText('+3');
  await page.reload();
  await expect(
    page
      .getByRole('dialog', { name: 'Azul' })
      .getByRole('listitem')
      .filter({ hasText: 'Cezary Cichy' }),
  ).toContainText('+6');
  await check(page);
});

test('manual: pierwsza reguła, dwie niezależne grupy i pozostawienie wspólnego miejsca', async ({
  page,
}) => {
  test.slow();
  const DAN = member(4, 'Daniel', 'Długi');
  const mock = await openApp(page, {
    members: [BEA, CEZARY, DAN],
    scorepads: [
      {
        ...PAD,
        template: {
          ...PAD.template,
          ranking: { line: 'a', dir: 'asc', tiebreak: [{ type: 'manual' }] },
        },
      },
    ],
    meetings: [{ ...RUNNING, participants: [ADA.id, BEA.id, CEZARY.id, DAN.id] }],
    plays: [
      draft({
        play_results: [ADA, BEA, CEZARY, DAN].map((p, i) => ({
          profile_id: p.id,
          seat: i + 1,
          is_win: null,
        })),
      }),
    ],
  });
  await write(page, { a: [5, 5, 10, 10] });
  await tear(page);
  const summary = summaryDialog(page);
  await expect(summary.getByRole('group', { name: 'Remis 2' })).toBeVisible();
  await summary.getByRole('button', { name: 'Kolejność: Cezary Cichy' }).click();
  await page.getByRole('option', { name: '2. w grupie', exact: true }).click();
  await check(page);
  await summary.getByRole('button', { name: 'Zapisz partię' }).click();
  await expect(page.getByText('Partia zapisana: Azul')).toBeVisible();
  expect(mock.playSaves[0]?.results.map((r) => r.place)).toEqual([1, 1, 4, 3]);
});
