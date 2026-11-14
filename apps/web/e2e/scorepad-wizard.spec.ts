import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { png } from './support/png';
import { mockGame, mockSupabase, session, storeSession } from './support/supabaseMock';

/**
 * Kreator edytora notesu (PRD §5.5.2, EDT-1, EDT-9, DS §18, zadanie [016]): pięć kroków,
 * walidacja przejścia, powrót bez utraty danych, zdjęcie z pliku, przeciągnięcia, schowka,
 * aparatu telefonu i kamery komputera, import `.json` i ochrona przed utratą zmian.
 * API Supabase jest atrapą; każdy test przechodzi na 360 px i na desktopie, w obu motywach.
 */

const GAME = mockGame(1, 'Żółwie Wyścigi');
const WIZARD = `/?p=game/${GAME.id}/scorepads/new`;
const PHOTO = { name: 'kartka.png', mimeType: 'image/png', buffer: png(480, 640) };

/**
 * Otwiera kreator. `fromList`: z listy notesów gry („Dodaj notes”), więc kreator ma własny wpis
 * historii i Wstecz w przeglądarce wraca do listy; bez tego prosto z adresu.
 */
async function openWizard(page: Page, fromList = false) {
  await mockSupabase(page, { club: { name: 'Planszówki', logo_path: null }, games: [GAME] });
  await storeSession(page, session());
  if (fromList) {
    await page.goto(`/?p=game/${GAME.id}/scorepads`);
    await page
      .getByRole('dialog', { name: 'Notesy' })
      .getByRole('button', { name: 'Dodaj notes' })
      .click();
  } else {
    await page.goto(WIZARD);
  }
  const dialog = page.getByRole('dialog', { name: 'Nowy notes' });
  await expect(dialog.getByText('Dobre zdjęcie kartki')).toBeVisible();
  // Edytor ładuje się leniwie; przyciski działają po jego załadowaniu.
  await expect(dialog.getByRole('button', { name: 'Wybierz plik' })).toBeEnabled();
  return dialog;
}

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
    // Shadow DOM edytora (kroki 2–3) i notesu (krok 5) ma własne style z POC; sprawdzamy ramę.
    .exclude('score-pad-editor')
    .exclude('score-pad')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  return results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`);
}

const isMobile = (page: Page) => (page.viewportSize()?.width ?? 0) < 768;

test('pięć kroków, walidacja, powrót bez utraty danych i ochrona przed utratą zmian', async ({
  page,
}) => {
  const errors = trackErrors(page);
  const dialog = await openWizard(page, true);
  const next = dialog.getByRole('button', { name: 'Dalej' });
  await expect(next).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Wstecz' })).toHaveCount(0);
  if (isMobile(page)) {
    await expect(dialog.getByText('Krok 1 z 5')).toBeVisible();
    await expect(dialog.getByRole('navigation', { name: 'Kroki edytora notesu' })).toBeHidden();
  } else {
    const box = await dialog.boundingBox();
    expect(Math.round(box?.width ?? 0)).toBe(1120);
    const steps = dialog.getByRole('navigation', { name: 'Kroki edytora notesu' });
    await expect(steps.getByRole('button')).toHaveText([
      '1.Zdjęcie',
      '2.Obszar kartki',
      '3.Mapowanie pól',
      '4.Kategorie',
      '5.Test i zapis',
    ]);
    await expect(dialog.getByText('Krok 1 z 5')).toBeHidden();
  }
  await noHorizontalOverflow(page);
  expect(await axe(page)).toEqual([]);

  // Bez zmian zamknięcie nie pyta.
  await dialog.getByLabel('Wybierz plik').setInputFiles(PHOTO);
  await expect(dialog.getByRole('img', { name: 'Wczytane zdjęcie kartki' })).toBeVisible();
  await expect(next).toBeEnabled();
  await next.click();
  await expect(page.locator('score-pad-editor .spe.wizard')).toHaveAttribute('data-step', '2');
  await expect(page.locator('score-pad-editor .spe-rail')).toBeHidden();
  if (isMobile(page)) await expect(dialog.getByText('Krok 2 z 5')).toBeVisible();
  await noHorizontalOverflow(page);

  await next.click();
  await expect(page.locator('score-pad-editor .spe.wizard')).toHaveAttribute('data-step', '3');
  await noHorizontalOverflow(page);

  // Wstecz do zdjęcia: zdjęcie zostaje, mapowanie też (pole w kroku 3 nadal zaznaczone).
  await dialog.getByRole('button', { name: 'Wstecz' }).click();
  await dialog.getByRole('button', { name: 'Wstecz' }).click();
  await expect(dialog.getByRole('img', { name: 'Wczytane zdjęcie kartki' })).toBeVisible();
  await next.click();
  await next.click();
  await expect(page.locator('score-pad-editor .spe.wizard')).toHaveAttribute('data-step', '3');

  // Niezapisane zmiany: × pyta, Esc zamyka tylko pytanie, „Odrzuć zmiany” zamyka kreator.
  await dialog.getByRole('button', { name: 'Zamknij' }).click();
  const confirm = page.getByRole('dialog', { name: 'Odrzucić zmiany?' });
  await expect(confirm).toBeVisible();
  await expect(confirm.getByRole('button', { name: 'Wróć do edycji' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(confirm).toHaveCount(0);
  await expect(dialog).toBeVisible();

  // Wstecz w przeglądarce też pyta i zostawia kreator otwarty.
  await page.goBack();
  await expect(confirm).toBeVisible();
  expect(new URL(page.url()).search).toContain('scorepads/new');
  await confirm.getByRole('button', { name: 'Odrzuć zmiany' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Notesy' })).toBeVisible();
  expect(new URL(page.url()).search).not.toContain('scorepads/new');
  expect(errors).toEqual([]);
});

test('zdjęcie przeciągnięte i wklejone ze schowka; zły plik z komunikatem', async ({ page }) => {
  const dialog = await openWizard(page);
  await dialog.getByLabel('Wybierz plik').setInputFiles({
    name: 'opis.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('to nie zdjęcie'),
  });
  await expect(dialog.getByText(/Ten plik nie jest zdjęciem/)).toBeVisible();

  const bytes = [...PHOTO.buffer];
  await page.evaluate((data) => {
    const file = new File([new Uint8Array(data)], 'kartka.png', { type: 'image/png' });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    const stage = document.querySelector('.wizard-stage');
    stage?.dispatchEvent(new DragEvent('dragenter', { bubbles: true, dataTransfer: transfer }));
    stage?.dispatchEvent(
      new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }),
    );
  }, bytes);
  await expect(dialog.getByRole('img', { name: 'Wczytane zdjęcie kartki' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Dalej' })).toBeEnabled();
  const first = await dialog
    .getByRole('img', { name: 'Wczytane zdjęcie kartki' })
    .getAttribute('src');

  await page.evaluate(
    (data) => {
      const file = new File([new Uint8Array(data)], 'schowek.png', { type: 'image/png' });
      const transfer = new DataTransfer();
      transfer.items.add(file);
      document.dispatchEvent(
        new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: transfer }),
      );
    },
    [...png(300, 500)],
  );
  await expect(dialog.getByRole('img', { name: 'Wczytane zdjęcie kartki' })).not.toHaveAttribute(
    'src',
    first ?? '',
  );
});

test('import pliku .json w kroku 1: wszystkie kroki wykonane', async ({ page }) => {
  const dialog = await openWizard(page);
  const photo = `data:image/png;base64,${png(300, 420).toString('base64')}`;
  const file = {
    format: 'score-pad',
    version: 2,
    template: {
      v: 2,
      id: 'n-plik',
      name: 'Z pliku',
      size: { w: 10, h: 14 },
      tape: '#2c3a46',
      image: photo,
      grid: { x: [0, 0.25, 0.5, 0.75, 1], y: [0, 0.5, 1], players: 'cols', labels: 1 },
      lines: [
        { id: 'names', label: 'Gracze', kind: 'names' },
        { id: 'a', label: 'Punkty', kind: 'input', free: true },
      ],
    },
  };
  await dialog.getByLabel('Plik notesu (.json)').setInputFiles({
    name: 'notes.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(file)),
  });
  await expect(dialog.getByText(/Wczytano notes Z pliku z pliku/)).toBeVisible();
  if (!isMobile(page)) {
    const steps = dialog.getByRole('navigation', { name: 'Kroki edytora notesu' });
    await expect(steps.getByRole('button', { name: 'Kategorie (ukończony)' })).toBeEnabled();
    await steps.getByRole('button', { name: '5. Test i zapis' }).click();
  } else {
    for (let i = 0; i < 4; i += 1) await dialog.getByRole('button', { name: 'Dalej' }).click();
  }
  await expect(dialog.getByRole('group', { name: 'Test notesu' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Zapisz notes' })).toBeEnabled();
  await noHorizontalOverflow(page);
  expect(await axe(page)).toEqual([]);
});

test('brak dostępu do kamery zostawia ścieżkę z plikiem', async ({ page, context }) => {
  test.skip(isMobile(page), 'Na telefonie „Zrób zdjęcie” otwiera aparat systemowy.');
  await context.clearPermissions();
  const dialog = await openWizard(page);
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = () =>
      Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
  });
  await dialog.getByRole('button', { name: 'Zrób zdjęcie' }).click();
  await expect(dialog.getByText(/Brak dostępu do kamery/)).toBeVisible();
  await dialog
    .locator('.banner')
    .getByRole('button', { name: 'Wybierz plik' })
    .click({ trial: true });
});
