import { test, expect } from '@playwright/test';
import path from 'path';

test('Parquet upload: format detected as parquet, no error state', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');

  // Use a Promise so the test explicitly awaits the route callback
  // (the filename "vendor_b_parquet_sensor.parquet" would make text=/parquet/i visible
  //  immediately, before the backend has responded)
  let routeResolve!: (v: Record<string, unknown>) => void;
  const routeComplete = new Promise<Record<string, unknown>>(r => { routeResolve = r; });

  await page.route('**/api/parse', async (route) => {
    const response = await route.fetch();
    let body: Record<string, unknown> = {};
    try { body = await response.json(); } catch { /* ignore parse error */ }
    await route.fulfill({ response }); // send response to browser first
    routeResolve(body);               // then signal test to proceed
  });

  const fileInput = page.locator('input[type="file"]').first();
  const parquetFile = path.resolve(__dirname, '../tests/vendor_b_parquet_sensor.parquet');
  await fileInput.setInputFiles(parquetFile);

  // Await the actual backend response body
  const parsedBody = await routeComplete;

  expect(parsedBody.format).toBe('parquet');
  expect(parsedBody.total_events).toBeGreaterThan(0);

  // UI should not show an unrecoverable error banner
  await expect(page.locator('text=/error/i')).not.toBeVisible({ timeout: 5_000 });
});
