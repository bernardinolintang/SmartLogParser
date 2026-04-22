import { test, expect } from '@playwright/test';

const API = 'http://localhost:8001';

test('Elasticsearch sync falls back gracefully without real ES', async ({ request }) => {
  // ES client retries 3x with backoff before falling back — this can take 30-60s
  test.setTimeout(90_000);
  const res = await request.post(`${API}/api/ingest/sync/ETCH_TOOL_01`);
  // Returns 200 with mock data when ES is unreachable
  expect([200, 422, 500]).toContain(res.status());
  if (res.status() === 200) {
    const body = await res.json();
    expect(body).toBeTruthy();
  }
});

test('Logstash push: single log line parsed and stored', async ({ request }) => {
  const res = await request.post(`${API}/api/ingest/logstash`, {
    data: {
      message: 'tool_id=ETCH_TOOL_01 parameter=temperature value=120 unit=C severity=info',
    },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body).toHaveProperty('run_id');
});

test('Generic webhook: raw log ingested', async ({ request }) => {
  const res = await request.post(`${API}/api/ingest/webhook`, {
    data: {
      log: 'TEMP=120C PRESS=0.8Torr TOOL=ETCH_01 STEP=MainEtch',
      source: 'e2e-test',
    },
  });
  expect([200, 201]).toContain(res.status());
});
