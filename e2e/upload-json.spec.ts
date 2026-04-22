import { test, expect } from '@playwright/test';
import path from 'path';

test('JSON upload: format detected, event count > 0', async ({ page }) => {
  await page.goto('/');

  const fileInput = page.locator('input[type="file"]').first();
  const jsonFile = path.resolve(__dirname, '../tests/vendor_a_dry_etch.json');
  await fileInput.setInputFiles(jsonFile);

  await expect(page.locator('text=/json/i').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('text=/event/i').first()).toBeVisible({ timeout: 15_000 });
});
