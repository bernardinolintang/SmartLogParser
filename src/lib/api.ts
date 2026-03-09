const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export async function uploadLogToBackend(file: File): Promise<any> {
  const form = new FormData();
  form.append('file', file);

  const res = await fetch(`${API_BASE}/api/parse`, {
    method: 'POST',
    body: form,
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Backend parse failed: ${detail}`);
  }

  return res.json();
}

export async function uploadLogContent(content: string, filename: string): Promise<any> {
  const blob = new Blob([content], { type: 'text/plain' });
  const file = new File([blob], filename);
  return uploadLogToBackend(file);
}

export async function fetchRuns(): Promise<any[]> {
  const res = await fetch(`${API_BASE}/api/runs`);
  if (!res.ok) throw new Error('Failed to fetch runs');
  return res.json();
}

export async function fetchRunEvents(runId: string, params?: Record<string, string>): Promise<any[]> {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  const res = await fetch(`${API_BASE}/api/runs/${runId}/events${qs}`);
  if (!res.ok) throw new Error('Failed to fetch events');
  return res.json();
}

export async function fetchRunSummary(runId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/api/runs/${runId}/summary`);
  if (!res.ok) throw new Error('Failed to fetch summary');
  return res.json();
}

export async function fetchTimeseries(runId: string, parameter?: string): Promise<any[]> {
  const qs = parameter ? `?parameter=${parameter}` : '';
  const res = await fetch(`${API_BASE}/api/runs/${runId}/timeseries${qs}`);
  if (!res.ok) throw new Error('Failed to fetch timeseries');
  return res.json();
}

export async function markGoldenRun(runId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/api/runs/${runId}/mark-golden`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to mark golden');
  return res.json();
}

export async function compareGoldenRuns(baselineId: string, currentId: string): Promise<any> {
  const res = await fetch(
    `${API_BASE}/api/golden/compare?baseline_run_id=${baselineId}&current_run_id=${currentId}`
  );
  if (!res.ok) throw new Error('Failed to compare runs');
  return res.json();
}

export async function streamStart(toolId: string): Promise<{ run_id: string }> {
  const res = await fetch(`${API_BASE}/api/stream/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tool_id: toolId }),
  });
  if (!res.ok) throw new Error('Failed to start stream');
  return res.json();
}

export async function streamAppend(runId: string, lines: string): Promise<any> {
  const res = await fetch(`${API_BASE}/api/stream/append`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ run_id: runId, lines }),
  });
  if (!res.ok) throw new Error('Failed to append stream');
  return res.json();
}

export function isBackendAvailable(): Promise<boolean> {
  return fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(2000) })
    .then(res => res.ok)
    .catch(() => false);
}
