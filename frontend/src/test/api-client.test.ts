import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchRunAnomalies } from '@/lib/api';

afterEach(() => vi.restoreAllMocks());

describe('fetchRunAnomalies', () => {
  it('calls the correct endpoint URL', async () => {
    const mockData = {
      run_id: 'RUN_TEST_001',
      anomaly_count: 2,
      z_score_anomalies: 1,
      drift_anomalies: 1,
      parameters_with_anomalies: ['temperature'],
      total_readings_analysed: 20,
      anomalies: [],
    };

    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
    } as Response);

    const result = await fetchRunAnomalies('RUN_TEST_001');

    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain('/api/runs/RUN_TEST_001/anomalies');
    expect(result.run_id).toBe('RUN_TEST_001');
    expect(result.anomaly_count).toBe(2);
    expect(result.parameters_with_anomalies).toContain('temperature');
  });

  it('returns typed AnomalyResponse structure', async () => {
    const mockData = {
      run_id: 'RUN_ABC',
      anomaly_count: 0,
      z_score_anomalies: 0,
      drift_anomalies: 0,
      parameters_with_anomalies: [],
      total_readings_analysed: 10,
      anomalies: [],
    };

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
    } as Response);

    const result = await fetchRunAnomalies('RUN_ABC');
    expect(result).toHaveProperty('anomalies');
    expect(Array.isArray(result.anomalies)).toBe(true);
  });
});
