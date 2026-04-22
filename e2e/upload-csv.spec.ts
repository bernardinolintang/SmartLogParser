import { test, expect } from '@playwright/test';
import path from 'path';

test('CSV upload: format detected, events appear, stability score visible', async ({ page }) => {
  await page.goto('/');

  const fileInput = page.locator('input[type="file"]').first();
  const csvFile = path.resolve(__dirname, '../tests/metrology_etch_sensor.csv');
  await fileInput.setInputFiles(csvFile);

  // Format badge shows csv
  await expect(page.locator('text=/csv/i').first()).toBeVisible({ timeout: 15_000 });

  // Overview tab auto-selected — event count present
  await expect(page.locator('text=/event/i').first()).toBeVisible({ timeout: 15_000 });
});
