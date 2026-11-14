import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { mockGame, mockSupabase, session, storeSession } from './support/supabaseMock';

/**
 * Krok 3 kreatora „Mapowanie pól” (EDT-11, EDT-6, EDT-8), zadanie [018]. Próbki to skany
 * kartki (cała kartka w kadrze): z tabelą 1 + 4 kolumny × 6 wierszy albo pusta. Na telefonie
 * prostokąty rysuje dotyk (CDP), na desktopie mysz. Każdy test przechodzi na 360 px
 * i na desktopie, w obu motywach.
 */

const GAME = mockGame(1, 'Żółwie Wyścigi');
const WIZARD = `/?p=game/${GAME.id}/scorepads/new`;

interface Mapping {
  mode: 'rects' | 'table';
  players: 'cols' | 'rows';
  seats: number;
  categories: number;
  activeSeat: number;
  activeCategory: number;
  canUndo: boolean;
  zoomed: boolean;
  problem: string | null;
}

const isMobile = (page: Page) => (page.viewportSize()?.width ?? 0) < 768;
const editorEl = (page: Page) => page.locator('score-pad-editor');

async function mapping(page: Page): Promise<Mapping> {
  return editorEl(page).evaluate((el) => {
    const status = (el as unknown as { status(): { mapping: Mapping } | null }).status();
    if (!status) throw new Error('edytor niegotowy');
    return status.mapping;
  });
}

/** Skan kartki 900×1200: z tabelą albo pusty. */
async function sheetPhoto(page: Page, table: boolean) {
  const base64 = await page.evaluate((table) => {
    const c = document.createElement('canvas');
    c.width = 900;
    c.height = 1200;
    const g = c.getContext('2d') as CanvasRenderingContext2D;
    g.fillStyle = '#f7f3e8';
    g.fillRect(0, 0, 900, 1200);
    if (table) {
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
    }
    return c.toDataURL('image/png').split(',')[1] ?? '';
  }, table);
  return {
    name: table ? 'tabela.png' : 'pusta.png',
    mimeType: 'image/png',
    buffer: Buffer.from(base64, 'base64'),
  };
}

/** Otwiera kreator, wczytuje skan i przechodzi do kroku 3. */
async function openMapping(page: Page, table: boolean) {
  await mockSupabase(page, { club: { name: 'Planszówki', logo_path: null }, games: [GAME] });
  await storeSession(page, session());
  await page.goto(WIZARD);
  const dialog = page.getByRole('dialog', { name: 'Nowy notes' });
  await expect(dialog.getByRole('button', { name: 'Wybierz plik' })).toBeEnabled();
  await dialog.getByLabel('Wybierz plik').setInputFiles(await sheetPhoto(page, table));
  const next = dialog.getByRole('button', { name: 'Dalej' });
  await expect(next).toBeEnabled();
  await next.click();
  await expect(next).toBeEnabled();
  await next.click();
  await expect(editorEl(page).locator('.spe.wizard')).toHaveAttribute('data-step', '3');
  await expect(dialog.getByRole('group', { name: 'Sposób mapowania' })).toBeVisible();
  return dialog;
}

/** Prostokąt kartki na ekranie (zdjęcie w scenie edytora). */
async function sheetBox(page: Page) {
  const box = await editorEl(page).locator('.spe-base').boundingBox();
  if (!box) throw new Error('brak kartki');
  return box;
}

/** Punkt ekranu dla współrzędnych kartki 0…1. */
const at = (b: { x: number; y: number; width: number; height: number }, u: number, v: number) => ({
  x: b.x + b.width * u,
  y: b.y + b.height * v,
});

/** Rysuje prostokąt: dotykiem (telefon) albo myszą (desktop). */
async function drawRect(page: Page, u: number, v: number, w = 0.12, h = 0.05) {
  const b = await sheetBox(page);
  const a = at(b, u, v);
  const z = at(b, u + w, v + h);
  if (isMobile(page)) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [a] });
    for (let i = 1; i <= 4; i++)
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: a.x + ((z.x - a.x) * i) / 4, y: a.y + ((z.y - a.y) * i) / 4 }],
      });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
  } else {
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(z.x, z.y, { steps: 4 });
    await page.mouse.up();
  }
}

async function noHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
}

async function axe(page: Page) {
  const results = await new AxeBuilder({ page })
    .include('.scorepad-wizard')
    .exclude('score-pad-editor')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  return results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`);
}

const tiles = (dialog: Locator) => dialog.locator('.wizard-stat__number');

test('prostokąty ręczne: kolejne kategorie, powielanie dla ponad 8 miejsc, EDT-6', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const dialog = await openMapping(page, false);
  const next = dialog.getByRole('button', { name: 'Dalej' });
  // Kartka bez tabeli zaczyna od prostokątów ręcznych.
  await expect(dialog.getByRole('radio', { name: 'Prostokąty ręczne' })).toBeChecked();
  await expect(dialog.locator('.wizard-hint--problem')).toHaveText(
    'Narysuj na kartce pole pierwszej kategorii.',
  );
  await expect(next).toBeDisabled();
  await expect(dialog.getByText(/można używać tylko w partiach do 1 graczy/)).toBeVisible();
  await noHorizontalOverflow(page);
  expect(await axe(page)).toEqual([]);

  // Po każdym polu następna kategoria tego samego miejsca.
  await drawRect(page, 0.05, 0.1);
  await expect.poll(async () => (await mapping(page)).categories).toBe(1);
  await drawRect(page, 0.05, 0.2);
  await drawRect(page, 0.05, 0.3);
  await expect
    .poll(async () => mapping(page))
    .toMatchObject({
      categories: 3,
      activeCategory: 3,
      seats: 1,
      problem: null,
    });
  await expect(dialog.getByText('Nowa kategoria (4)')).toBeVisible();
  await expect(tiles(dialog)).toHaveText(['1', '3']);
  await expect(next).toBeEnabled();

  // Cofnij z paska sceny usuwa ostatnie pole.
  const toolbar = dialog.getByRole('toolbar', { name: 'Narzędzia mapowania' });
  await toolbar.getByRole('button', { name: 'Cofnij (Ctrl+Z)' }).click();
  await expect.poll(async () => (await mapping(page)).categories).toBe(2);
  await drawRect(page, 0.05, 0.3);

  // Powielenie dla kolejnych miejsc (EDT-8: ponad 8).
  for (let n = 2; n <= 10; n++) {
    await dialog.getByRole('button', { name: `Powiel dla miejsca ${n}` }).click();
    await expect.poll(async () => (await mapping(page)).seats).toBe(n);
  }
  await expect(tiles(dialog)).toHaveText(['10', '3']);
  await expect(dialog.getByRole('radio', { name: 'Miejsce 10' })).toBeChecked();
  // 10 miejsc ≥ 4 graczy gry: bez ostrzeżenia.
  await expect(dialog.getByText(/można używać tylko w partiach/)).toHaveCount(0);
  await noHorizontalOverflow(page);

  const exported = await editorEl(page).evaluate((el) => {
    const cfg = (
      el as unknown as {
        exportConfig(): { template: { grid?: unknown; players?: number; fields?: unknown[] } };
      }
    ).exportConfig();
    return {
      grid: cfg.template.grid ?? null,
      players: cfg.template.players,
      fields: cfg.template.fields?.length,
    };
  });
  expect(exported).toEqual({ grid: null, players: 10, fields: 30 });

  await next.click();
  await expect(dialog.getByText(/Notes ma 10 miejsc dla graczy i 3 kategorie/)).toBeVisible();
});

test('powiększenie kartki i dopasowanie widoku', async ({ page }) => {
  const dialog = await openMapping(page, false);
  const fit = dialog.getByRole('button', { name: 'Dopasuj widok' });
  await expect(fit).toBeDisabled();
  const b = await sheetBox(page);
  const c = at(b, 0.5, 0.5);
  if (isMobile(page)) {
    // szczypanie dwoma palcami
    const cdp = await page.context().newCDPSession(page);
    const pts = (d: number) => [
      { x: c.x - d, y: c.y, id: 1 },
      { x: c.x + d, y: c.y, id: 2 },
    ];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(20) });
    for (const d of [40, 60, 80])
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(d) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
  } else {
    await page.mouse.move(c.x, c.y);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -300);
    await page.keyboard.up('Control');
  }
  await expect.poll(async () => (await mapping(page)).zoomed).toBe(true);
  // Szczypanie niczego nie narysowało.
  expect((await mapping(page)).categories).toBe(0);
  await expect(fit).toBeEnabled();
  await fit.click();
  await expect.poll(async () => (await mapping(page)).zoomed).toBe(false);
});

test('wykryta tabela: poprawa linii, oś graczy i zmiana trybu z potwierdzeniem', async ({
  page,
}) => {
  const dialog = await openMapping(page, true);
  await expect(dialog.getByRole('radio', { name: 'Wykryj tabelę' })).toBeChecked();
  const m = await mapping(page);
  expect(m).toMatchObject({ mode: 'table', players: 'cols', seats: 4, categories: 6 });
  await expect(tiles(dialog)).toHaveText(['4', '6']);
  await expect(dialog.getByRole('button', { name: 'Dalej' })).toBeEnabled();
  await noHorizontalOverflow(page);
  expect(await axe(page)).toEqual([]);

  // Linia tabeli przeciągnięta za uchwyt na lewej krawędzi; Cofnij przywraca ją.
  const lineY = () =>
    editorEl(page).evaluate(
      (el) =>
        (el as unknown as { editor: { fields: { draft: { grid: { y: number[] } } } } }).editor
          .fields.draft.grid.y[2] ?? 0,
    );
  const y0 = await lineY();
  const knob = editorEl(page).locator('[data-g="y"][data-i="2"] .knob');
  const kb = await knob.boundingBox();
  if (!kb) throw new Error('brak uchwytu');
  await page.mouse.move(kb.x + kb.width / 2, kb.y + kb.height / 2);
  await page.mouse.down();
  await page.mouse.move(kb.x + kb.width / 2, kb.y + kb.height / 2 + 20, { steps: 4 });
  await page.mouse.up();
  await expect.poll(lineY).toBeGreaterThan(y0 + 0.005);
  await dialog.getByRole('button', { name: 'Cofnij (Ctrl+Z)' }).click();
  await expect.poll(lineY).toBeCloseTo(y0, 4);

  // Gracze w wierszach: te same linie, zamienione role.
  await dialog.getByText('Wierszach', { exact: true }).click();
  await expect
    .poll(async () => mapping(page))
    .toMatchObject({ players: 'rows', seats: 5, categories: 5 });
  await dialog.getByText('Kolumnach', { exact: true }).click();
  await expect.poll(async () => (await mapping(page)).players).toBe('cols');

  // Zmiana trybu: popup; anulowanie zostawia wszystko.
  await dialog.getByText('Prostokąty ręczne', { exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Zmienić sposób mapowania?' });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Anuluj' }).click();
  await expect(confirm).toHaveCount(0);
  await expect(dialog.getByRole('radio', { name: 'Wykryj tabelę' })).toBeChecked();
  expect(await mapping(page)).toMatchObject({ mode: 'table', seats: 4, categories: 6 });

  await dialog.getByText('Prostokąty ręczne', { exact: true }).click();
  await confirm.getByRole('button', { name: 'Usuń i zmień' }).click();
  await expect
    .poll(async () => mapping(page))
    .toMatchObject({ mode: 'rects', categories: 0, seats: 1 });
  await expect(dialog.getByRole('button', { name: 'Dalej' })).toBeDisabled();
  await noHorizontalOverflow(page);
});
