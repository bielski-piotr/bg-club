// Ikony PWA z public/favicon.svg: `node scripts/icons.mjs` (wymaga Playwright/Chromium).
// Ikony z pełnym tłem (maskable, iOS) mają gradient na całej powierzchni bez zaokrągleń,
// a znak (`<g id="art">`) pomniejszony do bezpiecznej strefy maski.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const svg = readFileSync(new URL('../public/favicon.svg', import.meta.url), 'utf8');
const out = (name) => fileURLToPath(new URL(`../public/icons/${name}`, import.meta.url));
const fullBleed = (scale) =>
  svg
    .replaceAll(' rx="16"', '')
    .replace(
      '<g id="art">',
      `<g id="art" transform="translate(32 32) scale(${scale}) translate(-32 -32)">`,
    );

const icons = [
  { name: 'icon-192.png', size: 192, html: svg },
  { name: 'icon-512.png', size: 512, html: svg },
  // The safe zone is a circle of 40% of the size: the die corner must stay inside it.
  { name: 'icon-maskable-512.png', size: 512, html: fullBleed(0.72), opaque: true },
  // iOS rounds the corners itself: a full background without transparency.
  { name: 'apple-touch-icon.png', size: 180, html: fullBleed(0.88), opaque: true },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const icon of icons) {
  await page.setViewportSize({ width: icon.size, height: icon.size });
  await page.setContent(
    `<html><body style="margin:0">${icon.html.replace('<svg ', `<svg width="${icon.size}" height="${icon.size}" style="display:block" `)}</body></html>`,
  );
  await page.screenshot({ path: out(icon.name), omitBackground: !icon.opaque });
}
await browser.close();
