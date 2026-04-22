import { test, expect } from '@playwright/test';
import path from 'path';

test('Re-uploading same file reports duplicates_dropped > 0', async ({ page }) => {
  await page.goto('/');
  const fileInput = page.locator('input[type="file"]').first();
  const csvFile = path.resolve(__dirname, '../tests/metrology_etch_sensor.csv');

  // First upload
  let response = page.waitForResponse(r => r.url().includes('/api/parse') && r.status() === 200);
  await fileInput.setInputFiles(csvFile);
  await response;

  // Wait briefly then re-upload
  await page.waitForTimeout(500);

  // Second upload — intercept and check deduplication
  const secondResponse = page.waitForResponse(r => r.url().includes('/api/parse') && r.status() === 200);
  await page.goto('/');
  const fileInput2 = page.locator('input[type="file"]').first();
  await fileInput2.setInputFiles(csvFile);
  const secondBody = await (await secondResponse).json();

  expect(secondBody.duplicates_dropped).toBeGreaterThan(0);
});
