import { expect, test, type Page } from '@playwright/test';
import { png } from './support/png';
import { mockGame, mockSupabase, session, storeSession } from './support/supabaseMock';

/**
 * Krok „Zdjęcie” kreatora notesu: na komputerze kamera internetowa z podglądem, na
 * telefonie aparat systemowy (tylny). Chromium dostaje sztuczną kamerę i zgodę na jej użycie;
 * odmowę dostępu sprawdza `scorepad-wizard.spec.ts`.
 */

test.use({
  launchOptions: {
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  },
  permissions: ['camera'],
});

const GAME = mockGame(1, 'Żółwie Wyścigi');
const PHOTO = { name: 'kartka.png', mimeType: 'image/png', buffer: png(480, 640) };
const isMobile = (page: Page) => (page.viewportSize()?.width ?? 0) < 768;

async function openWizard(page: Page) {
  await mockSupabase(page, { club: { name: 'Planszówki', logo_path: null }, games: [GAME] });
  await storeSession(page, session());
  await page.goto(`/?p=game/${GAME.id}/scorepads/new`);
  const dialog = page.getByRole('dialog', { name: 'Nowy notes' });
  await expect(dialog.getByRole('button', { name: 'Wybierz plik' })).toBeEnabled();
  return dialog;
}

async function noHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
}

test('komputer: podgląd z kamery i zdjęcie; telefon: aparat systemowy (tylny)', async ({
  page,
}) => {
  const dialog = await openWizard(page);
  if (isMobile(page)) {
    const capture = dialog.getByLabel('Zrób zdjęcie', { exact: true }).and(page.locator('input'));
    await expect(capture).toHaveAttribute('capture', 'environment');
    const chooser = page.waitForEvent('filechooser');
    await dialog.getByRole('button', { name: 'Zrób zdjęcie' }).click();
    await (await chooser).setFiles(PHOTO);
  } else {
    await dialog.getByRole('button', { name: 'Zrób zdjęcie' }).click();
    const video = dialog.getByLabel('Podgląd z kamery').and(page.locator('video'));
    await expect(video).toBeVisible();
    await expect
      .poll(() => video.evaluate((v) => (v as HTMLVideoElement).videoWidth))
      .toBeGreaterThan(0);
    const toolbar = dialog.getByRole('toolbar', { name: 'Podgląd z kamery' });
    await toolbar.getByRole('button', { name: 'Zrób zdjęcie' }).click();
  }
  await expect(dialog.getByRole('img', { name: 'Wczytane zdjęcie kartki' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Dalej' })).toBeEnabled();
  await noHorizontalOverflow(page);
});
