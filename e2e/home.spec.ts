import { test, expect } from '@playwright/test';

test('homepage loads with upload zone and sidebar', async ({ page }) => {
  await page.goto('/');

  // Title / branding visible (DOM text is "Smart Log Parser" with spaces)
  await expect(page.locator('text=Smart Log Parser').first()).toBeVisible({ timeout: 10_000 });

  // Upload area: check for file input only (avoid mixing CSS and Playwright selectors)
  await expect(page.locator('input[type="file"]').first()).toBeAttached({ timeout: 5_000 });

  // Sidebar navigation renders
  await expect(page.locator('text=Upload').first()).toBeVisible();
});
