import { test, expect } from '@playwright/test';

const API = 'http://localhost:8001';

const SAMPLE_LINES = [
  '2026-03-05T11:00:00,METRO_TOOL_01,CH_B,temperature,120,C,Preheat,CVD_01,RUN_ST_001',
  '2026-03-05T11:00:05,METRO_TOOL_01,CH_B,pressure,2.5,Torr,Preheat,CVD_01,RUN_ST_001',
  '2026-03-05T11:00:10,METRO_TOOL_01,CH_B,gas_flow,500,sccm,Preheat,CVD_01,RUN_ST_001',
].join('\n');

test('Streaming: start → append → finish returns events', async ({ request }) => {
  // Start stream
  const startRes = await request.post(`${API}/api/stream/start`, {
    data: { tool_id: 'METRO_TOOL_01', format_hint: 'csv' },
  });
  expect(startRes.status()).toBe(200);
  const { run_id } = await startRes.json();
  expect(run_id).toMatch(/^STREAM_/);

  // Append lines
  const appendRes = await request.post(`${API}/api/stream/append`, {
    data: { run_id, lines: SAMPLE_LINES },
  });
  expect(appendRes.status()).toBe(200);
  const appendBody = await appendRes.json();
  expect(appendBody.new_events).toBeGreaterThan(0);

  // Finish
  const finishRes = await request.post(`${API}/api/stream/finish`, {
    data: { run_id },
  });
  expect(finishRes.status()).toBe(200);
  const finishBody = await finishRes.json();
  expect(finishBody.status).toBe('completed');
  expect(finishBody.total_events).toBeGreaterThan(0);
  expect(finishBody.run_id).toBe(run_id);
});
