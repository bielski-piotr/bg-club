import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { png } from './support/png';
import {
  ADA,
  member,
  mockGame,
  mockMeeting,
  mockSupabase,
  session,
  storeSession,
  SUPABASE_URL,
  type MockPlay,
  type MockScorepad,
} from './support/supabaseMock';

/**
 * PWA i bezpieczne aktualizacje: manifest i ikony do
 * instalacji, service worker z cache samej powłoki (bez danych Supabase, także po wylogowaniu),
 * start bez sieci z jasnym komunikatem zamiast udawanej pracy offline oraz nowa wersja, która
 * czeka z odświeżeniem, aż szkic partii zapisze się w bazie, a po odświeżeniu notes wraca
 * z wpisami. Każdy test przechodzi na 360 px i na desktopie, w motywie jasnym i ciemnym.
 */

test.use({ serviceWorkers: 'allow' });

const NOW = new Date('2026-11-12T19:00:00Z');
const CLUB = { name: 'Planszówki', logo_path: null, timezone: 'Europe/Warsaw' };
const BEA = member(2, 'Bea', 'Bobrowska');
const CEZARY = member(3, 'Cezary', 'Cichy');
const AZUL = mockGame(1, 'Azul');
const GRID = { x: [0, 0.2, 0.4, 0.6, 0.8, 1], y: [0, 0.25, 0.5, 0.75, 1] };
const PAD: MockScorepad = {
  id: '00000000-0000-4000-d000-000000000001',
  game_id: AZUL.id,
  name: 'Azul podstawowy',
  created_at: '2026-11-01T12:00:00Z',
  current: {
    id: '00000000-0000-4000-e000-000000000001',
    version: 1,
    image_path: `${AZUL.id}/azul.png`,
    player_slots: 4,
    created_at: '2026-11-01T12:00:00Z',
  },
  template: {
    v: 2,
    id: '00000000-0000-4000-d000-000000000001',
    name: 'Azul podstawowy',
    size: { w: 10, h: 14 },
    tape: '#161A2B',
    grid: { ...GRID, players: 'cols', labels: 1 },
    lines: [
      { id: 'n', label: 'Gracze', kind: 'names' },
      { id: 'a', label: 'Płytki', kind: 'input', min: 0, max: 99 },
      { id: 'b', label: 'Premie', kind: 'input', min: 0, max: 99 },
      { id: 's', label: 'Suma', kind: 'total', of: ['a', 'b'] },
    ],
  },
  image: png(300, 420),
};
const RUNNING = mockMeeting(6, 'Czwartkowe granie', {
  status: 'in_progress',
  voting_open: false,
  starts_at: '2026-11-12T17:00:00Z',
  started_at: '2026-11-12T17:05:00Z',
  participants: [ADA.id, BEA.id, CEZARY.id],
  host_id: BEA.id,
});
const PLAY_ID = '00000000-0000-4000-f000-000000000001';
const PLAY: MockPlay = {
  id: PLAY_ID,
  meeting_id: RUNNING.id,
  status: 'draft',
  started_at: '2026-11-12T18:30:00Z',
  saved_at: null,
  game_id: AZUL.id,
  scorepad_id: PAD.id,
  play_results: [
    { profile_id: BEA.id, is_win: null, seat: 1 },
    { profile_id: CEZARY.id, is_win: null, seat: 2 },
  ],
};
const padPath = `/?p=meeting/${RUNNING.id}&p=play/${PLAY_ID}`;
const OFFLINE =
  'Brak połączenia z internetem. BG Club potrzebuje sieci; wpisy w notesie czekają na tym urządzeniu.';

async function openApp(page: Page, path = '/', plays: MockPlay[] = []) {
  await page.clock.setFixedTime(NOW);
  const mock = await mockSupabase(page, {
    club: CLUB,
    members: [BEA, CEZARY],
    games: [{ ...AZUL }],
    scorepads: [PAD],
    meetings: [{ ...RUNNING }],
    plays,
  });
  await storeSession(page, session());
  await page.goto(path);
  return mock;
}

/** Czeka, aż service worker przejmie stronę (po instalacji `clients.claim`). */
async function controlled(page: Page) {
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, {
    timeout: 15_000,
  });
}

async function cachedUrls(page: Page) {
  return page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) urls.push(request.url);
    }
    return urls;
  });
}

/**
 * Nowa wersja na serwerze, jak po wdrożeniu. Playwright nie przechwytuje pobrania skryptu
 * workera, więc „serwer” po wdrożeniu podaje skrypt pod innym adresem (`/sw.js?next`) w tej
 * samej rejestracji: przeglądarka instaluje go jako aktualizację i zostawia czekającego.
 * Rejestracje aplikacji po przeładowaniu też dostają nowy adres, jak na prawdziwym serwerze.
 */
async function deployNewVersion(page: Page) {
  await page.addInitScript(() => {
    const container = navigator.serviceWorker;
    const register = container.register.bind(container);
    container.register = (url, options) =>
      register(String(url) === '/sw.js' ? '/sw.js?next' : url, options);
  });
  await page.evaluate(async () => {
    await navigator.serviceWorker.register('/sw.js?next', { scope: '/' });
  });
}

async function axe(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .exclude('score-pad')
    .analyze();
  return results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`);
}

test('manifest i ikony pozwalają zainstalować aplikację', async ({ page }) => {
  await openApp(page);
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    'href',
    '/manifest.webmanifest',
  );
  const response = await page.request.get('/manifest.webmanifest');
  expect(response.ok()).toBe(true);
  const manifest = (await response.json()) as {
    name: string;
    lang: string;
    start_url: string;
    display: string;
    icons: { src: string; sizes: string; type: string; purpose: string }[];
  };
  expect(manifest).toMatchObject({
    name: 'BG Club',
    lang: 'pl',
    start_url: '/',
    display: 'standalone',
  });
  for (const size of [192, 512]) {
    expect(manifest.icons).toContainEqual(
      expect.objectContaining({ sizes: `${size}x${size}`, type: 'image/png', purpose: 'any' }),
    );
  }
  expect(manifest.icons).toContainEqual(expect.objectContaining({ purpose: 'maskable' }));
  const appleIcon = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
  for (const src of [...manifest.icons.map((i) => i.src), appleIcon ?? '']) {
    const icon = await page.request.get(src);
    expect(icon.ok(), src).toBe(true);
    if (src.endsWith('.png')) {
      const body = await icon.body();
      const [w, h] = [body.readUInt32BE(16), body.readUInt32BE(20)];
      const declared = manifest.icons.find((i) => i.src === src)?.sizes ?? '180x180';
      expect(`${w}x${h}`).toBe(declared);
    }
  }
  // Warunek instalacji: strona pod kontrolą service workera.
  await controlled(page);
  expect(await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toMatch(
    /\/sw\.js$/,
  );
});

test('bez sieci startuje powłoka z jasnym komunikatem; cache nie ma danych konta, także po wylogowaniu', async ({
  page,
  context,
}) => {
  test.slow();
  await openApp(page);
  await expect(page.getByRole('heading', { name: 'Planszówki' })).toBeVisible();
  await controlled(page);
  // Pliki ładowane przez stronę pod kontrolą workera (fonty, leniwe części) też trafiają do cache.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Planszówki' })).toBeVisible();

  await context.setOffline(true);
  await page.reload();
  // Powłoka z cache i komunikat zamiast udawanej pracy offline.
  await expect(page.getByRole('status').filter({ hasText: OFFLINE })).toBeVisible();
  expect(await axe(page)).toEqual([]);
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.getByText(OFFLINE)).toHaveCount(0);

  await page.reload();
  await page.getByRole('button', { name: 'Twoje konto: Ada Adminowska' }).click();
  await page.getByRole('menuitem', { name: 'Mój profil' }).click();
  await page
    .getByRole('dialog', { name: 'Profil' })
    .getByRole('button', { name: 'Ustawienia' })
    .click();
  await page
    .getByRole('dialog', { name: 'Ustawienia' })
    .getByRole('button', { name: 'Wyloguj się' })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Zaloguj się' })).toBeVisible();

  const urls = await cachedUrls(page);
  const origin = new URL(page.url()).origin;
  expect(urls.length).toBeGreaterThan(0);
  // Tylko powłoka z tego originu: bez API, Auth i Storage Supabase.
  for (const url of urls) {
    expect(url.startsWith(SUPABASE_URL), url).toBe(false);
    expect(new URL(url).origin).toBe(origin);
    expect(new URL(url).pathname).toMatch(
      /^\/(|manifest\.webmanifest|favicon\.svg|icons\/.+\.png|assets\/.+)$/,
    );
  }
  // Powłoka nie zawiera danych klubu ani konta.
  const shell = await page.evaluate(async () => {
    const response = await caches.match('/');
    return response ? response.text() : '';
  });
  expect(shell).toContain('<div id="root"></div>');
  expect(shell).not.toContain('Ada');
  expect(shell).not.toContain('Planszówki');
});

test('nowa wersja czeka, aż szkic zapisze się w bazie; po odświeżeniu notes wraca z wpisami', async ({
  page,
}) => {
  test.slow();
  const mock = await openApp(page, padPath, [{ ...PLAY }]);
  const popup = page.getByRole('dialog', { name: 'Azul' });
  const pad = page.locator('score-pad');
  await expect(pad.locator('.sp.ready')).toBeVisible({ timeout: 15_000 });
  await controlled(page);

  // Brak sieci przy zapisie szkicu: wpisy czekają na urządzeniu.
  mock.options.draftOffline = true;
  await page.evaluate(() => {
    type El = HTMLElement & {
      pad: { setSheet(s: unknown): void; exportConfig(o: { sheet: boolean }): { sheet: unknown } };
    };
    const element = document.querySelector<El>('score-pad');
    if (!element) throw new Error('Brak notesu');
    const current = element.pad.exportConfig({ sheet: true }).sheet as { names: unknown };
    element.pad.setSheet({ game: 1, names: current.names, cells: { a: [7, 3, null, null] } });
  });
  await expect(popup.getByRole('status')).toHaveText(
    'Brak połączenia. Wpisy są bezpieczne na tym urządzeniu i zapiszą się same.',
    { timeout: 5000 },
  );

  // Wdrożenie nowej wersji w trakcie partii.
  await deployNewVersion(page);
  const update = page.getByRole('status').filter({ hasText: 'Dostępna nowa wersja aplikacji.' });
  await expect(update).toBeVisible({ timeout: 15_000 });
  await expect(update).toContainText('Odświeżysz, gdy szkic partii zapisze się w bazie.');
  const reload = update.getByRole('button', { name: 'Odśwież' });
  await expect(reload).toBeDisabled();
  expect(await axe(page)).toEqual([]);

  // Sieć wraca: szkic w bazie, odświeżenie możliwe.
  mock.options.draftOffline = false;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(popup.getByRole('status')).toHaveText('Szkic zapisany', { timeout: 10_000 });
  expect(mock.draftSaves.at(-1)).toMatchObject({
    sheet: { cells: { a: [7, 3, null, null] } },
  });
  await expect(reload).toBeEnabled();
  await expect(update).not.toContainText('Odświeżysz');

  await Promise.all([page.waitForEvent('load'), reload.click()]);
  // Ta sama partia po odświeżeniu, wpisy z bazy, nowa wersja aktywna.
  await expect(page.getByRole('dialog', { name: 'Azul' })).toBeVisible();
  await expect(pad.locator('.sp.ready')).toBeVisible({ timeout: 15_000 });
  const cells = await page.evaluate(() => {
    type El = HTMLElement & {
      pad: { exportConfig(o: { sheet: boolean }): { sheet: { cells: Record<string, unknown[]> } } };
    };
    return document.querySelector<El>('score-pad')?.pad.exportConfig({ sheet: true }).sheet.cells;
  });
  expect(cells?.a?.slice(0, 2)).toEqual([7, 3]);
  await expect(page.getByText('Dostępna nowa wersja aplikacji.')).toHaveCount(0);
  expect(await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toMatch(
    /\/sw\.js\?next$/,
  );
});
