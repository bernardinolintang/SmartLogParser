import { test, expect } from '@playwright/test';

const API = 'http://localhost:8001';

test('GET /api/kafka/status returns structured response (connected or unavailable)', async ({ request }) => {
  const res = await request.get(`${API}/api/kafka/status`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body).toHaveProperty('status');
  expect(['connected', 'kafka_unavailable']).toContain(body.status);
});

test('POST /api/kafka/consume with dummy broker returns structured error, not a crash', async ({ request }) => {
  // ConsumeRequest is a Pydantic BaseModel — must send JSON body, not form data
  const res = await request.post(`${API}/api/kafka/consume`, {
    json: {
      topic: 'raw-fab-logs',
      bootstrap_servers: 'localhost:19092',
      max_messages: 5,
    },
  });
  // Must not be 500 — graceful degradation
  expect(res.status()).not.toBe(500);
  const body = await res.json();
  expect(body).toHaveProperty('status');
});
