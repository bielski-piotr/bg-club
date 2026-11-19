import { expect, test } from '@playwright/test';

test('aplikacja startuje od ekranu logowania po polsku i mieści się w szerokości ekranu', async ({
  page,
}) => {
  await page.goto('/');

  await expect(page.locator('html')).toHaveAttribute('lang', 'pl');
  await expect(page).toHaveTitle('BG Club');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Zaloguj się');
  await expect(page.getByLabel('Hook')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});

test('tło strony odpowiada motywowi systemu', async ({ page }) => {
  await page.goto('/');
  const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const dark = test.info().project.use.colorScheme === 'dark';
  // #F3F4F8 w jasnym, #0F1220 w ciemnym.
  expect(background).toBe(dark ? 'rgb(15, 18, 32)' : 'rgb(243, 244, 248)');
});
