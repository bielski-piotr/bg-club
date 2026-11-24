import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { png } from './support/png';
import {
  mockGame,
  mockSupabase,
  session,
  storeSession,
  type MockScorepad,
} from './support/supabaseMock';

/**
 * Krok 5 kreatora „Test i zapis” (zadanie [022], EDT-14, EDT-1, DS §18): notes 3D z fikcyjnymi
 * graczami, losowe wypełnienie z remisem, wpisywanie i oderwanie z wynikiem tych samych reguł co
 * partia, bez zapisu testu, a potem zapis notesu w bazie i Storage. Pełna ścieżka nowego notesu
 * (zdjęcie → obszar → pola → kategorie → test → zapis) i edycja istniejącej wersji.
 * API Supabase jest atrapą; każdy test przechodzi na 360 px i na desktopie, w obu motywach.
 */

const GAME = mockGame(1, 'Żółwie Wyścigi');

/** Notes z tabelą dla 3 graczy: Ptaki i Jaja 0–9, Suma; remis sumy rozstrzygają Ptaki. */
const GRID = { x: [0, 0.25, 0.5, 0.75, 1], y: [0, 0.25, 0.5, 0.75, 1] };
const PAD: MockScorepad = {
  id: '00000000-0000-4000-d000-000000000001',
  game_id: GAME.id,
  name: 'Turniejowy',
  created_at: '2026-11-01T12:00:00Z',
  current: {
    id: '00000000-0000-4000-e000-000000000001',
    version: 2,
    image_path: `${GAME.id}/turniejowy.png`,
    player_slots: 3,
    created_at: '2026-11-01T12:00:00Z',
  },
  template: {
    v: 2,
    id: '00000000-0000-4000-d000-000000000001',
    name: 'Turniejowy',
    size: { w: 10, h: 14 },
    tape: '#161A2B',
    grid: { ...GRID, players: 'cols', labels: 1 },
    lines: [
      { id: 'n', label: 'Gracze', kind: 'names' },
      { id: 'a', label: 'Ptaki', kind: 'input', min: 0, max: 9 },
      { id: 'e', label: 'Jaja', kind: 'input', min: 0, max: 9 },
      { id: 's', label: 'Suma', kind: 'total', of: ['a', 'e'] },
    ],
    ranking: { line: 's', dir: 'desc', tiebreak: [{ type: 'line', line: 'a', dir: 'desc' }] },
  },
  image: png(300, 420),
};

const isMobile = (page: Page) => (page.viewportSize()?.width ?? 0) < 768;

function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

async function noHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
}

async function axe(page: Page) {
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => animation.playState !== 'running'),
  );
  const results = await new AxeBuilder({ page })
    .include('.scorepad-wizard')
    // Shadow DOM notesu i edytora ma własne style z POC; sprawdzamy ramę kreatora i panel.
    .exclude('score-pad')
    .exclude('score-pad-editor')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  return results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`);
}

/** Skan kartki 900×1200 z tabelą (5 kolumn graczy, 6 wierszy kategorii). */
async function sheetPhoto(page: Page) {
  const base64 = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 900;
    c.height = 1200;
    const g = c.getContext('2d') as CanvasRenderingContext2D;
    g.fillStyle = '#f7f3e8';
    g.fillRect(0, 0, 900, 1200);
    g.strokeStyle = '#3b3326';
    g.lineWidth = 4;
    const xs = [60, 300, 450, 600, 750, 860];
    const ys = [120, 260, 400, 540, 680, 820, 960];
    for (const x of xs) {
      g.beginPath();
      g.moveTo(x, ys[0] as number);
      g.lineTo(x, ys[ys.length - 1] as number);
      g.stroke();
    }
    for (const y of ys) {
      g.beginPath();
      g.moveTo(xs[0] as number, y);
      g.lineTo(xs[xs.length - 1] as number, y);
      g.stroke();
    }
    return c.toDataURL('image/png').split(',')[1] ?? '';
  });
  return { name: 'tabela.png', mimeType: 'image/png', buffer: Buffer.from(base64, 'base64') };
}

type Sheet = { names: (string | null)[]; cells: Record<string, (number | 'x' | null)[]> };

/** Wpisy wierzchniej kartki notesu testowego. */
function padSheet(page: Page) {
  return page.evaluate(() => {
    type El = HTMLElement & { pad: { exportConfig(o: { sheet: boolean }): { sheet: Sheet } } };
    const element = document.querySelector<El>('score-pad');
    if (!element) throw new Error('Brak notesu');
    return element.pad.exportConfig({ sheet: true }).sheet;
  });
}

/** Krok 5: notes 3D gotowy, przyciski testu aktywne. */
async function openTest(dialog: Locator, page: Page) {
  if (isMobile(page)) {
    const next = dialog.getByRole('button', { name: 'Dalej' });
    for (let i = 0; i < 4; i += 1) {
      await expect(next).toBeEnabled();
      await next.click();
    }
  } else {
    await dialog
      .getByRole('navigation', { name: 'Kroki edytora notesu' })
      .getByRole('button', { name: '5. Test i zapis' })
      .click();
  }
  await expect(dialog.getByRole('group', { name: 'Test notesu' })).toBeVisible();
  await expect(page.locator('score-pad .sp.ready')).toBeVisible({ timeout: 20_000 });
  await expect(dialog.getByRole('button', { name: 'Wypełnij losowo' })).toBeEnabled();
}

const resultRows = (dialog: Locator) =>
  dialog.getByRole('region', { name: 'Wynik testu' }).getByRole('listitem');

test('pełna ścieżka nowego notesu: zdjęcie → obszar → pola → kategorie → test → zapis', async ({
  page,
}) => {
  // Cały kreator z prostowaniem kartki i notesem WebGL.
  test.slow();
  const errors = trackErrors(page);
  const mock = await mockSupabase(page, {
    club: { name: 'Planszówki', logo_path: null },
    games: [GAME],
  });
  await storeSession(page, session());
  await page.goto(`/?p=game/${GAME.id}/scorepads/new`);
  const dialog = page.getByRole('dialog', { name: 'Nowy notes' });
  await expect(dialog.getByRole('button', { name: 'Wybierz plik' })).toBeEnabled();
  await dialog.getByLabel('Wybierz plik').setInputFiles(await sheetPhoto(page));

  // Kroki 2–4 z ustawieniami wykrytymi ze zdjęcia; na desktopie przez „Dalej”, jak na telefonie.
  const next = dialog.getByRole('button', { name: 'Dalej' });
  for (const step of ['2', '3', '4']) {
    await expect(next).toBeEnabled();
    await next.click();
    if (step !== '2')
      await expect(page.locator('score-pad-editor .spe.wizard')).toHaveAttribute('data-step', step);
  }
  await expect(dialog.getByRole('tab', { name: 'Kategorie' })).toBeVisible();
  await expect(next).toBeEnabled();
  await next.click();
  await expect(dialog.getByRole('group', { name: 'Test notesu' })).toBeVisible();
  await expect(page.locator('score-pad .sp.ready')).toBeVisible({ timeout: 20_000 });
  const fill = dialog.getByRole('button', { name: 'Wypełnij losowo' });
  await expect(fill).toBeEnabled();

  // Fikcyjni gracze „Gracz 1…n” zamiast członków klubu.
  const blank = await padSheet(page);
  expect(blank.names.length).toBeGreaterThan(1);
  expect(blank.names).toEqual(blank.names.map((_, i) => `Gracz ${i + 1}`));

  // Losowe wpisy z wymuszonym remisem, oderwanie przyciskiem i wynik testu.
  await dialog.getByText('Wymuś remis przy losowaniu').click();
  await expect(dialog.getByRole('checkbox', { name: 'Wymuś remis przy losowaniu' })).toBeChecked();
  await fill.click();
  await expect
    .poll(async () => Object.keys((await padSheet(page)).cells).length)
    .toBeGreaterThan(0);
  await dialog.getByRole('button', { name: 'Oderwij kartkę' }).click();
  await expect(resultRows(dialog)).toHaveCount(blank.names.length);
  await expect(resultRows(dialog).first()).toContainText('1.');
  // Remis lidera: o miejscu decyduje reguła remisu albo obaj gracze dzielą 1. miejsce.
  await expect(
    dialog
      .getByRole('region', { name: 'Wynik testu' })
      .getByText(/^(Wspólne miejsce|Remis rozstrzygnęła kategoria .+)$/)
      .first(),
  ).toBeVisible();
  // Kolejna kartka ma znowu tych samych graczy, a test niczego nie zapisał.
  await expect.poll(async () => (await padSheet(page)).names).toEqual(blank.names);
  expect(mock.scorepadSaves).toEqual([]);
  expect(mock.scorepadUploads).toEqual([]);

  // Przyciski widoku są w samym notesie (shadow DOM): widok pod kątem i z powrotem.
  await dialog.getByRole('button', { name: 'Widok pod kątem' }).click();
  await dialog.getByRole('button', { name: 'Widok pod kątem' }).click();
  await noHorizontalOverflow(page);
  expect(await axe(page)).toEqual([]);

  // Zapis notesu: zdjęcie do Storage, szablon bez zdjęcia do bazy (EDT-1).
  await dialog.getByRole('button', { name: 'Zapisz notes' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(/Dodano notes/)).toBeVisible();
  // Zdjęcie kartki i jego miniatura do galerii notesów (`<zdjęcie bez rozszerzenia>-thumb`, [040]).
  expect(mock.scorepadUploads).toHaveLength(2);
  expect(mock.scorepadUploads[0]).toMatch(new RegExp(`^${GAME.id}/.+\\.(webp|jpg)$`));
  expect(mock.scorepadUploads[1]).toBe(
    `${mock.scorepadUploads[0]?.replace(/\.(webp|jpg)$/, '')}-thumb`,
  );
  expect(mock.scorepadSaves).toHaveLength(1);
  const saved = mock.scorepadSaves[0] as {
    game_id: string;
    image_path: string;
    player_slots: number;
    template: { image?: string; lines: unknown[] };
  };
  expect(saved.game_id).toBe(GAME.id);
  expect(saved.image_path).toBe(mock.scorepadUploads[0]);
  expect(saved.player_slots).toBe(blank.names.length);
  expect(saved.template.image).toBeUndefined();
  expect(saved.template.lines.length).toBeGreaterThan(1);
  expect(errors).toEqual([]);
});

test('edycja istniejącej wersji: wpisywanie, oderwanie z miejscami i zapis nowej wersji', async ({
  page,
}) => {
  test.slow();
  const errors = trackErrors(page);
  const mock = await mockSupabase(page, {
    club: { name: 'Planszówki', logo_path: null },
    games: [GAME],
    scorepads: [PAD],
  });
  await storeSession(page, session());
  await page.goto(`/?p=scorepad/${PAD.id}/edit`);
  const dialog = page.getByRole('dialog', { name: 'Edytuj notes' });
  if (!isMobile(page)) {
    await expect(
      dialog
        .getByRole('navigation', { name: 'Kroki edytora notesu' })
        .getByRole('button', { name: 'Kategorie (ukończony)' }),
    ).toBeEnabled({ timeout: 15_000 });
  } else {
    await expect(dialog.getByRole('button', { name: 'Dalej' })).toBeEnabled({ timeout: 15_000 });
  }
  await openTest(dialog, page);
  await expect(dialog.getByText('Miejsca według: Suma')).toBeVisible();
  await expect(dialog.getByText(/Zapis utworzy wersję 3 notesu/)).toBeVisible();

  // Wpisywanie jak w partii: pole Ptaki gracza 1, potem Enter przechodzi po kategoriach graczy.
  await page.locator('score-pad .stage canvas').scrollIntoViewIfNeeded();
  const point = await page.evaluate(() => {
    type El = HTMLElement & {
      pad: { pointOnSheet(u: number, v: number): { x: number; y: number } };
    };
    const element = document.querySelector<El>('score-pad');
    if (!element) throw new Error('Brak notesu');
    // Kolumna gracza 1 (0,25–0,5), wiersz Ptaków (0,25–0,5); v liczone od dołu.
    return element.pad.pointOnSheet(0.375, 1 - 0.375);
  });
  if (isMobile(page)) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
  await expect(page.locator('score-pad .en-in')).toBeFocused();
  // Gracz 1: 5 + 2, Gracz 2: 3 + 4 (remis sumy 7, rozstrzygają Ptaki), Gracz 3: 1 + 1.
  for (const value of ['5', '2', '3', '4', '1', '1']) {
    await page.keyboard.type(value);
    await page.keyboard.press('Enter');
  }
  await expect
    .poll(async () => (await padSheet(page)).cells)
    .toEqual({
      a: [5, 3, 1],
      e: [2, 4, 1],
    });

  await dialog.getByRole('button', { name: 'Oderwij kartkę' }).click();
  const rows = resultRows(dialog);
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('1.Gracz 1');
  await expect(rows.nth(0)).toContainText('Remis rozstrzygnęła kategoria Ptaki');
  await expect(rows.nth(0)).toContainText('7');
  await expect(rows.nth(1)).toContainText('2.Gracz 2');
  await expect(rows.nth(1)).toContainText('7');
  await expect(rows.nth(2)).toContainText('3.Gracz 3');
  await expect(rows.nth(2)).toContainText('2');
  // Podsumowanie w notesie: wynik testu, karteczka niezapisana.
  await expect(page.locator('score-pad .note-title')).toHaveText('Wynik testu');
  await expect(page.locator('score-pad .note')).toContainText(
    'Karteczka testowa nie jest zapisywana.',
  );
  expect(mock.scorepadSaves).toEqual([]);

  await noHorizontalOverflow(page);
  expect(await axe(page)).toEqual([]);

  // Zapis nowej wersji tego samego notesu; zdjęcie bez zmian zostaje w Storage.
  await dialog.getByRole('button', { name: 'Zapisz notes' }).click();
  await expect(dialog).toBeHidden();
  expect(mock.scorepadSaves).toHaveLength(1);
  expect(mock.scorepadSaves[0]).toMatchObject({
    scorepad_id: PAD.id,
    game_id: GAME.id,
    image_path: PAD.current.image_path,
    player_slots: 3,
  });
  expect(mock.scorepadUploads).toEqual([]);
  expect(errors).toEqual([]);
});
