import { test, expect } from '@playwright/test';

test('homepage loads with upload zone and sidebar', async ({ page }) => {
  await page.goto('/');

  // Title / branding visible
  await expect(page.locator('text=SmartLogParser').first()).toBeVisible({ timeout: 10_000 });

  // Upload area is present
  await expect(page.locator('[data-testid="upload-zone"], input[type="file"], text=Upload').first()).toBeVisible();

  // Sidebar navigation renders
  await expect(page.locator('text=Upload').first()).toBeVisible();
});
