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
 * Pomiar wydajności (NFR-2, zadanie [040]). Tylko Chromium „mobile-light”: emulacja telefonu
 * średniej klasy przez CDP (CPU ×4, sieć jak „Slow 4G” w Lighthouse: RTT 150 ms, ≈ 1,6 Mb/s
 * w dół, 750 kb/s w górę) i opóźnienie API Supabase (atrapa) o RTT. Wyniki trafiają do
 * załączników testu i na konsolę; raport z pomiarami jest w opisie PR zadania [040].
 *
 * Asercje są strażnikiem regresji z zapasem na wolniejsze maszyny CI, nie dowodem spełnienia
 * NFR-2 na realnym telefonie (to wymaga ręcznej weryfikacji, patrz raport).
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
/** NFR-2: widok Klubu interaktywny w < 2 s; na CI zapas ×1,5 na różnice maszyn. */
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

test('widok Klubu jest interaktywny w < 2 s przy 4G i CPU ×4 (NFR-2)', async ({ page }) => {
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

test('notes 3D: liczba klatek przy obrocie i zoomie (NFR-2, PAD-16)', async ({ page }) => {
  // WebGL w headless Chromium jest programowy (SwiftShader): wynik to dolna granica, bez CPU ×4.
  test.slow();
  await page.goto('/design-system');
  await page.getByRole('button', { name: 'Pokaż notes' }).click();
  const pad = page.locator('score-pad');
  await expect(pad.locator('.sp.ready')).toBeVisible({ timeout: 30_000 });
  const canvas = pad.locator('.stage canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Brak płótna notesu');

  const fps = async (gesture: () => Promise<void>) => {
    await page.evaluate(() => {
      const w = window as unknown as { __frames: number[]; __stop: boolean };
      w.__frames = [];
      w.__stop = false;
      const tick = (t: number) => {
        w.__frames.push(t);
        if (!w.__stop) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await gesture();
    return page.evaluate(() => {
      const w = window as unknown as { __frames: number[]; __stop: boolean };
      w.__stop = true;
      const f = w.__frames;
      const gaps = f
        .slice(1)
        .map((t, i) => t - (f[i] ?? t))
        .sort((a, b) => a - b);
      const span = (f.at(-1) ?? 0) - (f[0] ?? 0);
      return {
        fps: Math.round(((f.length - 1) * 1000) / Math.max(1, span)),
        p95FrameMs: Math.round(gaps[Math.floor(gaps.length * 0.95)] ?? 0),
      };
    });
  };

  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  // Obrót: przeciągnięcie jednym palcem (dotyk emulowany myszą lewym przyciskiem).
  const rotate = await fps(async () => {
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    for (let i = 0; i < 40; i += 1) await page.mouse.move(cx + Math.sin(i / 6) * 80, cy + i);
    await page.mouse.up();
  });
  const zoom = await fps(async () => {
    for (let i = 0; i < 20; i += 1) await page.mouse.wheel(0, i < 10 ? -120 : 120);
    await page.waitForTimeout(500);
  });
  const state = await page.evaluate(() => {
    type El = HTMLElement & { pad: { debug(): { texture: unknown; pixelRatio: number } } };
    return document.querySelector<El>('score-pad')?.pad.debug();
  });
  const gl = await page.evaluate(() => {
    const ctx = document.createElement('canvas').getContext('webgl2');
    const ext = ctx?.getExtension('WEBGL_debug_renderer_info');
    return {
      renderer: ext ? ctx?.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null,
      maxTextureSize: ctx?.getParameter(ctx.MAX_TEXTURE_SIZE),
    };
  });
  report('pad', { rotate, zoom, texture: state?.texture, pixelRatio: state?.pixelRatio, gl });
  // Strażnik: notes nie może się „zawiesić” (pomiar programowego GPU, nie cel 30/60 kl./s).
  expect(rotate.fps).toBeGreaterThan(5);
});
