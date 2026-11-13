import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/design-system');
  await expect(page.getByRole('heading', { level: 1, name: 'Design system' })).toBeVisible();
});

test('galeria mieści się w szerokości ekranu i ładuje fonty z DS', async ({ page }) => {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);

  // Każdy font z DS §4 jest w paczce aplikacji i ładuje się z polskimi znakami.
  const fonts = await page.evaluate(async () => {
    const loads = async (font: string) => (await document.fonts.load(font, 'Zażółć')).length > 0;
    return {
      display: await loads('700 24px "Bricolage Grotesque Variable"'),
      ui: await loads('600 14px "Instrument Sans Variable"'),
      mono: await loads('500 15px "DM Mono"'),
    };
  });
  expect(fonts).toEqual({ display: true, ui: true, mono: true });
});

test('brak naruszeń WCAG A/AA (axe) w bieżącym motywie', async ({ page }) => {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`),
  ).toEqual([]);
});

test('przełącznik motywu zmienia tło i zapamiętuje wybór', async ({ page }, testInfo) => {
  const background = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const systemDark = testInfo.project.use.colorScheme === 'dark';
  const forced = systemDark ? 'Jasny' : 'Ciemny';
  const forcedColor = systemDark ? 'rgb(243, 244, 248)' : 'rgb(15, 18, 32)';

  const themes = page.getByRole('group', { name: 'Motyw' });
  await themes.getByText(forced, { exact: true }).click();
  await expect.poll(background).toBe(forcedColor);
  await page.reload();
  await expect.poll(background).toBe(forcedColor);
  await expect(page.getByRole('radio', { name: forced })).toBeChecked();

  // Wymuszony motyw też przechodzi axe (oba motywy w każdym projekcie).
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);

  await themes.getByText('Systemowy', { exact: true }).click();
  await expect.poll(background).toBe(systemDark ? 'rgb(15, 18, 32)' : 'rgb(243, 244, 248)');
});

test('lista rozwijana działa z klawiatury', async ({ page }) => {
  const trigger = page.getByRole('button', { name: /Strefa czasowa/ });
  await trigger.focus();
  await page.keyboard.press('ArrowDown');
  const list = page.getByRole('listbox', { name: 'Strefa czasowa' });
  await expect(list).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(list).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(trigger).toContainText('Europe/London');

  await page.keyboard.press('Enter');
  await expect(list).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(list).toBeHidden();
  await expect(trigger).toContainText('Europe/London');
});

test('zakładki, switch i toast działają z klawiatury', async ({ page }) => {
  const tab = page.getByRole('tab', { name: 'Punkty' });
  await tab.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Wygrane' })).toBeFocused();
  await expect(page.getByRole('tabpanel')).toHaveText('Ranking według liczby wygranych.');

  const sw = page.getByRole('switch', { name: 'Wygładź krawędzie' });
  await sw.focus();
  await page.keyboard.press('Space');
  await expect(sw).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByRole('slider', { name: 'Siła' })).toBeDisabled();

  await page.getByRole('button', { name: 'Błąd' }).focus();
  await page.keyboard.press('Enter');
  const region = page.getByRole('region', { name: 'Powiadomienia' });
  await expect(region.getByText('Trwa już inne spotkanie. Najpierw je zakończ.')).toBeVisible();
});

test('elementy interaktywne mają widoczny fokus', async ({ page }) => {
  const button = page.getByRole('button', { name: 'Zapisz' }).first();
  await button.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  const outline = await button.evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(outline).toBe('solid');
});
