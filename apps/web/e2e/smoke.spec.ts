import { expect, test } from '@playwright/test';

test('ekran startowy jest po polsku i mieści się w szerokości ekranu', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('html')).toHaveAttribute('lang', 'pl');
  await expect(page).toHaveTitle('BG Club');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('BG Club');
  await expect(page.getByText('Szkielet aplikacji działa')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});

test('tło strony odpowiada motywowi systemu', async ({ page }, testInfo) => {
  await page.goto('/');
  const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const dark = testInfo.project.use.colorScheme === 'dark';
  // #F3F4F8 (DS §3) w jasnym, #0F1220 w ciemnym.
  expect(background).toBe(dark ? 'rgb(15, 18, 32)' : 'rgb(243, 244, 248)');
});
