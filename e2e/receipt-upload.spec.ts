import { expect, test } from '@playwright/test';

test('receipt mode accepts a real file upload through the hidden gallery input', async ({ page }) => {
  await page.route(/generativelanguage|googleapis|google.com/, route => route.abort());
  await page.goto('/');

  await page.getByText('Start Scanning', { exact: true }).click({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Receipt' }).click();

  await expect(page.getByText('Receipt OCR setup')).toBeVisible();

  const buffer = Buffer.from('synthetic receipt upload bytes '.repeat(300));
  await page.locator('input[type="file"]').first().setInputFiles({
    name: 'playwright-receipt.png',
    mimeType: 'image/png',
    buffer,
  });

  await expect(page.getByText(/uploaded/i).first()).toBeVisible();
  await expect(page.getByText(/Offline receipt queue|Scan failed|Gemini API key/i)).toBeVisible({ timeout: 30_000 });
});

test('sample receipt review can loop back to receipt scanning', async ({ page }) => {
  await page.goto('/');

  await page.getByText('Start Scanning', { exact: true }).click({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Receipt' }).click();
  await page.getByRole('button', { name: 'Try sample receipt' }).click();

  await expect(page.getByText('Review Scanned Items')).toBeVisible();
  const inputValues = await page.locator('input').evaluateAll(inputs =>
    inputs.map(input => (input as HTMLInputElement).value)
  );
  expect(inputValues).toContain('Organic Whole Milk');
  expect(inputValues).toContain('Bananas');
  await expect(page.getByText(/Non-food items skipped/i)).toBeVisible();

  await page.getByRole('button', { name: 'Scan another receipt' }).click();

  await expect(page.getByText('Receipt OCR setup')).toBeVisible();
  await expect(page.getByText('Tap CAPTURE to photograph your receipt')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try sample receipt' })).toBeVisible();
});
