import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/** Czeka, aż na stronie nie trwa żadna animacja ani przejście (DS §16). */
export async function settled(page: Page) {
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => animation.playState !== 'running'),
  );
}

/** Naruszenia WCAG 2.1 A/AA na całej stronie (NFR-5) jako czytelne napisy. */
export async function axeViolations(page: Page): Promise<string[]> {
  await settled(page);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  return results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`);
}

/** Strona nie przewija się w poziomie (DS §2, od 360 px). */
export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'poziome przewijanie strony').toBe(0);
}
