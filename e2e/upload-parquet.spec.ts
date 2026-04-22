import { test, expect } from '@playwright/test';
import path from 'path';

test('Parquet upload: format detected as parquet, no error state', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');

  // Intercept the parse API to verify parquet format detection
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let parsedBody: Record<string, any> = {};
  await page.route('**/api/parse', async (route) => {
    const response = await route.fetch();
    try { parsedBody = await response.json(); } catch { /* ignore */ }
    await route.fulfill({ response });
  });

  const fileInput = page.locator('input[type="file"]').first();
  const parquetFile = path.resolve(__dirname, '../tests/vendor_b_parquet_sensor.parquet');
  await fileInput.setInputFiles(parquetFile);

  // Wait for UI to reflect the result (parquet badge or event count text)
  await expect(page.locator('text=/parquet/i').first()).toBeVisible({ timeout: 60_000 });

  expect(parsedBody.format).toBe('parquet');
  expect(parsedBody.total_events).toBeGreaterThan(0);

  // UI should not show an unrecoverable error banner
  await expect(page.locator('text=/error/i')).not.toBeVisible({ timeout: 5_000 });
});
