import { test, expect } from '@playwright/test';

const API = 'http://localhost:8001';

test('GET /odata/ returns OData service document', async ({ request }) => {
  const res = await request.get(`${API}/odata/`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body).toHaveProperty('@odata.context');
});

test('GET /odata/$metadata returns XML', async ({ request }) => {
  const res = await request.get(`${API}/odata/$metadata`);
  expect(res.status()).toBe(200);
  const contentType = res.headers()['content-type'] || '';
  expect(contentType).toMatch(/xml/i);
});

test('GET /odata/events with $top=5 returns ≤5 records', async ({ request }) => {
  const res = await request.get(`${API}/odata/events?$top=5`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body).toHaveProperty('value');
  expect(Array.isArray(body.value)).toBe(true);
  expect(body.value.length).toBeLessThanOrEqual(5);
});
