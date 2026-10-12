import { expect, test } from '@playwright/test';

test('intro is skippable, remembered for the session, and replayable with restored focus', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByTestId('app-splash')).toBeVisible();
  await page.getByRole('button', { name: 'Skip intro' }).click();
  await expect(page.getByTestId('app-splash')).toHaveCount(0);
  await expect(page.locator('main')).toBeFocused();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Home', exact: true })).toBeVisible();
  await expect(page.getByTestId('app-splash')).toHaveCount(0);
  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  const replay = page.getByRole('button', { name: 'Replay intro' });
  await replay.click();
  await expect(page.getByRole('button', { name: 'Skip intro' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'Skip intro' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(replay).toBeFocused();
  await replay.click();
  await expect(page.getByTestId('app-splash')).toHaveCount(0, { timeout: 6000 });
  await expect(replay).toBeFocused();
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Shopping list', exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Profile', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('reduced motion bypasses startup, keeps replay static, and responds to preference changes', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Profile', exact: true })).toBeVisible();
  await expect(page.getByTestId('app-splash')).toHaveCount(0);
  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  await page.getByRole('button', { name: 'Replay intro' }).click();
  await expect(page.locator('.motion-intro-result').first()).toHaveCSS('animation-name', 'none');
  await expect(page.locator('.motion-intro-scan-beam')).toBeHidden();
  await page.keyboard.press('Escape');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.getByRole('button', { name: 'Replay intro' }).click();
  await expect(page.getByTestId('app-splash')).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.getByTestId('app-splash')).toHaveCount(0);
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(page.locator('.editorial-main')).toHaveCSS('animation-name', 'none');
});

for (const viewport of [{ width: 320, height: 700 }, { width: 390, height: 844 }, { width: 1024, height: 900 }]) {
  test(`intro and home fit ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.getByTestId('app-splash')).toBeVisible();
    // Freeze the actual CSS timeline at its completed story beat for reproducible visual review.
    await page.locator('.motion-intro').evaluate(element => {
      element.getAnimations({ subtree: true }).forEach(animation => {
        animation.pause();
        animation.currentTime = 2600;
      });
    });
    await page.screenshot({ path: testInfo.outputPath(`intro-${viewport.width}.png`) });
    const message = await page.locator('.motion-intro-message').boundingBox();
    const cards = await page.locator('.motion-intro-results').boundingBox();
    expect(message!.y).toBeGreaterThan(cards!.y + cards!.height);
    expect(message!.y + message!.height).toBeLessThan(viewport.height);
    await page.getByRole('button', { name: 'Skip intro' }).click();
    await expect(page.getByRole('heading', { name: 'Fresh Market' })).toBeVisible();
    await page.getByRole('button', { name: 'Hide setup checklist' }).click();
    await page.screenshot({ path: testInfo.outputPath(`home-${viewport.width}.png`), animations: 'disabled' });
    expect(await page.locator('body').evaluate(element => element.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    await page.getByRole('button', { name: 'Scan', exact: true }).click();
    await expect(page.getByText('Single Item', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Scan', exact: true })).toHaveAttribute('aria-current', 'page');
    await page.getByRole('button', { name: 'Profile', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Profile', exact: true })).toBeVisible();
    const profile = await page.locator('.profile-page').boundingBox();
    expect(profile!.width).toBeLessThanOrEqual(Math.min(viewport.width, 560));
  });
}
