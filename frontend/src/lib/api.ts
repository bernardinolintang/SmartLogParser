const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8001';

export interface RunSummaryResponse {
  [key: string]: unknown;
}

export interface RunResponse {
  run_id: string;
  filename: string;
  source_format: string;
  uploaded_at?: string;
  status: string;
  is_golden: boolean;
  total_events: number;
  alarm_count: number;
  warning_count: number;
}

export interface StreamAppendResponse {
  run_id: string;
  new_events: number;
  duplicates_dropped?: number;
  total_events: number;
  alarm_count?: number;
  warning_count?: number;
}

export interface GoldenCompareResponse {
  baseline_run_id: string;
  current_run_id: string;
  comparisons: unknown[];
  drift_count: number;
}

async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(detail || `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function uploadLogToBackend(file: File): Promise<unknown> {
  const form = new FormData();
  form.append('file', file);

  return fetchJson<unknown>(`${API_BASE}/api/parse`, {
    method: 'POST',
    body: form,
  });
}

export async function uploadLogContent(content: string, filename: string): Promise<unknown> {
  const blob = new Blob([content], { type: 'text/plain' });
  const file = new File([blob], filename);
  return uploadLogToBackend(file);
}

export async function fetchRuns(): Promise<RunResponse[]> {
  return fetchJson<RunResponse[]>(`${API_BASE}/api/runs`);
}

export async function fetchRunEvents(runId: string, params?: Record<string, string>): Promise<unknown[]> {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return fetchJson<unknown[]>(`${API_BASE}/api/runs/${runId}/events${qs}`);
}

export async function fetchRunSummary(runId: string): Promise<RunSummaryResponse> {
  return fetchJson<RunSummaryResponse>(`${API_BASE}/api/runs/${runId}/summary`);
}

export async function fetchTimeseries(runId: string, parameter?: string): Promise<unknown[]> {
  const qs = parameter ? `?parameter=${parameter}` : '';
  return fetchJson<unknown[]>(`${API_BASE}/api/runs/${runId}/timeseries${qs}`);
}

export async function markGoldenRun(runId: string): Promise<RunSummaryResponse> {
  return fetchJson<RunSummaryResponse>(`${API_BASE}/api/runs/${runId}/mark-golden`, { method: 'POST' });
}

export async function compareGoldenRuns(baselineId: string, currentId: string): Promise<GoldenCompareResponse> {
  return fetchJson<GoldenCompareResponse>(
    `${API_BASE}/api/golden/compare?baseline_run_id=${baselineId}&current_run_id=${currentId}`
  );
}

export async function streamStart(toolId: string): Promise<{ run_id: string }> {
  return fetchJson<{ run_id: string }>(`${API_BASE}/api/stream/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tool_id: toolId }),
  });
}

export async function streamAppend(runId: string, lines: string): Promise<StreamAppendResponse> {
  return fetchJson<StreamAppendResponse>(`${API_BASE}/api/stream/append`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ run_id: runId, lines }),
  });
}

export async function streamFinish(runId: string): Promise<unknown> {
  return fetchJson<unknown>(`${API_BASE}/api/stream/finish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ run_id: runId }),
  });
}

export function isBackendAvailable(): Promise<boolean> {
  return fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(2000) })
    .then(res => res.ok)
    .catch(() => false);
}
