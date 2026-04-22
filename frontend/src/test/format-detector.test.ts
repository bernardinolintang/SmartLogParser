import { describe, it, expect } from 'vitest';
import { detectFormat } from '@/lib/logParser';

describe('detectFormat', () => {
  it('detects JSON from object string', () => {
    expect(detectFormat('{"tool_id":"ETCH_01","value":120}')).toBe('json');
  });

  it('detects JSON from array string', () => {
    expect(detectFormat('[{"parameter":"temperature"}]')).toBe('json');
  });

  it('detects XML', () => {
    expect(detectFormat('<ToolLog><Step id="1"/></ToolLog>')).toBe('xml');
  });

  it('detects CSV by comma-separated header + rows', () => {
    const csv = 'timestamp,tool_id,parameter,value\n2026-01-01,ETCH_01,temperature,120';
    expect(detectFormat(csv)).toBe('csv');
  });

  it('detects syslog by RFC3164 prefix', () => {
    expect(detectFormat('Mar 05 11:00:08 EUV_SCAN_01 SENSOR temp=120C')).toBe('syslog');
  });

  it('detects hex by space-separated hex pairs', () => {
    expect(detectFormat('45 54 43 48 5F 54 4F 4F 4C')).toBe('hex');
  });

  it('falls back to text for unrecognised content', () => {
    expect(detectFormat('some random plain text content here')).toBe('text');
  });
});
