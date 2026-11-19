import { expect, test, type CDPSession, type Page } from '@playwright/test';
import {
  member,
  mockGame,
  mockSupabase,
  session,
  storeSession,
  SUPABASE_URL,
} from './support/supabaseMock';

/**
 * Pomiar wydajności. Tylko Chromium „mobile-light”: emulacja telefonu
 * średniej klasy przez CDP (CPU ×4, sieć jak „Slow 4G” w Lighthouse: RTT 150 ms, ≈ 1,6 Mb/s
 * w dół, 750 kb/s w górę) i opóźnienie API Supabase (atrapa) o RTT. Wyniki trafiają do
 * załączników testu i na konsolę; raport z pomiarami jest w opisie PR.
 *
 * Asercje są strażnikiem regresji z zapasem na wolniejsze maszyny CI, nie dowodem płynności
 * na realnym telefonie (to wymaga ręcznej weryfikacji, patrz raport).
 */

const RTT_MS = 150;
const SLOW_4G = {
  offline: false,
  latency: RTT_MS,
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
};
/** Spowolnienie CPU jak w profilu „mobile” Lighthouse. */
const CPU_SLOWDOWN = 4;
/** Widok Klubu interaktywny w < 2 s; na CI zapas ×1,5 na różnice maszyn. */
const HUB_INTERACTIVE_LIMIT_MS = process.env.CI ? 3000 : 2000;

test.skip(() => test.info().project.name !== 'mobile-light', 'jeden profil pomiarowy');

async function throttle(page: Page): Promise<CDPSession> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', SLOW_4G);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_SLOWDOWN });
  return cdp;
}

function report(name: string, value: unknown) {
  console.log(`[perf] ${name}: ${JSON.stringify(value)}`);
  test.info().annotations.push({ type: `perf: ${name}`, description: JSON.stringify(value) });
}

test('widok Klubu jest interaktywny w < 2 s przy 4G i CPU ×4', async ({ page }) => {
  const members = Array.from({ length: 12 }, (_, i) => member(i + 2, `Imię${i}`, `Nazwisko${i}`));
  const games = Array.from({ length: 40 }, (_, i) => mockGame(i + 1, `Gra ${i + 1}`));
  await mockSupabase(page, { members, games, club: { name: 'Planszówki', logo_path: null } });
  // Atrapa odpowiada od razu (page.route omija emulację sieci), więc dodajemy RTT na żądanie.
  await page.route(`${SUPABASE_URL}/**`, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, RTT_MS));
    await route.fallback();
  });
  await storeSession(page, session());
  // Chwila, w której hub ma dane wszystkich widżetów (licznik członków), mierzona w stronie
  // (rAF), a nie odpytywaniem Playwrighta. Do tego długie zadania głównego wątku (> 50 ms).
  await page.addInitScript(() => {
    const w = window as unknown as { __ready?: number; __longTasks: number[] };
    w.__longTasks = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) w.__longTasks.push(Math.round(entry.duration));
    }).observe({ type: 'longtask', buffered: true });
    const check = () => {
      if (document.body?.textContent?.includes('13 osób'))
        w.__ready = Math.round(performance.now());
      else requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  });
  await throttle(page);

  await page.goto('/', { waitUntil: 'commit' });
  const members_ = page.getByRole('region', { name: 'Członkowie', exact: true });
  await expect(page.getByRole('heading', { level: 1, name: 'Planszówki' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(members_.getByText('13 osób')).toBeVisible({ timeout: 15_000 });
  const timing = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    const paints = Object.fromEntries(
      performance.getEntriesByType('paint').map((e) => [e.name, Math.round(e.startTime)]),
    );
    const scripts = performance
      .getEntriesByType('resource')
      .filter((e) => e.name.endsWith('.js'))
      .map((e) => ({
        file: e.name.split('/').pop(),
        kb: Math.round((e as PerformanceResourceTiming).transferSize / 1024),
        end: Math.round((e as PerformanceResourceTiming).responseEnd),
      }));
    const api = performance
      .getEntriesByType('resource')
      .filter(
        (e) =>
          e.name.includes('/rest/') || e.name.includes('/auth/') || e.name.includes('/storage/'),
      )
      .map(
        (e) =>
          `${Math.round(e.startTime)}-${Math.round((e as PerformanceResourceTiming).responseEnd)} ${e.name.replace(/^https?:\/\/[^/]+/, '').slice(0, 60)}`,
      );
    const w = window as unknown as { __ready?: number; __longTasks: number[] };
    return {
      ready: w.__ready ?? Infinity,
      longTasks: w.__longTasks,
      api,
      domContentLoaded: Math.round(nav.domContentLoadedEventEnd),
      ...paints,
      scripts,
    };
  });
  // Klik w widżet od razu otwiera popup: hub reaguje (nie czeka na fragmenty pakietu).
  report('hub', timing);
  expect(timing.scripts.some((s) => /register-(pad|editor)|three/.test(s.file ?? ''))).toBe(false);
  expect(timing.ready).toBeLessThan(HUB_INTERACTIVE_LIMIT_MS);
});
