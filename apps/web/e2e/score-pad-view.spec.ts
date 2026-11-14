import { expect, test, type Page } from '@playwright/test';

/**
 * Notes 3D: obrót, zoom, widok z góry i tekstura (zadanie [020], PAD-10…PAD-12, PAD-16).
 * Notes z galerii /design-system; stan kamery czytamy z `pad.debug()`.
 */

interface PadDebug {
  view: 'home' | 'free';
  seesTop: boolean;
  zoom: number;
  texture: [number, number] | null;
  pixelRatio: number;
}

async function openPad(page: Page) {
  await page.goto('/design-system');
  await page.getByRole('button', { name: 'Pokaż notes' }).click();
  const pad = page.locator('score-pad');
  await expect(pad.locator('.sp.ready')).toBeVisible({ timeout: 15_000 });
  const canvas = pad.locator('.stage canvas');
  // notes w galerii jest niżej niż pierwszy ekran
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Brak płótna notesu');
  return { pad, canvas, box };
}

function padState(page: Page) {
  return page.evaluate(() => {
    type El = HTMLElement & { pad: { debug(): PadDebug } };
    const element = document.querySelector<El>('score-pad');
    if (!element) throw new Error('Brak notesu');
    return element.pad.debug();
  });
}

test.describe('na komputerze', () => {
  test.skip(({ isMobile }) => isMobile, 'mysz i kółko');

  test('obrót prawym przyciskiem, zoom kółkiem względem kursora i powrót klawiszem 0', async ({
    page,
  }) => {
    const { pad, box } = await openPad(page);
    const home = pad.getByRole('button', { name: 'Widok z góry' });
    await expect(home).toBeDisabled();
    expect(await padState(page)).toMatchObject({ view: 'home', seesTop: true, zoom: 1 });

    // Prawy przycisk obraca notes w każdym miejscu (PAD-10).
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(cx + 120, cy + 40, { steps: 6 });
    await page.mouse.up({ button: 'right' });
    expect(await padState(page)).toMatchObject({ view: 'free', seesTop: true });
    await expect(home).toBeEnabled();

    // Kółko bez Ctrl przybliża co najmniej 6× (PAD-11).
    for (let i = 0; i < 12; i++) await page.mouse.wheel(0, -300);
    await expect.poll(async () => (await padState(page)).zoom).toBeGreaterThanOrEqual(6);

    // Klawisz 0 płynnie wraca do widoku z góry (PAD-12).
    await pad.locator('.stage canvas').focus();
    await page.keyboard.press('0');
    await expect.poll(async () => (await padState(page)).view).toBe('home');
    await expect(home).toBeDisabled();
  });

  test('od tyłu notesu nie da się wpisywać; przycisk „Widok z góry” wraca do kartki', async ({
    page,
  }) => {
    const { pad, box } = await openPad(page);
    // Lewy przycisk poza notesem (róg stołu) też obraca: pół obrotu w pionie pokazuje tekturę.
    const x = box.x + 8;
    const y = box.y + box.height - 8;
    await page.mouse.move(x, y);
    await page.mouse.down();
    const half = Math.max(240, Math.min(box.width, box.height));
    for (let i = 1; i <= 10; i++) await page.mouse.move(x, y - (half * i) / 10);
    await page.mouse.up();
    expect(await padState(page)).toMatchObject({ view: 'free', seesTop: false });

    // Kliknięcie w środek nie otwiera wpisywania.
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(pad.locator('.picker')).toBeHidden();

    await pad.getByRole('button', { name: 'Widok z góry' }).click();
    await expect.poll(async () => (await padState(page)).view).toBe('home');
    expect((await padState(page)).seesTop).toBe(true);
  });
});

test.describe('na telefonie', () => {
  test.skip(({ isMobile }) => !isMobile, 'gesty dwoma palcami');

  test('dwa palce obracają i przybliżają notes, bez zoomu strony', async ({ page }) => {
    const { box } = await openPad(page);
    const cdp = await page.context().newCDPSession(page);
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const touch = (
      type: 'touchStart' | 'touchMove' | 'touchEnd',
      pts: { x: number; y: number }[],
    ) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: pts.map((p, id) => ({ x: p.x, y: p.y, id })),
      });

    // Szczypanie na zewnątrz przybliża.
    await touch('touchStart', [{ x: cx - 30, y: cy }]);
    await touch('touchStart', [
      { x: cx - 30, y: cy },
      { x: cx + 30, y: cy },
    ]);
    for (let i = 1; i <= 8; i++)
      await touch('touchMove', [
        { x: cx - 30 - i * 12, y: cy },
        { x: cx + 30 + i * 12, y: cy },
      ]);
    await touch('touchEnd', []);
    const zoomed = await padState(page);
    expect(zoomed.view).toBe('free');
    expect(zoomed.zoom).toBeGreaterThan(2);

    // Przesunięcie dwoma palcami w pionie obraca pod spód notesu.
    await touch('touchStart', [
      { x: cx - 40, y: cy + 150 },
      { x: cx + 40, y: cy + 150 },
    ]);
    for (let i = 1; i <= 15; i++)
      await touch('touchMove', [
        { x: cx - 40, y: cy + 150 - i * 25 },
        { x: cx + 40, y: cy + 150 - i * 25 },
      ]);
    await touch('touchEnd', []);
    expect((await padState(page)).seesTop).toBe(false);

    // Strona nie została powiększona przez przeglądarkę (NFR-4).
    expect(await page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(1);
  });
});

test('tekstura w rozdzielczości zdjęcia kartki i pełna gęstość ekranu', async ({ page }) => {
  await openPad(page);
  const state = await page.evaluate(async () => {
    type El = HTMLElement & {
      pad: { importConfig(raw: unknown): Promise<string>; debug(): PadDebug };
    };
    const canvas = document.createElement('canvas');
    canvas.width = 2000;
    canvas.height = 2800;
    const g = canvas.getContext('2d');
    if (!g) throw new Error('Brak kontekstu 2D');
    g.fillStyle = '#fbf7ec';
    g.fillRect(0, 0, 2000, 2800);
    g.fillStyle = '#2a4bdb';
    g.fillRect(100, 100, 1800, 40);
    const image = canvas.toDataURL('image/jpeg', 0.8);
    const element = document.querySelector<El>('score-pad');
    if (!element) throw new Error('Brak notesu');
    await element.pad.importConfig({
      format: 'score-pad',
      version: 2,
      template: {
        v: 2,
        id: 'photo-hd',
        name: 'Zdjęcie HD',
        size: { w: 10, h: 14 },
        tape: '#161a2b',
        image,
        grid: { x: [0.1, 0.4, 0.7, 0.9], y: [0.2, 0.4, 0.6], players: 'cols', labels: 1 },
        lines: [
          { id: 'n', kind: 'names', label: 'Gracze' },
          { id: 'a', kind: 'input', label: 'Punkty' },
        ],
      },
    });
    return element.pad.debug();
  });
  // Bez zmniejszania do dawnych 1600 px (PAD-16); urządzenie testowe ma maxTextureSize ≥ 4096.
  expect(state.texture).toEqual([2000, 2800]);
  const dpr = await page.evaluate(() => window.devicePixelRatio);
  expect(state.pixelRatio).toBe(Math.min(dpr, 3));
});
