import { expect, test, type Page } from '@playwright/test';

/**
 * Notes 3D: zoom, widoki kamery, oderwanie przyciskiem i tekstura (PAD-11, PAD-12, PAD-16).
 * Notes z galerii /design-system; stan kamery czytamy z `pad.debug()`.
 */

interface PadDebug {
  view: 'home' | 'free';
  angled: boolean;
  moving: boolean;
  zoom: number;
  game: number;
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

  test('zoom kółkiem względem kursora, bez obrotu myszą, i reset widoku', async ({ page }) => {
    // Na CI (WebGL programowy) 12 kroków zoomu kółkiem i animacja powrotu przekraczają 30 s,
    // jak scenariusz z zoomem w score-pad-entry.spec.ts.
    test.slow();
    const { pad, box } = await openPad(page);
    const reset = pad.getByRole('button', { name: 'Resetuj widok' });
    await expect(reset).toBeDisabled();
    expect(await padState(page)).toMatchObject({ view: 'home', angled: false, zoom: 1 });

    // Przeciąganie prawym albo lewym przyciskiem poza kartką nie zmienia kamery.
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    for (const button of ['right', 'left'] as const) {
      await page.mouse.move(box.x + 8, box.y + box.height - 8);
      await page.mouse.down({ button });
      await page.mouse.move(box.x + 160, box.y + box.height - 120, { steps: 6 });
      await page.mouse.up({ button });
    }
    expect(await padState(page)).toMatchObject({ view: 'home', zoom: 1 });

    // Kółko bez Ctrl przybliża co najmniej 6× (PAD-11).
    await page.mouse.move(cx, cy);
    for (let i = 0; i < 12; i++) await page.mouse.wheel(0, -300);
    await expect.poll(async () => (await padState(page)).zoom).toBeGreaterThanOrEqual(6);
    await expect(reset).toBeEnabled();

    // Przycisk „Resetuj widok” płynnie wraca do widoku domyślnego (PAD-12).
    await reset.click();
    await expect.poll(async () => (await padState(page)).view).toBe('home');
    await expect(reset).toBeDisabled();

    // Klawisz 0 robi to samo (kursor wraca nad notes znad przycisku).
    await page.mouse.move(cx, cy);
    await page.mouse.wheel(0, -300);
    await expect.poll(async () => (await padState(page)).view).toBe('free');
    await pad.locator('.stage canvas').focus();
    await page.keyboard.press('0');
    await expect.poll(async () => (await padState(page)).view).toBe('home');
  });

  test('widok z góry i pod kątem przełącza przycisk i klawisz V', async ({ page }) => {
    const { pad } = await openPad(page);
    const angle = pad.getByRole('button', { name: 'Widok pod kątem' });
    await expect(angle).toHaveAttribute('aria-pressed', 'false');
    await angle.click();
    await expect(angle).toHaveAttribute('aria-pressed', 'true');
    await expect
      .poll(async () => await padState(page))
      .toMatchObject({ view: 'home', angled: true, moving: false });
    await pad.locator('.stage canvas').focus();
    await page.keyboard.press('v');
    await expect(angle).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(async () => (await padState(page)).view).toBe('home');
  });

  test('przycisk w notesie odrywa kartkę', async ({ page }) => {
    const { pad } = await openPad(page);
    const before = (await padState(page)).game;
    await pad.getByRole('button', { name: 'Oderwij wierzchnią kartkę' }).click();
    await expect.poll(async () => (await padState(page)).game).not.toBe(before);
  });
});

test.describe('na telefonie', () => {
  test.skip(({ isMobile }) => !isMobile, 'gesty dwoma palcami');

  test('szczypanie przybliża i przesuwa widok, bez zoomu strony', async ({ page }) => {
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

    // Przesunięcie dwoma palcami przesuwa widok, bez zmiany przybliżenia.
    await touch('touchStart', [
      { x: cx - 40, y: cy + 60 },
      { x: cx + 40, y: cy + 60 },
    ]);
    for (let i = 1; i <= 6; i++)
      await touch('touchMove', [
        { x: cx - 40, y: cy + 60 - i * 15 },
        { x: cx + 40, y: cy + 60 - i * 15 },
      ]);
    await touch('touchEnd', []);
    const panned = await padState(page);
    expect(panned.view).toBe('free');
    expect(panned.zoom).toBeCloseTo(zoomed.zoom, 1);

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
