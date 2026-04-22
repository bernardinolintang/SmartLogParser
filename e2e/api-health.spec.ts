import { test, expect } from '@playwright/test';

test('Backend /health returns ok', async ({ request }) => {
  const response = await request.get('http://localhost:8001/health');
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.status).toBe('ok');
});
