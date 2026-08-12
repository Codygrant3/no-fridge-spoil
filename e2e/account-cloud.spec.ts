import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

test('cloud account lifecycle remains usable at phone width', async ({ page }, testInfo) => {
  const consoleErrors: string[] = [];
  const httpErrors: string[] = [];
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('response', response => {
    if (response.status() >= 400) httpErrors.push(`${response.status()} ${response.url()}`);
  });

  await page.goto('/#/profile');
  const skipIntro = page.getByRole('button', { name: 'Skip intro' });
  if (await skipIntro.isVisible()) await skipIntro.click();

  const createAccountTab = page.getByRole('tab', { name: 'Create account' });
  if (!await createAccountTab.isVisible()) {
    if (testInfo.config.metadata.cloudRequired) {
      await expect(createAccountTab, 'Cloud accounts must be configured for the cloud E2E suite.').toBeVisible();
    }
    test.skip(true, 'Cloud accounts are not configured for this preview.');
  }

  const email = `cloud-e2e-${Date.now()}@example.test`;
  const password = `Cloud-e2e-${Date.now()}!`;
  await createAccountTab.click();
  await page.getByRole('textbox', { name: 'Name' }).fill('Cloud E2E Customer');
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByRole('textbox', { name: 'Password' }).fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page.getByRole('heading', { name: 'Cloud account' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sync now' })).toBeEnabled();
  await expect(page.getByRole('combobox', { name: 'Household receipt records' })).toHaveValue('30');

  const viewportAudit = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    overflowingText: Array.from(document.querySelectorAll<HTMLElement>('h1,h2,p,button,label,strong,span'))
      .filter(element => element.scrollWidth > element.clientWidth + 1)
      .map(element => element.textContent?.trim())
      .filter(Boolean),
  }));
  expect(viewportAudit.scrollWidth).toBe(viewportAudit.clientWidth);
  expect(viewportAudit.overflowingText).toEqual([]);

  await page.screenshot({ path: testInfo.outputPath('cloud-profile-mobile.png'), fullPage: true });

  await page.getByRole('textbox', { name: 'Display name' }).fill('Cloud E2E Updated');
  await page.getByRole('combobox', { name: 'Receipt records', exact: true }).selectOption('7');
  await page.getByRole('button', { name: 'Save account settings' }).click();
  await expect(page.getByRole('status')).toContainText('settings saved');

  const confirmation = page.getByRole('textbox', { name: 'Confirm with your email' });
  await confirmation.fill(email);
  const deleteButton = page.getByRole('button', { name: 'Delete account permanently' });
  await expect(deleteButton).toBeEnabled();
  await deleteButton.click();
  await expect(page.getByRole('heading', { name: 'Fresh Market' })).toBeVisible();
  await page.goto('/#/profile');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

  expect({ consoleErrors, httpErrors }).toEqual({ consoleErrors: [], httpErrors: [] });
});
