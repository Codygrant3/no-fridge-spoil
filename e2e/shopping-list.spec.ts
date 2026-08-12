import { expect, test } from '@playwright/test';

test('shopping list options menu performs list actions', async ({ page }) => {
  await page.goto('/#/shop');

  await expect(page.getByRole('heading', { name: 'Shopping list' })).toBeVisible({ timeout: 15_000 });
  await page.getByPlaceholder('Add milk, avocados, bread...').fill('E2E Apples');
  await page.getByLabel('Add item').click();

  await expect(page.getByRole('button', { name: /Mark collected: E2E Apples/ })).toBeVisible();
  await expect(page.getByText('E2E Apples added to list.')).toBeVisible();
  await page.getByPlaceholder('Add milk, avocados, bread...').fill('e2e apples');
  await page.getByLabel('Add item').click();
  await expect(page.getByText('E2E Apples quantity updated to 2.')).toBeVisible();
  await expect(page.getByLabel('2 items')).toBeVisible();
  await expect(page.getByRole('button', { name: /Mark collected: E2E Apples/ })).toHaveCount(1);
  await page.getByLabel('Decrease E2E Apples quantity').click();
  await expect(page.getByLabel('1 items')).toBeVisible();
  await page.getByLabel('Remove E2E Apples from list').click();
  await expect(page.getByText('Your list is empty')).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('button', { name: /Mark collected: E2E Apples/ })).toBeVisible();

  await page.getByLabel('Shopping list options').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menuitem', { name: 'Mark all collected' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('Shopping list options')).toBeFocused();

  await page.getByLabel('Shopping list options').click();
  await expect(page.getByText('Mark all collected')).toBeVisible();
  await page.getByText('Mark all collected').click();

  await expect(page.getByText('100% collected')).toBeVisible();
  await expect(page.getByText('All items marked collected.')).toBeVisible();

  await page.getByLabel('Shopping list options').click();
  await page.getByText('Clear collected').click();

  await expect(page.getByText('Your list is empty')).toBeVisible();
  await expect(page.getByText('1 collected item cleared.')).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('button', { name: /Mark not collected: E2E Apples/ })).toBeVisible();
  await expect(page.getByText('1 item restored.')).toBeVisible();
});
