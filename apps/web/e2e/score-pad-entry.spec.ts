import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * Wpisywanie punktów bezpośrednio w pole kartki (zadanie [021], PAD-13…PAD-15) w notesie
 * z galerii /design-system: 10 miejsc, kategorie Ptaki (0–99), Jajka (0–40), Bonusy (dowolne).
 */

interface EntryDebug {
  line: string;
  seat: number;
  text: string;
  error: string;
  focused: boolean;
  box: { x: number; y: number; w: number; h: number };
}

interface PadDebug {
  view: 'home' | 'free';
  entry: EntryDebug | null;
}

type Sheet = { cells: Record<string, (number | 'x' | null)[]> };

// Siatka przykładowego notesu (apps/web/src/design-system/scorePadSample.ts).
const LEFT = 0.05 + 0.17;
const SEAT = (0.95 - 0.05 - 0.17) / 10;
const ROWS: Record<string, number> = { birds: 0.48, eggs: 0.6, bonus: 0.72 };

async function openPad(page: Page) {
  await page.goto('/design-system');
  await page.getByRole('button', { name: 'Pokaż notes' }).click();
  const pad = page.locator('score-pad');
  await expect(pad.locator('.sp.ready')).toBeVisible({ timeout: 15_000 });
  await pad.locator('.stage canvas').scrollIntoViewIfNeeded();
  return pad;
}

function padState(page: Page) {
  return page.evaluate(() => {
    type El = HTMLElement & { pad: { debug(): PadDebug } };
    const element = document.querySelector<El>('score-pad');
    if (!element) throw new Error('Brak notesu');
    return element.pad.debug();
  });
}

const entry = async (page: Page) => (await padState(page)).entry;

function sheet(page: Page) {
  return page.evaluate(() => {
    type El = HTMLElement & { pad: { exportConfig(o: { sheet: boolean }): { sheet: Sheet } } };
    const element = document.querySelector<El>('score-pad');
    if (!element) throw new Error('Brak notesu');
    return element.pad.exportConfig({ sheet: true }).sheet.cells;
  });
}

/** Środek pola kategorii `line` gracza `seat` na ekranie. */
function cellPoint(page: Page, line: string, seat: number) {
  const u = LEFT + (seat + 0.5) * SEAT;
  const v = 1 - (ROWS[line] ?? 0);
  return page.evaluate(
    ([uu, vv]) => {
      type El = HTMLElement & {
        pad: { pointOnSheet(u: number, v: number): { x: number; y: number } };
      };
      const element = document.querySelector<El>('score-pad');
      if (!element) throw new Error('Brak notesu');
      return element.pad.pointOnSheet(uu, vv);
    },
    [u, v] as const,
  );
}

async function tapCell(page: Page, line: string, seat: number, isMobile: boolean) {
  const p = await cellPoint(page, line, seat);
  if (isMobile) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
  await expect.poll(async () => (await entry(page))?.line).toBe(line);
  expect((await entry(page))?.seat).toBe(seat);
}

async function expectAt(page: Page, line: string, seat: number) {
  await expect.poll(async () => (await entry(page))?.line ?? null).toBe(line);
  const e = await entry(page);
  expect(e?.seat).toBe(seat);
  expect(e?.focused).toBe(true);
}

function input(pad: Locator) {
  return pad.locator('.en-in');
}

test.describe('na komputerze', () => {
  test.skip(({ isMobile }) => isMobile, 'klawiatura sprzętowa');

  test('kliknięcie zaznacza pole bez okna; cyfry, Enter, Tab, Shift+Tab, Esc i strzałki', async ({
    page,
  }) => {
    // długi scenariusz na notesie WebGL
    test.slow();
    const pad = await openPad(page);
    await tapCell(page, 'birds', 0, false);
    // bez okna wyboru; przy polu tylko zakres kategorii, bez przycisków (klawiatura sprzętowa)
    await expect(pad.locator('.picker')).toBeHidden();
    await expect(pad.locator('.en-hint')).toHaveText('od 0 do 99');
    await expect(pad.locator('.en-bar button:visible')).toHaveCount(0);
    await expect(input(pad)).toHaveAttribute('inputmode', 'numeric');
    await expect(input(pad)).toHaveAttribute('enterkeyhint', 'next');

    // cyfry od razu w polu, Enter zapisuje i przechodzi do następnej kategorii gracza
    await page.keyboard.type('42');
    expect((await entry(page))?.text).toBe('42');
    await page.keyboard.press('Enter');
    await expectAt(page, 'eggs', 0);
    expect((await sheet(page)).birds?.[0]).toBe(42);

    // spoza zakresu: błąd przy polu i brak przejścia dalej
    await page.keyboard.type('50');
    await page.keyboard.press('Enter');
    await expect(pad.locator('.en-err')).toHaveText('Ta kategoria przyjmuje: od 0 do 40.');
    await expect(pad.locator('.en-bar')).toBeVisible();
    await expectAt(page, 'eggs', 0);
    expect((await sheet(page)).eggs?.[0]).toBeNull();

    // Backspace kasuje, poprawka usuwa błąd, Tab przechodzi dalej
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await page.keyboard.type('7');
    await expect(pad.locator('.en-err')).toBeHidden();
    await page.keyboard.press('Tab');
    await expectAt(page, 'bonus', 0);
    expect((await sheet(page)).eggs?.[0]).toBe(7);

    // minus zmienia znak, Esc cofa zmianę, strzałka w górę zmienia o krok
    await page.keyboard.type('5-');
    expect((await entry(page))?.text).toBe('-5');
    await page.keyboard.press('Escape');
    expect((await entry(page))?.text).toBe('');
    await page.keyboard.type('3');
    await page.keyboard.press('ArrowUp');
    expect((await entry(page))?.text).toBe('4');

    // Shift+Tab cofa (zapisując wpis); po ostatniej kategorii gracza: następny gracz
    await page.keyboard.press('Shift+Tab');
    await expectAt(page, 'eggs', 0);
    expect((await sheet(page)).bonus?.[0]).toBe(4);
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await expectAt(page, 'birds', 1);

    // litery nie trafiają do pola; Esc bez zmian kończy wpisywanie
    await page.keyboard.type('a1b');
    expect((await entry(page))?.text).toBe('1');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    expect(await entry(page)).toBeNull();
    expect((await sheet(page)).birds?.[1]).toBeNull();
  });

  test('po przybliżeniu fokus przechodzi do dalekiego pola, a widok przesuwa się do niego', async ({
    page,
  }) => {
    const pad = await openPad(page);
    const start = await cellPoint(page, 'bonus', 7);
    await page.mouse.move(start.x, start.y);
    for (let i = 0; i < 10; i++) await page.mouse.wheel(0, -300);
    await expect.poll(async () => (await padState(page)).view).toBe('free');
    await tapCell(page, 'bonus', 7, false);
    // 10 miejsc: Tab przez kategorie gracza 9 do gracza 10
    for (let i = 0; i < 4; i++) await page.keyboard.press('Tab');
    await expectAt(page, 'birds', 9);
    const e = (await entry(page)) as EntryDebug;
    const frame = await pad.locator('.sp').boundingBox();
    if (!frame) throw new Error('Brak notesu');
    expect(e.box.x).toBeGreaterThanOrEqual(frame.x);
    expect(e.box.y).toBeGreaterThanOrEqual(frame.y);
    expect(e.box.x + e.box.w).toBeLessThanOrEqual(frame.x + frame.width);
    expect(e.box.y + e.box.h).toBeLessThanOrEqual(frame.y + frame.height);
  });
});

test.describe('na telefonie', () => {
  test.skip(({ isMobile }) => !isMobile, 'klawiatura systemowa');

  test('dotknięcie otwiera klawiaturę numeryczną; ± i „Dalej” zostawiają fokus w polu', async ({
    page,
  }) => {
    const pad = await openPad(page);
    await tapCell(page, 'bonus', 2, true);
    await expect(pad.locator('.picker')).toBeHidden();
    expect((await entry(page))?.focused).toBe(true);
    const sign = pad.getByRole('button', { name: 'Zmień znak na przeciwny' });
    const next = pad.getByRole('button', { name: 'Następne pole' });
    await expect(sign).toBeVisible();
    await expect(next).toBeVisible();

    await page.keyboard.type('6');
    await sign.tap();
    expect((await entry(page))?.text).toBe('-6');
    await expectAt(page, 'bonus', 2);
    await next.tap();
    // ostatnia kategoria gracza 3: pierwsza kategoria gracza 4, klawiatura dalej otwarta
    await expectAt(page, 'birds', 3);
    expect((await sheet(page)).bonus?.[2]).toBe(-6);
    // Ptaki nie przyjmują wartości ujemnych: bez przycisku ±
    await expect(sign).toBeHidden();

    // dotknięcie innego pola przy otwartym wpisywaniu: fokus zostaje w polu wpisywania
    await page.keyboard.type('12');
    await tapCell(page, 'eggs', 5, true);
    await expectAt(page, 'eggs', 5);
    expect((await sheet(page)).birds?.[3]).toBe(12);

    // błąd zakresu blokuje „Dalej”
    await page.keyboard.type('99');
    await next.tap();
    await expect(pad.locator('.en-err')).toHaveText('Ta kategoria przyjmuje: od 0 do 40.');
    await expectAt(page, 'eggs', 5);

    // dotknięcie stołu poza polami kończy wpisywanie (błędny wpis zostaje porzucony)
    const frame = await pad.locator('.sp').boundingBox();
    if (!frame) throw new Error('Brak notesu');
    await page.touchscreen.tap(frame.x + 6, frame.y + frame.height - 6);
    await expect.poll(() => entry(page)).toBeNull();
    expect((await sheet(page)).eggs?.[5]).toBeNull();
  });
});
