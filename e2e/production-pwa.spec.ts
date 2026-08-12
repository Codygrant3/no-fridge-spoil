import { expect, test } from '@playwright/test';

test('production service worker installs and serves the app shell offline', async ({ browser }) => {
  const context = await browser.newContext({ serviceWorkers: 'allow' });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4174/');
  await expect(page.getByRole('heading', { name: 'Fresh Market' })).toBeVisible({ timeout: 15_000 });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 15_000 });
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Fresh Market' })).toBeVisible({ timeout: 15_000 });
  await context.close();
});
