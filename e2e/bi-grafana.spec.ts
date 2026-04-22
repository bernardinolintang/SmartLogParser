import { test, expect } from '@playwright/test';

const API = 'http://localhost:8001';

test('GET /api/bi/events returns an array', async ({ request }) => {
  const res = await request.get(`${API}/api/bi/events?limit=10`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(Array.isArray(body)).toBe(true);
});

test('GET /api/bi/timeseries returns an array', async ({ request }) => {
  const res = await request.get(`${API}/api/bi/timeseries?limit=10`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(Array.isArray(body)).toBe(true);
});

test('GET /api/bi/kpis returns an array with health_score', async ({ request }) => {
  const res = await request.get(`${API}/api/bi/kpis?limit=5`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(Array.isArray(body)).toBe(true);
  if (body.length > 0) {
    expect(body[0]).toHaveProperty('health_score');
    expect(body[0]).toHaveProperty('run_id');
  }
});
