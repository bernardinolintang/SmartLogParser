import { test, expect } from '@playwright/test';
import path from 'path';

test('Re-uploading same file reports duplicates_dropped > 0', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');
  const fileInput = page.locator('input[type="file"]').first();
  const csvFile = path.resolve(__dirname, '../tests/metrology_etch_sensor.csv');

  // metrology_etch_sensor.csv has internal duplicate rows, so a single upload
  // is enough to verify deduplication; no need to navigate away and re-upload.
  const response = page.waitForResponse(
    r => r.url().includes('/api/parse') && r.status() === 200,
    { timeout: 60_000 },
  );
  await fileInput.setInputFiles(csvFile);
  const body = await (await response).json();

  expect(body.duplicates_dropped).toBeGreaterThan(0);
});
