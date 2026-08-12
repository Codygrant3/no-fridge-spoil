import { expect, test } from '@playwright/test';

test('core app routes render without console errors', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', message => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Fresh Market' })).toBeVisible({ timeout: 15_000 });

  await page.goto('/#/scan');
  await expect(page.getByText('Single Item')).toBeVisible();

  await page.goto('/#/shop');
  await expect(page.getByRole('heading', { name: 'Shopping list' })).toBeVisible();

  await page.goto('/#/alerts');
  await expect(page.getByText(/Alerts|No urgent alerts|Expiring Soon/i)).toBeVisible();

  await page.goto('/#/profile');
  await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Receipt intelligence' })).toBeVisible();

  expect(consoleErrors).toEqual([]);
});
