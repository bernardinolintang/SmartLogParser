import { describe, it, expect } from 'vitest';
import { parseLog } from '@/lib/logParser';

// Test parameter normalisation through the full parseLog path
// since normalizeParam is internal but its output is visible on events

describe('Parameter normalisation via parseLog', () => {
  const csvWithVariants = [
    'timestamp,tool_id,parameter,value',
    '2026-01-01T00:00:00Z,ETCH_01,Temp,120',
    '2026-01-01T00:00:01Z,ETCH_01,temp_c,125',
    '2026-01-01T00:00:02Z,ETCH_01,Temperature,130',
    '2026-01-01T00:00:03Z,ETCH_01,Pressure,0.8',
    '2026-01-01T00:00:04Z,ETCH_01,press,0.9',
  ].join('\n');

  it('normalises Temp, TEMP_C, Temperature all to temperature', () => {
    const result = parseLog(csvWithVariants);
    const params = result.events.map(e => e.parameter);
    const tempVariants = params.filter(p => p === 'temperature');
    expect(tempVariants.length).toBe(3);
  });

  it('normalises Pressure and press to pressure', () => {
    const result = parseLog(csvWithVariants);
    const params = result.events.map(e => e.parameter);
    const pressVariants = params.filter(p => p === 'pressure');
    expect(pressVariants.length).toBe(2);
  });

  it('result summary lists unique normalised parameter names', () => {
    const result = parseLog(csvWithVariants);
    expect(result.summary.parameters).toContain('temperature');
    expect(result.summary.parameters).toContain('pressure');
    // No raw variants should appear
    expect(result.summary.parameters).not.toContain('Temp');
    expect(result.summary.parameters).not.toContain('TEMP_C');
  });
});
