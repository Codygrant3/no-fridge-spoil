import { expect, test } from '@playwright/test';

test('startup plays once per session and route changes reset the main scroll position', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Fresh Market' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('app-splash')).toHaveCount(0);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('app-splash')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Fresh Market' })).toBeVisible();

  const main = page.locator('main.editorial-main');
  await main.evaluate(element => {
    element.scrollTop = element.scrollHeight;
  });
  expect(await main.evaluate(element => element.scrollTop)).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  await expect(page).toHaveURL(/#\/profile$/);
  await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible();
  expect(await main.evaluate(element => element.scrollTop)).toBe(0);
});
