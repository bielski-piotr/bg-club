import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { mockGame, mockSupabase, session, storeSession } from './support/supabaseMock';

/**
 * Krok 4 kreatora „Kategorie” (EDT-13, EDT-2…EDT-4, EDT-7), zadanie [019]. Próbka to skan
 * kartki z tabelą 1 + 4 kolumny × 6 wierszy: krok 3 wykrywa tabelę (pierwszy wiersz to imiona,
 * pozostałe to punktacje). Każdy test przechodzi na 360 px i na desktopie, w obu motywach.
 */

const GAME = mockGame(1, 'Żółwie Wyścigi');
const WIZARD = `/?p=game/${GAME.id}/scorepads/new`;

interface Line {
  id: string;
  label: string;
  kind: string;
  min?: number;
  max?: number;
  step?: number;
  values?: number[];
  free?: boolean;
  of?: string[];
  hint?: string;
}

interface Exported {
  lines: Line[];
  ranking?:
    | {
        line: string;
        dir: string;
        tiebreak: { type: string; line?: string; dir?: string }[];
      }
    | undefined;
}

const editorEl = (page: Page) => page.locator('score-pad-editor');

async function exported(page: Page): Promise<Exported> {
  return editorEl(page).evaluate((el) => {
    const cfg = (el as unknown as { exportConfig(): { template: Exported } }).exportConfig();
    return { lines: cfg.template.lines, ranking: cfg.template.ranking };
  });
}

async function issues(page: Page): Promise<{ code: string; path: string }[]> {
  return editorEl(page).evaluate((el) => {
    const status = (
      el as unknown as { status(): { categories: { issues: { code: string; path: string }[] } } }
    ).status();
    return status.categories.issues;
  });
}

/** Skan kartki 900×1200 z tabelą. */
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

/** Otwiera kreator, wczytuje skan i przechodzi do kroku 4. */
async function openCategories(page: Page) {
  await mockSupabase(page, { club: { name: 'Planszówki', logo_path: null }, games: [GAME] });
  await storeSession(page, session());
  await page.goto(WIZARD);
  const dialog = page.getByRole('dialog', { name: 'Nowy notes' });
  await expect(dialog.getByRole('button', { name: 'Wybierz plik' })).toBeEnabled();
  await dialog.getByLabel('Wybierz plik').setInputFiles(await sheetPhoto(page));
  const next = dialog.getByRole('button', { name: 'Dalej' });
  for (const step of ['2', '3', '4']) {
    await expect(next).toBeEnabled();
    await next.click();
    if (step !== '2')
      await expect(editorEl(page).locator('.spe.wizard')).toHaveAttribute('data-step', step);
  }
  await expect(dialog.getByRole('tab', { name: 'Kategorie' })).toBeVisible();
  return dialog;
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
    .exclude('score-pad-editor')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  return results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`);
}

/** Wybiera opcję listy rozwijanej (DS §10). */
async function choose(page: Page, scope: Locator, label: RegExp, option: string) {
  await scope.getByRole('button', { name: label }).click();
  await page.getByRole('option', { name: new RegExp(`^${option}`) }).click();
}

/** Panel kroku (bez kartki edytora, której opisy pól też zawierają nazwy kategorii). */
const panelOf = (dialog: Locator) => dialog.locator('.wizard-panel');

test('kategorie: nazwa, typ, zakres, sumy i walidacja (EDT-13)', async ({ page }) => {
  test.setTimeout(60_000);
  const dialog = await openCategories(page);
  const panel = panelOf(dialog);
  const next = dialog.getByRole('button', { name: 'Dalej' });
  await expect(dialog.getByText('Kategoria 1 z 6')).toBeVisible();
  await expect(dialog.getByRole('textbox', { name: 'Nazwa' })).toHaveValue('Gracze');
  await expect(dialog.getByRole('radio', { name: 'Nazwa gracza' })).toBeChecked();
  await expect(next).toBeEnabled();
  await noHorizontalOverflow(page);
  expect(await axe(page)).toEqual([]);

  // Kliknięcie wiersza na kartce wybiera kategorię (kartka jest listą kategorii).
  await editorEl(page).locator('[data-cat="1"]').click();
  await expect(dialog.getByText('Kategoria 2 z 6')).toBeVisible();
  await expect(editorEl(page).locator('[data-badge="1"]')).toHaveClass(/\bon\b/);
  const name = dialog.getByRole('textbox', { name: 'Nazwa' });
  await name.fill('Ptaki');
  await expect.poll(async () => (await exported(page)).lines[1]?.label).toBe('Ptaki');

  // Zakres: min–max–krok, potem lista wartości i dowolny.
  await dialog.getByRole('textbox', { name: 'Max' }).fill('120');
  await dialog.getByRole('textbox', { name: 'Krok' }).fill('5');
  await expect
    .poll(async () => (await exported(page)).lines[1])
    .toMatchObject({ min: 0, max: 120, step: 5 });
  // Min większe od max: problem przy polu i wyłączone „Dalej”.
  await dialog.getByRole('textbox', { name: 'Min' }).fill('200');
  await expect(
    dialog.getByText(/Kategoria „Ptaki”: min nie może być większe od max/).first(),
  ).toBeVisible();
  await expect(next).toBeDisabled();
  await dialog.getByRole('textbox', { name: 'Min' }).fill('0');
  await expect(next).toBeEnabled();
  await panel.getByText('Lista wartości', { exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Dozwolone wartości' }).fill('0, 3, 7');
  await expect
    .poll(async () => (await exported(page)).lines[1])
    .toMatchObject({ values: [0, 3, 7] });
  await dialog.getByRole('textbox', { name: /^Opis/ }).fill('Punkty za ptaki na planszy');
  await expect
    .poll(async () => (await exported(page)).lines[1]?.hint)
    .toBe('Punkty za ptaki na planszy');

  // Ostatnia kategoria jako suma kategorii 2–4 (bez 5).
  for (let i = 0; i < 4; i++)
    await dialog.getByRole('button', { name: 'Następna kategoria' }).click();
  await expect(dialog.getByText('Kategoria 6 z 6')).toBeVisible();
  await panel.getByText('Suma', { exact: true }).click();
  await expect(dialog.getByRole('textbox', { name: 'Nazwa' })).toHaveValue('Suma');
  const sums = dialog.getByRole('group', { name: 'Sumuje kategorie' });
  await expect(sums.getByRole('checkbox')).toHaveCount(4);
  await sums.getByText('Kategoria 5', { exact: true }).click();
  const ids = (await exported(page)).lines.map((l) => l.id);
  await expect
    .poll(async () => (await exported(page)).lines[5])
    .toMatchObject({ kind: 'total', of: ids.slice(1, 4) });

  // Dokładnie jedna nazwa gracza: druga blokuje „Dalej” z komunikatem.
  await dialog.getByRole('button', { name: 'Poprzednia kategoria' }).click();
  await panel.getByText('Nazwa gracza', { exact: true }).click();
  await expect(
    dialog.getByText('Notes musi mieć dokładnie jedną kategorię typu „Nazwa gracza”.'),
  ).toBeVisible();
  await expect(next).toBeDisabled();
  await panel.getByText('Punktacja', { exact: true }).click();
  await expect(next).toBeEnabled();
  expect(await issues(page)).toEqual([]);
  await noHorizontalOverflow(page);
  expect(await axe(page)).toEqual([]);

  await next.click();
  await expect(editorEl(page).locator('.spe.wizard')).toHaveAttribute('data-step', '4');
  await expect(dialog.getByRole('group', { name: 'Test notesu' })).toBeVisible();
});

test('wygrana i remisy: kategoria decydująca, kierunek i reguły (EDT-2…EDT-4, EDT-7)', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const dialog = await openCategories(page);
  const panel = panelOf(dialog);
  // Kategoria 6 jako suma, kategoria 2 nazwana.
  const rename = async (index: number, label: string) => {
    await editorEl(page).locator(`[data-cat="${index}"]`).click();
    await expect(dialog.getByText(`Kategoria ${index + 1} z 6`)).toBeVisible();
    await dialog.getByRole('textbox', { name: 'Nazwa' }).fill(label);
    await expect.poll(async () => (await exported(page)).lines[index]?.label).toBe(label);
  };
  // Do ostatniej kategorii nawigatorem (na telefonie dolny wiersz kartki bywa pod stopką).
  for (let i = 0; i < 5; i++)
    await dialog.getByRole('button', { name: 'Następna kategoria' }).click();
  await expect(dialog.getByText('Kategoria 6 z 6')).toBeVisible();
  await panel.getByText('Suma', { exact: true }).click();
  await rename(1, 'Ptaki');
  await rename(2, 'Jajka');

  await dialog.getByRole('tab', { name: 'Wygrana i remisy' }).click();
  // Domyślnie decyduje suma (EDT-2) i więcej = lepiej (EDT-3).
  await expect(
    dialog.getByRole('button', { name: /^Kategoria decydująca o miejscu/ }),
  ).toContainText('Suma');
  await expect(dialog.getByRole('radio', { name: 'Więcej = lepiej' })).toBeChecked();
  await expect(editorEl(page).locator('[data-badge="5"] path')).toHaveCount(1);
  await noHorizontalOverflow(page);
  expect(await axe(page)).toEqual([]);

  // Kategoria decydująca: punktacja „Ptaki”, mniej = lepiej.
  await choose(page, dialog, /^Kategoria decydująca o miejscu/, 'Ptaki');
  await panel.getByText('Mniej = lepiej', { exact: true }).click();
  const lines = (await exported(page)).lines;
  const id = (label: string) => lines.find((l) => l.label === label)?.id;
  await expect
    .poll(async () => (await exported(page)).ranking)
    .toEqual({ line: id('Ptaki'), dir: 'asc', tiebreak: [] });

  // Dwie reguły remisów: „Jajka” (więcej = lepiej), potem suma (mniej = lepiej).
  await dialog.getByRole('button', { name: 'Dodaj regułę' }).click();
  const editor = dialog.locator('.wizard-rule--editing');
  await choose(page, editor, /^Kategoria reguły/, 'Jajka');
  await editor.getByRole('button', { name: 'Dodaj' }).click();
  await dialog.getByRole('button', { name: 'Dodaj regułę' }).click();
  await choose(page, editor, /^Kategoria reguły/, 'Suma');
  await editor.getByText('Mniej = lepiej', { exact: true }).click();
  await editor.getByRole('button', { name: 'Dodaj' }).click();
  const rules = dialog.getByRole('list', { name: 'Remisy' });
  await expect(rules.locator('.wizard-rule__title')).toHaveText([
    'Jajka',
    'Suma',
    'Wspólne miejsce',
  ]);
  await expect
    .poll(async () => (await exported(page)).ranking)
    .toEqual({
      line: id('Ptaki'),
      dir: 'asc',
      tiebreak: [
        { type: 'line', line: id('Jajka'), dir: 'desc' },
        { type: 'line', line: id('Suma'), dir: 'asc' },
      ],
    });
  // Kartka: puchar przy kategorii decydującej, numery reguł przy kategoriach remisów.
  const ptaki = lines.findIndex((l) => l.label === 'Ptaki');
  await expect(editorEl(page).locator(`[data-badge="${ptaki}"] path`)).toHaveCount(1);
  await expect(editorEl(page).locator('.spe-cat-badge.rule text')).toHaveText(['1', '2']);

  // Kolejność reguł i usunięcie.
  await dialog.getByRole('button', { name: 'Przesuń regułę 2 wyżej' }).click();
  await expect(rules.locator('.wizard-rule__title')).toHaveText([
    'Suma',
    'Jajka',
    'Wspólne miejsce',
  ]);
  await dialog.getByRole('button', { name: 'Usuń regułę 1' }).click();
  await expect(rules.locator('.wizard-rule__title')).toHaveText(['Jajka', 'Wspólne miejsce']);
  await expect
    .poll(async () => (await exported(page)).ranking?.tiebreak)
    .toEqual([{ type: 'line', line: id('Jajka'), dir: 'desc' }]);
  await noHorizontalOverflow(page);
  expect(await axe(page)).toEqual([]);

  // Kategoria reguły zmieniona na puste pole: reguła znika (EDT-7: szablon zostaje poprawny).
  await dialog.getByRole('tab', { name: 'Kategorie' }).click();
  await editorEl(page).locator('[data-cat="2"]').click();
  await expect(dialog.getByText('Kategoria 3 z 6')).toBeVisible();
  await panel.getByText('Puste pole', { exact: true }).click();
  await expect.poll(async () => (await exported(page)).ranking?.tiebreak).toEqual([]);
  expect(await issues(page)).toEqual([]);
  await expect(dialog.getByRole('button', { name: 'Dalej' })).toBeEnabled();
});
