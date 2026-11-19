import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const isCI = Boolean(process.env.CI);

/**
 * E2E na zbudowanej aplikacji (`vite preview`). Każdy test przechodzi na telefonie (360 px)
 * i desktopie, w motywie jasnym i ciemnym.
 * API jest atrapą przechwytywaną przez page.route. Reguły backendu sprawdzają osobne
 * testy SQL oraz integracja Auth/API na lokalnym Supabase.
 */
const env = {
  VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321',
  VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY ?? 'e2e-placeholder-anon-key',
};

const mobile = { viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true };
const desktop = { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } };

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // WebGL uses software rendering in headless Chromium. Multiple browser workers
  // compete for CPU and invalidate the performance measurement; CLI can override this.
  workers: 1,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: 'pl-PL',
    trace: 'off',
    // Service worker mógłby ominąć atrapy `page.route`; włącza go tylko e2e/pwa.spec.ts.
    serviceWorkers: 'block',
    // Animacje i przejścia kończą się od razu (base.css, prefers-reduced-motion), więc
    // axe nie mierzy kontrastu w trakcie zanikania popupu ani zmiany koloru przycisku.
    reducedMotion: 'reduce',
  },
  projects: [
    { name: 'mobile-light', use: { ...mobile, colorScheme: 'light' } },
    { name: 'mobile-dark', use: { ...mobile, colorScheme: 'dark' } },
    { name: 'desktop-light', use: { ...desktop, colorScheme: 'light' } },
    { name: 'desktop-dark', use: { ...desktop, colorScheme: 'dark' } },
  ],
  webServer: {
    command: `pnpm build && pnpm preview --host 127.0.0.1 --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !isCI,
    timeout: 120_000,
    env,
  },
});
