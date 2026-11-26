// Ikony PWA (NFR-3) z public/favicon.svg: `node scripts/icons.mjs` (wymaga Playwright/Chromium).
// Ikona „maskable” ma tło na całej powierzchni i znak w bezpiecznej strefie (80% środka).
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const svg = readFileSync(new URL('../public/favicon.svg', import.meta.url), 'utf8');
const out = (name) => new URL(`../public/icons/${name}`, import.meta.url).pathname;
const dots = svg.replace(/<rect[^>]*\/>/, '');

const icons = [
  { name: 'icon-192.png', size: 192, html: svg, bg: 'transparent' },
  { name: 'icon-512.png', size: 512, html: svg, bg: 'transparent' },
  // Znak w 60% środka: kropki zostają w bezpiecznej strefie maski.
  { name: 'icon-maskable-512.png', size: 512, html: dots, bg: '#2F54EB', inset: 0.2 },
  // iOS zaokrągla rogi sam: pełne tło bez przezroczystości.
  { name: 'apple-touch-icon.png', size: 180, html: dots, bg: '#2F54EB', inset: 0 },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const icon of icons) {
  const pad = (icon.inset ?? 0) * icon.size;
  await page.setViewportSize({ width: icon.size, height: icon.size });
  await page.setContent(
    `<html><body style="margin:0;background:${icon.bg}">` +
      `<div style="padding:${pad}px;width:${icon.size - 2 * pad}px;height:${icon.size - 2 * pad}px">` +
      icon.html.replace('<svg ', '<svg width="100%" height="100%" ') +
      `</div></body></html>`,
  );
  await page.screenshot({ path: out(icon.name), omitBackground: icon.bg === 'transparent' });
}
await browser.close();
