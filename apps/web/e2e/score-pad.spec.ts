import { expect, test, type Page } from '@playwright/test';

/**
 * Notes i edytor z pakietu `@bg-club/score-pad` (zadanie [013]) w galerii /design-system:
 * leniwe ładowanie (NFR-2), Three.js i fonty z paczki zamiast CDN, tryb klubowy (PAD-1),
 * motyw aplikacji i notes z 10 miejscami dla graczy (EDT-8).
 */

/** Żądania do hostów spoza aplikacji (CDN Three.js, Google Fonts z POC). */
function trackExternalRequests(page: Page) {
  const external: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol.startsWith('http') && url.hostname !== '127.0.0.1') external.push(url.href);
  });
  return external;
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

test.beforeEach(async ({ page }) => {
  await page.goto('/design-system');
  await expect(page.getByRole('heading', { level: 2, name: 'Notes i edytor' })).toBeVisible();
});

test('notes ładuje się dopiero po kliknięciu, bez CDN i bez lokalnej biblioteki POC', async ({
  page,
}) => {
  const external = trackExternalRequests(page);
  const errors = trackErrors(page);
  const scripts: string[] = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'script') scripts.push(new URL(request.url()).pathname);
  });

  // Przed kliknięciem nie ma ani elementu, ani chunka notesu.
  expect(await page.locator('score-pad').count()).toBe(0);
  expect(scripts.some((path) => path.includes('register-pad'))).toBe(false);

  await page.getByRole('button', { name: 'Pokaż notes' }).click();
  const region = page.getByRole('region', { name: 'Notes punktacji' });
  await expect(region).toHaveAttribute('aria-busy', 'false');
  const pad = page.locator('score-pad');
  // Kartka rozłożona: scena WebGL gotowa, pasek pokazuje przykładowy notes.
  await expect(pad.locator('.sp.ready')).toBeVisible({ timeout: 15_000 });
  await expect(pad.locator('.tpl-name')).toHaveText('Notes testowy');
  expect(scripts.some((path) => path.includes('register-pad'))).toBe(true);

  const state = await page.evaluate(async () => {
    type PadElement = Element & { pad?: { exportConfig(): { template?: unknown } } | null };
    const element = document.querySelector<PadElement & HTMLElement>('score-pad');
    const config = element?.pad?.exportConfig();
    const template = config?.template as { grid?: { x: number[]; labels: number } } | undefined;
    const databases = (await indexedDB.databases?.()) ?? [];
    return {
      seats: template?.grid ? template.grid.x.length - 1 - template.grid.labels : 0,
      // Menu notesu zawiera tylko przekazany notes: bez wbudowanych i bez lokalnej biblioteki.
      menu: [...(element?.shadowRoot?.querySelectorAll('.menu-item b') ?? [])].map(
        (b) => b.textContent,
      ),
      storage: Object.keys(localStorage).filter((key) => key.startsWith('score-pad')),
      indexedDb: databases.map((db) => db.name),
    };
  });
  expect(state).toEqual({ seats: 10, menu: ['Notes testowy'], storage: [], indexedDb: [] });

  await noHorizontalOverflow(page);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);

  // Zamknięcie podglądu usuwa element (notes wywołuje destroy()).
  await page.getByRole('button', { name: 'Pokaż notes' }).click();
  await expect(pad).toHaveCount(0);
});

test('notes i edytor dostają motyw aplikacji', async ({ page }, testInfo) => {
  const systemTheme = testInfo.project.use.colorScheme === 'dark' ? 'dark' : 'light';
  const other = systemTheme === 'dark' ? 'light' : 'dark';

  await page.getByRole('button', { name: 'Pokaż notes' }).click();
  const pad = page.locator('score-pad');
  await expect(pad).toHaveAttribute('theme', systemTheme);
  await expect(pad.locator('.sp')).toHaveAttribute('data-theme', systemTheme);

  await page
    .getByRole('group', { name: 'Motyw' })
    .getByText(other === 'dark' ? 'Ciemny' : 'Jasny', { exact: true })
    .click();
  await expect(pad).toHaveAttribute('theme', other);
  await expect(pad.locator('.sp')).toHaveAttribute('data-theme', other);

  await page.getByRole('button', { name: 'Pokaż edytor' }).click();
  await expect(pad).toHaveCount(0);
  const editor = page.locator('score-pad-editor');
  await expect(editor).toHaveAttribute('theme', other);
  await expect(editor.locator('.spe')).toHaveClass(new RegExp(`\\b${other}\\b`));
  await noHorizontalOverflow(page);
});

test('edytor ładuje się leniwie, bez CDN i bez błędów', async ({ page }) => {
  const external = trackExternalRequests(page);
  const errors = trackErrors(page);
  await page.getByRole('button', { name: 'Pokaż edytor' }).click();
  const region = page.getByRole('region', { name: 'Edytor notesu' });
  await expect(region).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('score-pad-editor .spe')).toBeVisible();
  await noHorizontalOverflow(page);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});
