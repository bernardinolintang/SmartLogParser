import { test, expect } from '@playwright/test';
import path from 'path';

test('Parquet upload: format detected as parquet, no error state', async ({ page }) => {
  await page.goto('/');

  // Intercept the parse API to verify parquet format detection
  const apiResponse = page.waitForResponse(
    r => r.url().includes('/api/parse') && r.status() === 200
  );

  const fileInput = page.locator('input[type="file"]').first();
  const parquetFile = path.resolve(__dirname, '../tests/vendor_b_parquet_sensor.parquet');
  await fileInput.setInputFiles(parquetFile);

  const response = await apiResponse;
  const body = await response.json();
  expect(body.format).toBe('parquet');
  expect(body.total_events).toBeGreaterThan(0);

  // UI should not show an error state
  await expect(page.locator('text=/error/i')).not.toBeVisible({ timeout: 10_000 });
});
