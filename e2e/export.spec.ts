import { test, expect } from '@playwright/test';
import path from 'path';

test('CSV export button triggers file download', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');

  const fileInput = page.locator('input[type="file"]').first();
  const csvFile = path.resolve(__dirname, '../tests/metrology_etch_sensor.csv');
  await fileInput.setInputFiles(csvFile);

  // Wait for the result panel to appear (any event-count text)
  await expect(page.locator('text=/event/i').first()).toBeVisible({ timeout: 60_000 });

  // Navigate to Data tab where the LogTable (and export buttons) live
  await page.locator('text=Data').first().click();

  // LogTable renders a "CSV" button (icon + text "CSV") — target it specifically
  await expect(page.locator('button:has-text("CSV")').first()).toBeVisible({ timeout: 10_000 });

  // Set up download listener before clicking
  const downloadPromise = page.waitForEvent('download', { timeout: 15_000 });
  await page.locator('button:has-text("CSV")').first().click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/\.csv$/i);
});
