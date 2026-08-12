import { expect, test } from '@playwright/test';

test('device backup restore repopulates local shopping data', async ({ page }) => {
  await page.goto('/#/profile');
  await expect(page.getByRole('heading', { name: 'Device backup' })).toBeVisible({ timeout: 15_000 });

  const backup = JSON.stringify({
    version: 3,
    shoppingList: [{
      id: 'e2e-backup-oats',
      name: 'Backup Oats',
      quantity: 1,
      addedAt: '2026-07-25T12:00:00.000Z',
      isChecked: false,
      category: 'pantry',
    }],
  });
  await page.getByLabel('Choose device backup').setInputFiles({
    name: 'device-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(backup),
  });

  await expect(page.getByText('Review restore')).toBeVisible();
  await expect(page.getByText(/1 record.*version 3/)).toBeVisible();
  await page.getByRole('button', { name: 'Confirm restore' }).click();
  await expect(page.getByText('1 device record restored.')).toBeVisible();
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Mark collected: Backup Oats', exact: true })).toBeVisible();
});
