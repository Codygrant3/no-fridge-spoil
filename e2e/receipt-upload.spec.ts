import { expect, test } from '@playwright/test';

test('receipt mode accepts a real file upload through the hidden gallery input', async ({ page }) => {
  const googleRequests: string[] = [];
  page.on('request', request => {
    if (/generativelanguage|texttospeech\.googleapis/i.test(request.url())) {
      googleRequests.push(request.url());
    }
  });
  await page.goto('/');

  await page.getByRole('button', { name: 'Start scanning', exact: true }).click({ timeout: 15_000 });
  await page.getByRole('tab', { name: 'Receipt' }).click();
  const receiptSettingsButton = page.getByRole('button', { name: 'Receipt settings and scan history' });
  await receiptSettingsButton.click();
  await expect(page.getByRole('dialog', { name: 'Settings and history' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Settings and history' })).not.toBeVisible();
  await expect(receiptSettingsButton).toBeFocused();
  await receiptSettingsButton.click();

  await expect(page.getByText('Receipt OCR setup')).toBeVisible();

  await page.locator('input[type="file"]').first().setInputFiles('public/onboarding/step2.png');

  await expect(page.getByText('Offline receipt queue', { exact: true })).toBeVisible({ timeout: 30_000 });
  expect(googleRequests).toEqual([]);
});

test('sample receipt review can loop back to receipt scanning', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Start scanning', exact: true }).click({ timeout: 15_000 });
  await page.getByRole('tab', { name: 'Receipt' }).click();
  await page.getByRole('button', { name: 'Receipt settings and scan history' }).click();
  await page.getByRole('button', { name: 'Try sample receipt' }).click();

  await expect(page.getByRole('heading', { name: 'Review groceries' })).toBeVisible();
  const reviewedNames = await page.getByRole('textbox', { name: 'Item name' }).evaluateAll(textareas =>
    textareas.map(textarea => (textarea as HTMLTextAreaElement).value)
  );
  expect(reviewedNames).toContain('Organic Whole Milk');
  expect(reviewedNames).toContain('Bananas');
  await expect(page.getByText(/Non-food items skipped/i)).toBeVisible();

  await page.getByRole('button', { name: 'Scan another receipt' }).click();

  await expect(page.getByText('Tap CAPTURE to photograph your receipt')).toBeVisible();
  await page.getByRole('button', { name: 'Receipt settings and scan history' }).click();
  await expect(page.getByText('Receipt OCR setup')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try sample receipt' })).toBeVisible();
});

test('sample receipt can be confirmed into inventory', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Start scanning', exact: true }).click({ timeout: 15_000 });
  await page.getByRole('tab', { name: 'Receipt' }).click();
  await page.getByRole('button', { name: 'Receipt settings and scan history' }).click();
  await page.getByRole('button', { name: 'Try sample receipt' }).click();

  await expect(page.getByRole('heading', { name: 'Review groceries' })).toBeVisible();
  await page.getByRole('button', { name: 'Use suggestion' }).click();
  await page.locator('input[type="date"]').first().fill('2026-09-01');
  await page.getByRole('button', { name: 'Set dates' }).click();
  await page.getByRole('button', { name: /Confirm & Add 3 Items/i }).click();

  await page.getByRole('button', { name: 'Home', exact: true }).click();

  await expect(page.getByRole('button', { name: /Organic Whole Milk/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Bananas/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Chicken Breast/ })).toBeVisible();
});
