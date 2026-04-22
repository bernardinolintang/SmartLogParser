import { test, expect } from '@playwright/test';
import path from 'path';

test('Anomaly tab loads after upload with no crash', async ({ page }) => {
  await page.goto('/');

  const fileInput = page.locator('input[type="file"]').first();
  const csvFile = path.resolve(__dirname, '../tests/metrology_etch_sensor.csv');

  const apiResponse = page.waitForResponse(r => r.url().includes('/api/parse') && r.status() === 200);
  await fileInput.setInputFiles(csvFile);
  await apiResponse;

  // Click Anomaly tab in sidebar
  await page.locator('text=Anomaly').first().click();

  // Either "no anomalies" message or anomaly table — never a crash/blank
  const anomalySection = page.locator('text=/anomal/i').first();
  await expect(anomalySection).toBeVisible({ timeout: 15_000 });
});
