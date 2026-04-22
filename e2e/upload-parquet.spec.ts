import { test, expect } from '@playwright/test';
import path from 'path';

test('Parquet upload: format detected as parquet, no error state', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');

  const fileInput = page.locator('input[type="file"]').first();
  const parquetFile = path.resolve(__dirname, '../tests/vendor_b_parquet_sensor.parquet');

  // Intercept the parse API to verify parquet format detection
  const apiResponse = page.waitForResponse(
    r => r.url().includes('/api/parse') && r.status() === 200,
    { timeout: 60_000 },
  );
  await fileInput.setInputFiles(parquetFile);

  const response = await apiResponse;
  const body = await response.json();
  expect(body.format).toBe('parquet');
  expect(body.total_events).toBeGreaterThan(0);

  // UI should not show an error state
  await expect(page.locator('text=/error/i')).not.toBeVisible({ timeout: 10_000 });
});
