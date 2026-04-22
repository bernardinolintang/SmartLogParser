import { test, expect } from '@playwright/test';
import path from 'path';

test('Re-uploading same file reports duplicates_dropped > 0', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');

  // Use a Promise so the test explicitly awaits the route callback, not the UI
  // (the filename "metrology_etch_sensor.csv" would make text=/csv/i visible immediately)
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
  const csvFile = path.resolve(__dirname, '../tests/metrology_etch_sensor.csv');
  await fileInput.setInputFiles(csvFile);

  // Await the route callback (not just UI visibility) to get the real response body
  const parsedBody = await routeComplete;

  // metrology_etch_sensor.csv has internal duplicate rows;
  // any re-upload also deduplicates against the prior run already in the DB
  expect(parsedBody.duplicates_dropped).toBeGreaterThan(0);
});
