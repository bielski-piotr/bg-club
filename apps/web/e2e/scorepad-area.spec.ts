import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { mockGame, mockSupabase, session, storeSession } from './support/supabaseMock';

/**
 * Krok 2 kreatora „Obszar kartki” (EDT-10) i pełna jakość obrazu (EDT-12), zadanie [017].
 * Próbki zdjęć rysuje przeglądarka (bez plików w repozytorium): kartka z zaokrąglonymi rogami,
 * kartka z wycięciem i kartka sfotografowana pod kątem, każda na ciemnym blacie.
 * Każdy test przechodzi na 360 px i na desktopie, w obu motywach.
 */

const GAME = mockGame(1, 'Żółwie Wyścigi');
const WIZARD = `/?p=game/${GAME.id}/scorepads/new`;

type Sample = 'rounded' | 'notch' | 'perspective' | 'flat';

/** Zdjęcie próbki jako PNG: kartka #F7F3E8 z tabelą na blacie #2B3440. */
async function samplePhoto(page: Page, kind: Sample, width = 1600, height = 1200) {
  const base64 = await page.evaluate(
    ({ kind, width, height }) => {
      const c = document.createElement('canvas');
      c.width = width;
      c.height = height;
      const g = c.getContext('2d') as CanvasRenderingContext2D;
      g.fillStyle = kind === 'flat' ? '#f7f3e8' : '#2b3440';
      g.fillRect(0, 0, width, height);
      const sx = width / 1600;
      const sy = height / 1200;
      g.save();
      g.scale(sx, sy);
      g.beginPath();
      if (kind === 'rounded') g.roundRect(450, 150, 700, 900, 70);
      else if (kind === 'notch') {
        g.moveTo(450, 150);
        g.lineTo(720, 150);
        g.lineTo(720, 260);
        g.lineTo(880, 260);
        g.lineTo(880, 150);
        g.lineTo(1150, 150);
        g.lineTo(1150, 1050);
        g.lineTo(450, 1050);
        g.closePath();
      } else if (kind === 'perspective') {
        g.moveTo(520, 160);
        g.lineTo(1120, 220);
        g.lineTo(1240, 1080);
        g.lineTo(380, 1010);
        g.closePath();
      } else g.rect(0, 0, 1600, 1200);
      g.fillStyle = '#f7f3e8';
      g.fill();
      g.clip();
      g.strokeStyle = '#3b3326';
      g.lineWidth = 4;
      for (let y = 360; y < 1000; y += 80) {
        g.beginPath();
        g.moveTo(300, y);
        g.lineTo(1300, y);
        g.stroke();
      }
      g.restore();
      return c.toDataURL('image/png').split(',')[1] ?? '';
    },
    { kind, width, height },
  );
  return { name: `${kind}.png`, mimeType: 'image/png', buffer: Buffer.from(base64, 'base64') };
}

const editorEl = (page: Page) => page.locator('score-pad-editor');

interface AreaSettings {
  name: string;
  tape: string;
  mode: 'full' | 'auto' | 'manual';
  points: number;
  smoothing: boolean;
  strength: number;
  size: { w: number; h: number };
  binding: 'top' | 'left';
  canUndo: boolean;
  detected: 'shape' | 'sheet' | 'missing' | null;
}

/** Ustawienia kroku 2 ze stanu edytora. */
async function settings(page: Page) {
  return editorEl(page).evaluate((el) => {
    const status = (el as unknown as { status(): { settings: AreaSettings } | null }).status();
    if (!status) throw new Error('edytor niegotowy');
    return status.settings;
  });
}

/** Otwiera kreator, wczytuje próbkę i przechodzi do kroku 2. */
async function openArea(page: Page, kind: Sample, size?: [number, number]) {
  await mockSupabase(page, { club: { name: 'Planszówki', logo_path: null }, games: [GAME] });
  await storeSession(page, session());
  // Zapis kartki: jakość i format każdego kodowania (EDT-12).
  await page.addInitScript(() => {
    const calls: { type: string; quality: unknown; width: number; height: number }[] = [];
    (window as unknown as { __encodes: typeof calls }).__encodes = calls;
    const original = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function (type?: string, quality?: number) {
      calls.push({ type: type ?? '', quality, width: this.width, height: this.height });
      return original.call(this, type, quality);
    };
  });
  await page.goto(WIZARD);
  const dialog = page.getByRole('dialog', { name: 'Nowy notes' });
  await expect(dialog.getByRole('button', { name: 'Wybierz plik' })).toBeEnabled();
  const photo = await samplePhoto(page, kind, ...(size ?? [1600, 1200]));
  await dialog.getByLabel('Wybierz plik').setInputFiles(photo);
  const next = dialog.getByRole('button', { name: 'Dalej' });
  await expect(next).toBeEnabled();
  await next.click();
  await expect(page.locator('score-pad-editor .spe.wizard')).toHaveAttribute('data-step', '2');
  return dialog;
}

async function noHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
}

const handle = (page: Page, i: number) => page.locator(`score-pad-editor [data-p="${i}"] .dot`);

async function center(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('brak elementu');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test('zaokrąglone rogi: wykryty nieregularny obszar, wygładzanie i panel kroku', async ({
  page,
}) => {
  const dialog = await openArea(page, 'rounded');
  const s = await settings(page);
  expect(s.mode).toBe('auto');
  expect(s.detected).toBe('shape');
  expect(s.points).toBeGreaterThan(4);
  await expect(dialog.getByText(/Wykryto kształt kartki/)).toBeVisible();
  // Proporcje kartki 700×900 z wykrytych narożników.
  expect(s.size.w / s.size.h).toBeCloseTo(700 / 900, 1);

  // Panel (DS §18): nazwa, kolor grzbietu, tryb obszaru, wygładzanie, rozmiar, grzbiet.
  await expect(dialog.getByRole('textbox', { name: 'Nazwa notesu' })).toHaveValue('Mój notes');
  await expect(dialog.getByRole('radio', { name: 'Granatowy' })).toBeChecked();
  await expect(dialog.getByRole('radio', { name: 'Wykryj automatycznie' })).toBeChecked();
  await expect(dialog.getByRole('radio', { name: 'U góry' })).toBeChecked();
  await dialog.getByRole('switch', { name: 'Wygładź krawędzie' }).click();
  await expect(dialog.getByRole('slider', { name: 'Siła' })).toBeVisible();
  await expect.poll(async () => (await settings(page)).smoothing).toBe(true);
  await dialog.getByTitle('Zielony').click();
  await expect.poll(async () => (await settings(page)).tape).toBe('#3a9d6e');
  await dialog.getByRole('textbox', { name: 'Szerokość kartki' }).fill('9,5');
  await dialog.getByRole('textbox', { name: 'Wysokość kartki' }).click();
  await expect.poll(async () => (await settings(page)).size.w).toBe(9.5);
  await noHorizontalOverflow(page);

  // Kształt w zapisanym notesie: wygładzony obrys z zaokrąglonymi rogami.
  await dialog.getByRole('button', { name: 'Dalej' }).click();
  await expect(page.locator('score-pad-editor .spe.wizard')).toHaveAttribute('data-step', '3');
  const outline = await editorEl(page).evaluate(
    (el) =>
      (
        el as unknown as { editor: { shape(): { outline: [number, number][] } | undefined } }
      ).editor.shape()?.outline,
  );
  expect(outline?.length).toBeGreaterThan(12);
  // Róg (0, 0) jest odcięty łukiem.
  expect(Math.min(...(outline ?? []).map(([u, v]) => Math.hypot(u, v)))).toBeGreaterThan(0.02);
});

test('wycięcie: obszar z wycięciem i ręczna poprawka punktami z lupą', async ({ page }) => {
  const dialog = await openArea(page, 'notch');
  const s = await settings(page);
  expect(s.detected).toBe('shape');
  expect(s.points).toBeGreaterThanOrEqual(8);

  // Przeciąganie punktu pokazuje lupę i przełącza tryb na ręczny.
  const start = await center(handle(page, 0));
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 12, start.y + 10, { steps: 4 });
  await expect(page.locator('score-pad-editor .spe-loupe')).toBeVisible();
  await page.mouse.up();
  await expect(page.locator('score-pad-editor .spe-loupe')).toBeHidden();
  await expect(dialog.getByRole('radio', { name: 'Ręcznie' })).toBeChecked();
  await expect(dialog.getByText(/Kliknij lub dotknij krawędzi/)).toBeVisible();

  // Kliknięcie krawędzi dodaje punkt, dwuklik punktu go usuwa, Ctrl+Z cofa.
  const before = (await settings(page)).points;
  // najdłuższa krawędź (na krótkiej środek leży w strefie chwytu punktów)
  const dots = await Promise.all(Array.from({ length: before }, (_, i) => center(handle(page, i))));
  let edge = 0;
  let longest = 0;
  dots.forEach((p, i) => {
    const q = dots[(i + 1) % dots.length] as { x: number; y: number };
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d > longest) {
      longest = d;
      edge = i;
    }
  });
  const a = dots[edge] as { x: number; y: number };
  const b = dots[(edge + 1) % dots.length] as { x: number; y: number };
  await page.mouse.click((a.x + b.x) / 2, (a.y + b.y) / 2);
  await expect.poll(async () => (await settings(page)).points).toBe(before + 1);
  const added = await center(handle(page, edge + 1));
  await page.mouse.dblclick(added.x, added.y);
  await expect.poll(async () => (await settings(page)).points).toBe(before);
  await dialog.getByRole('button', { name: 'Cofnij (Ctrl+Z)' }).click();
  await expect.poll(async () => (await settings(page)).points).toBe(before + 1);

  // Klawiatura: punkt z fokusem przesuwają strzałki, Delete go usuwa.
  await handle(page, 0).evaluate((dot) => (dot.parentElement as unknown as SVGElement).focus());
  await page.keyboard.press('Delete');
  await expect.poll(async () => (await settings(page)).points).toBe(before);
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await settings(page)).points).toBe(before + 1);

  // Całe zdjęcie i ponowne wykrycie.
  await dialog.getByText('Całe zdjęcie', { exact: true }).click();
  await expect.poll(async () => (await settings(page)).points).toBe(4);
  await dialog.getByText('Wykryj automatycznie', { exact: true }).click();
  await expect.poll(async () => (await settings(page)).detected).toBe('shape');
  await noHorizontalOverflow(page);
});

test('zdjęcie perspektywiczne: cztery narożniki, prostowanie i obrót o 90°', async ({ page }) => {
  const dialog = await openArea(page, 'perspective');
  const s = await settings(page);
  expect(s.detected).toBe('sheet');
  expect(s.points).toBe(4);

  // Obrót w prawo zamienia szerokość z wysokością (obszar obraca się razem ze zdjęciem).
  await dialog.getByRole('button', { name: 'Obróć w prawo' }).click();
  await expect.poll(async () => (await settings(page)).size).toEqual({ w: s.size.h, h: s.size.w });
  await dialog.getByRole('button', { name: 'Obróć w lewo' }).click();
  await expect.poll(async () => (await settings(page)).size).toEqual(s.size);
  await dialog.getByText('Z lewej', { exact: true }).click();
  await expect.poll(async () => (await settings(page)).binding).toBe('left');

  // Wyprostowana kartka: prostokąt w rozdzielczości obszaru na zdjęciu (bez skalowania w dół).
  await dialog.getByRole('button', { name: 'Dalej' }).click();
  await expect(page.locator('score-pad-editor .spe.wizard')).toHaveAttribute('data-step', '3');
  const sheet = await editorEl(page).evaluate((el) => {
    const s = (el as unknown as { editor: { sheet: HTMLCanvasElement | null } }).editor.sheet;
    return s ? { w: s.width, h: s.height } : null;
  });
  // Najdłuższy bok obszaru na zdjęciu 1600×1200: ok. 870 px (prawy bok).
  expect(Math.max(sheet?.w ?? 0, sheet?.h ?? 0)).toBeGreaterThan(820);
  expect(Math.max(sheet?.w ?? 0, sheet?.h ?? 0)).toBeLessThan(900);
});

test('pełna jakość: dłuższy bok do 4096 px, jakość 0,92, małe zdjęcie bez powiększania', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const dialog = await openArea(page, 'flat', [5200, 3900]);
  await expect.poll(async () => (await settings(page)).mode).toBe('auto');
  // Skan bez tła: obszar to całe zdjęcie przeskalowane do 4096 px.
  const src = await editorEl(page).evaluate((el) => {
    const s = (el as unknown as { editor: { src: HTMLCanvasElement | null } }).editor.src;
    return s ? { w: s.width, h: s.height } : null;
  });
  expect(src).toEqual({ w: 4096, h: 3072 });
  await dialog.getByRole('button', { name: 'Dalej' }).click();
  await expect(page.locator('score-pad-editor .spe.wizard')).toHaveAttribute('data-step', '3', {
    timeout: 30_000,
  });
  const result = await editorEl(page).evaluate((el) => {
    const ed = (
      el as unknown as {
        editor: { sheet: HTMLCanvasElement | null; sheetImage(): string | null };
      }
    ).editor;
    const sheet = ed.sheet as HTMLCanvasElement;
    const log = (
      window as unknown as { __encodes: { type: string; quality: unknown; width: number }[] }
    ).__encodes;
    log.length = 0;
    const image = ed.sheetImage() ?? '';
    return {
      sheet: { w: sheet.width, h: sheet.height },
      encodes: log.filter((e) => e.width === sheet.width),
      image: image.slice(0, 15),
      bytes: Math.floor(((image.length - image.indexOf(',') - 1) * 3) / 4),
    };
  });
  expect(Math.max(result.sheet.w, result.sheet.h)).toBe(4096);
  expect(result.encodes[0]).toMatchObject({ type: 'image/webp', quality: 0.92 });
  expect(result.image).toBe('data:image/webp');
  // Limit bucketu `scorepads` to 5 MiB.
  expect(result.bytes).toBeLessThan(5 * 1024 * 1024);

  // Małe zdjęcie: kartka w jego rozdzielczości.
  await dialog.getByRole('button', { name: 'Wstecz' }).click();
  await dialog.getByRole('button', { name: 'Wstecz' }).click();
  const small = await samplePhoto(page, 'flat', 800, 600);
  await dialog.getByLabel('Wybierz plik').setInputFiles(small);
  await page
    .getByRole('dialog', { name: 'Zastąpić zdjęcie?' })
    .getByRole('button', { name: 'Zastąp zdjęcie' })
    .click();
  await expect(dialog.getByRole('button', { name: 'Dalej' })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Dalej' }).click();
  await dialog.getByRole('button', { name: 'Dalej' }).click();
  await expect(page.locator('score-pad-editor .spe.wizard')).toHaveAttribute('data-step', '3');
  const smallSheet = await editorEl(page).evaluate((el) => {
    const s = (el as unknown as { editor: { sheet: HTMLCanvasElement | null } }).editor.sheet;
    return s ? Math.max(s.width, s.height) : 0;
  });
  expect(smallSheet).toBe(800);
});

test('krok 2 na telefonie i desktopie: układ, nazwa wymagana, zrzut', async ({ page }, info) => {
  const dialog = await openArea(page, 'rounded');
  const stage = dialog.locator('.wizard-work--area .wizard-editor');
  const box = await stage.boundingBox();
  const mobile = (page.viewportSize()?.width ?? 0) < 768;
  if (mobile) expect(Math.round(box?.height ?? 0)).toBe(380);
  else expect(Math.round(box?.width ?? 0)).toBe(620);
  await expect(dialog.getByRole('toolbar', { name: 'Narzędzia obszaru' })).toBeVisible();
  const name = dialog.getByRole('textbox', { name: 'Nazwa notesu' });
  await name.fill('');
  await expect(dialog.getByText('Wpisz nazwę notesu.')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Dalej' })).toBeDisabled();
  await name.fill('Turniejowy');
  await expect(dialog.getByRole('button', { name: 'Dalej' })).toBeEnabled();
  await noHorizontalOverflow(page);
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => animation.playState !== 'running'),
  );
  const results = await new AxeBuilder({ page })
    .include('.scorepad-wizard')
    // Shadow DOM edytora ma własne style z POC; sprawdzamy ramę kreatora i panel kroku.
    .exclude('score-pad-editor')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`),
  ).toEqual([]);
  await page.screenshot({ path: info.outputPath('obszar-kartki.png') });
});
