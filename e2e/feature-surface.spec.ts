import { expect, test } from '@playwright/test';

test('alerts, recipes, planner, stats, and modal keyboard behavior remain usable', async ({ page }) => {
  await page.goto('/#/alerts');
  await expect(page.getByRole('heading', { name: 'Alerts' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Open alert settings' }).click();
  await expect(page.getByRole('heading', { name: 'Reminder settings' })).toBeVisible();
  await page.getByRole('button', { name: 'Close alert settings' }).click();

  await page.goto('/#/recipes');
  await expect(page.getByRole('heading', { name: 'Recipes' })).toBeVisible();
  await page.getByRole('button', { name: 'Search recipes' }).click();
  await page.getByRole('textbox', { name: 'Search recipes or ingredients' }).fill('banana');
  await expect(page.getByText(/recipes$/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Catalogue' }).click();
  const recipeCard = page.locator('.recipe-card').first();
  await recipeCard.click();
  await expect(page.getByRole('button', { name: 'Exit Cook Mode' })).toBeVisible();
  await page.getByRole('button', { name: 'Exit Cook Mode' }).click();

  await page.goto('/#/planner');
  await expect(page.getByRole('heading', { name: 'Meal planner' })).toBeVisible();
  const slotTrigger = page.getByRole('button', { name: 'Add breakfast for Mon' });
  await slotTrigger.click();
  const picker = page.getByRole('dialog');
  await expect(picker).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close meal picker' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(picker).not.toBeVisible();
  await expect(slotTrigger).toBeFocused();

  await page.goto('/#/stats');
  await expect(page.getByRole('heading', { name: 'Your impact' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Achievements' })).toBeVisible();
});
