import { test, expect } from '@playwright/test';
import path from 'path';

test('CSV export button triggers file download', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');

  const fileInput = page.locator('input[type="file"]').first();
  const csvFile = path.resolve(__dirname, '../tests/metrology_etch_sensor.csv');

  // LLM enrichment can take 20-30s; wait generously for the parse response
  const apiResponse = page.waitForResponse(
    r => r.url().includes('/api/parse') && r.status() === 200,
    { timeout: 60_000 },
  );
  await fileInput.setInputFiles(csvFile);
  await apiResponse;

  // Navigate to Data tab where export lives
  await page.locator('text=Data').first().click();

  // Wait for download when clicking CSV export
  const downloadPromise = page.waitForEvent('download', { timeout: 15_000 });
  await page.locator('text=/export.*csv|csv.*export|download/i').first().click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/\.csv$/i);
});
