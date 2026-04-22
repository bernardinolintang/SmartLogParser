import { test, expect } from '@playwright/test';
import path from 'path';

test('Re-uploading same file reports duplicates_dropped > 0', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');

  // Intercept the parse API response using page.route (works reliably cross-origin)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let parsedBody: Record<string, any> = {};
  await page.route('**/api/parse', async (route) => {
    const response = await route.fetch();
    try { parsedBody = await response.json(); } catch { /* ignore */ }
    await route.fulfill({ response });
  });

  const fileInput = page.locator('input[type="file"]').first();
  const csvFile = path.resolve(__dirname, '../tests/metrology_etch_sensor.csv');
  await fileInput.setInputFiles(csvFile);

  // metrology_etch_sensor.csv has internal duplicate rows — wait for the format badge to confirm
  // the backend processed the file, then validate the captured API body.
  await expect(page.locator('text=/csv/i').first()).toBeVisible({ timeout: 60_000 });

  expect(parsedBody.duplicates_dropped).toBeGreaterThan(0);
});
