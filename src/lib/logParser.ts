// Log parsing engine - detects format and parses semiconductor tool logs

export type LogFormat = 'json' | 'xml' | 'csv' | 'syslog' | 'text' | 'hex' | 'keyvalue';

export interface ParsedEvent {
  timestamp: string;
  equipment_id: string;
  step_id?: string;
  parameter: string;
  value: string;
  unit?: string;
  lot_id?: string;
  wafer_id?: string;
  recipe_id?: string;
  severity?: 'info' | 'warning' | 'alarm';
}

export interface ParseResult {
  format: LogFormat;
  events: ParsedEvent[];
  summary: {
    totalEvents: number;
    equipmentIds: string[];
    parameters: string[];
    timeRange: { start: string; end: string };
    alarms: number;
    warnings: number;
  };
  rawPreview: string;
}

// Normalize parameter names across vendors
const PARAM_MAP: Record<string, string> = {
  'temp': 'temperature', 'Temp': 'temperature', 'Temperature': 'temperature', 'temp_c': 'temperature', 'TEMP': 'temperature',
  'press': 'pressure', 'Press': 'pressure', 'Pressure': 'pressure', 'PRESSURE': 'pressure',
  'rf_power': 'rf_power', 'RF_Power': 'rf_power', 'RFPower': 'rf_power', 'RF Power': 'rf_power',
  'gas_flow': 'gas_flow', 'GasFlow': 'gas_flow', 'Gas_Flow': 'gas_flow',
  'power': 'power', 'Power': 'power', 'laser_power': 'laser_power',
};

function normalizeParam(name: string): string {
  return PARAM_MAP[name] || name.toLowerCase().replace(/\s+/g, '_');
}

// Format detection
export function detectFormat(content: string): LogFormat {
  const trimmed = content.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json';
  if (trimmed.startsWith('<?xml') || trimmed.startsWith('<')) {
    if (trimmed.includes('</') || trimmed.includes('/>')) return 'xml';
  }
  if (/^[0-9A-Fa-f]{2}(\s[0-9A-Fa-f]{2})+/.test(trimmed)) return 'hex';
  const lines = trimmed.split('\n');
  if (lines[0] && lines[0].split(',').length >= 3 && lines.length > 1) return 'csv';
  if (/^\w{3}\s+\d{2}\s+\d{2}:\d{2}:\d{2}/.test(trimmed)) return 'syslog';
  if (/\w+=\S+/.test(trimmed) && trimmed.split('\n').every(l => !l.trim() || l.includes('='))) return 'keyvalue';
  return 'text';
}

function parseJSON(content: string): ParsedEvent[] {
  const events: ParsedEvent[] = [];
  try {
    const data = JSON.parse(content);
    const items = Array.isArray(data) ? data : [data];
    for (const item of items) {
      const equipId = item.EquipmentID || item.equipment_id || 'UNKNOWN';
      const recipeId = item.RecipeID || item.recipe_id;
      const lotId = item.LotID || item.lot_id;
      if (item.ProcessSteps || item.steps) {
        const steps = item.ProcessSteps || item.steps;
        for (const step of steps) {
          const stepId = step.StepID || step.step_id || step.id;
          const params = step.Parameters || step.parameters || step.params || {};
          for (const [key, val] of Object.entries(params)) {
            const v = val as any;
            events.push({
              timestamp: step.Timestamp || step.timestamp || item.Timestamp || new Date().toISOString(),
              equipment_id: equipId,
              step_id: String(stepId),
              parameter: normalizeParam(key),
              value: typeof v === 'object' ? (v.value ?? String(v)) : String(v),
              unit: typeof v === 'object' ? v.unit : undefined,
              recipe_id: recipeId,
              lot_id: lotId,
              severity: 'info',
            });
          }
        }
      } else {
        for (const [key, val] of Object.entries(item)) {
          if (['EquipmentID', 'equipment_id', 'RecipeID', 'LotID', 'Timestamp'].includes(key)) continue;
          events.push({
            timestamp: item.Timestamp || item.timestamp || new Date().toISOString(),
            equipment_id: equipId,
            parameter: normalizeParam(key),
            value: String(val),
            recipe_id: recipeId,
            lot_id: lotId,
            severity: 'info',
          });
        }
      }
    }
  } catch { /* invalid json */ }
  return events;
}

function parseCSV(content: string): ParsedEvent[] {
  const events: ParsedEvent[] = [];
  const lines = content.trim().split('\n');
  if (lines.length < 2) return events;
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(',').map(v => v.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = vals[idx] || ''; });
    events.push({
      timestamp: row['timestamp'] || row['time'] || new Date().toISOString(),
      equipment_id: row['equipment_id'] || row['tool_id'] || row['equipment'] || 'UNKNOWN',
      parameter: normalizeParam(row['parameter'] || row['param'] || 'value'),
      value: row['value'] || row['reading'] || '',
      unit: row['unit'],
      step_id: row['step_id'] || row['step'],
      lot_id: row['lot_id'],
      wafer_id: row['wafer_id'],
      severity: row['severity'] as any || 'info',
    });
  }
  return events;
}

function parseXML(content: string): ParsedEvent[] {
  const events: ParsedEvent[] = [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(content, 'text/xml');
  const steps = doc.querySelectorAll('Step');
  const root = doc.documentElement;
  const equipId = root.getAttribute('EquipmentID') || root.querySelector('EquipmentID')?.textContent || 'UNKNOWN';
  const recipeId = root.getAttribute('RecipeID') || root.querySelector('RecipeID')?.textContent;
  
  if (steps.length > 0) {
    steps.forEach(step => {
      const stepId = step.getAttribute('id') || step.getAttribute('StepID') || '';
      const params = step.querySelectorAll('Param, Parameter');
      params.forEach(param => {
        const name = param.getAttribute('name') || param.getAttribute('Name') || 'unknown';
        const value = param.textContent || param.getAttribute('value') || '';
        events.push({
          timestamp: step.getAttribute('timestamp') || new Date().toISOString(),
          equipment_id: equipId,
          step_id: stepId,
          parameter: normalizeParam(name),
          value: value.trim(),
          recipe_id: recipeId || undefined,
          severity: 'info',
        });
      });
    });
  }
  return events;
}

function parseSyslog(content: string): ParsedEvent[] {
  const events: ParsedEvent[] = [];
  const lines = content.trim().split('\n');
  for (const line of lines) {
    const match = line.match(/^(\w{3}\s+\d{2}\s+[\d:]+)\s+(\S+)\s+(\S+)\s+(.*)/);
    if (match) {
      const [, timestamp, equipment, category, rest] = match;
      const kvPairs = rest.match(/(\w+)=(\S+)/g);
      const severity = category === 'ALARM' ? 'alarm' : category === 'WARNING' ? 'warning' : 'info';
      if (kvPairs) {
        for (const kv of kvPairs) {
          const [key, val] = kv.split('=');
          const unitMatch = val.match(/^([\d.]+)(\w+)$/);
          events.push({
            timestamp: `2026-${timestamp}`,
            equipment_id: equipment,
            parameter: normalizeParam(key),
            value: unitMatch ? unitMatch[1] : val,
            unit: unitMatch ? unitMatch[2] : undefined,
            severity,
          });
        }
      } else {
        events.push({
          timestamp: `2026-${timestamp}`,
          equipment_id: equipment,
          parameter: category.toLowerCase(),
          value: rest,
          severity,
        });
      }
    }
  }
  return events;
}

function parseHex(content: string): ParsedEvent[] {
  const events: ParsedEvent[] = [];
  const hexBytes = content.trim().split(/\s+/);
  const ascii = hexBytes.map(b => {
    const code = parseInt(b, 16);
    return code >= 32 && code < 127 ? String.fromCharCode(code) : '.';
  }).join('');
  
  events.push({
    timestamp: new Date().toISOString(),
    equipment_id: ascii.match(/[A-Z_]+\d+/)?.[0] || 'UNKNOWN',
    parameter: 'binary_payload',
    value: ascii,
    severity: 'info',
  });
  return events;
}

function parseKeyValue(content: string): ParsedEvent[] {
  const events: ParsedEvent[] = [];
  const lines = content.trim().split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    const pairs: Record<string, string> = {};
    const matches = line.matchAll(/(\w+)=(\S+)/g);
    for (const m of matches) {
      pairs[m[1]] = m[2];
    }
    if (Object.keys(pairs).length > 0) {
      const timestamp = pairs['timestamp'] || new Date().toISOString();
      const equipId = pairs['equipment_id'] || pairs['tool_id'] || 'UNKNOWN';
      delete pairs['timestamp'];
      delete pairs['equipment_id'];
      delete pairs['tool_id'];
      for (const [key, val] of Object.entries(pairs)) {
        events.push({
          timestamp,
          equipment_id: equipId,
          parameter: normalizeParam(key),
          value: val,
          severity: 'info',
        });
      }
    }
  }
  return events;
}

function parseText(content: string): ParsedEvent[] {
  const events: ParsedEvent[] = [];
  const lines = content.trim().split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    const paramMatch = line.match(/([\w\s]+?):\s*([\d.]+)\s*(\w+)?/);
    if (paramMatch) {
      events.push({
        timestamp: new Date().toISOString(),
        equipment_id: 'UNKNOWN',
        parameter: normalizeParam(paramMatch[1].trim()),
        value: paramMatch[2],
        unit: paramMatch[3],
        severity: 'info',
      });
    } else {
      const setMatch = line.match(/([\w\s]+?)\s+set to\s+([\d.]+)\s*(\w+)?/i);
      if (setMatch) {
        events.push({
          timestamp: new Date().toISOString(),
          equipment_id: 'UNKNOWN',
          parameter: normalizeParam(setMatch[1].trim()),
          value: setMatch[2],
          unit: setMatch[3],
          severity: 'info',
        });
      }
    }
  }
  return events;
}

export function parseLog(content: string): ParseResult {
  const format = detectFormat(content);
  let events: ParsedEvent[] = [];

  switch (format) {
    case 'json': events = parseJSON(content); break;
    case 'csv': events = parseCSV(content); break;
    case 'xml': events = parseXML(content); break;
    case 'syslog': events = parseSyslog(content); break;
    case 'hex': events = parseHex(content); break;
    case 'keyvalue': events = parseKeyValue(content); break;
    case 'text': events = parseText(content); break;
  }

  const equipmentIds = [...new Set(events.map(e => e.equipment_id))];
  const parameters = [...new Set(events.map(e => e.parameter))];
  const timestamps = events.map(e => e.timestamp).filter(Boolean).sort();

  return {
    format,
    events,
    summary: {
      totalEvents: events.length,
      equipmentIds,
      parameters,
      timeRange: {
        start: timestamps[0] || '',
        end: timestamps[timestamps.length - 1] || '',
      },
      alarms: events.filter(e => e.severity === 'alarm').length,
      warnings: events.filter(e => e.severity === 'warning').length,
    },
    rawPreview: content.slice(0, 500),
  };
}

// Generate sample logs for demo
export function getSampleLogs(): Record<string, string> {
  return {
    'etch_tool_json.json': JSON.stringify({
      EquipmentID: "ETCH_TOOL_01",
      RecipeID: "RCP_POLYETCH_02",
      LotID: "LOT_2026_0305",
      Timestamp: "2026-03-05T11:00:00Z",
      ProcessSteps: [
        { StepID: 1, Timestamp: "2026-03-05T11:00:05Z", Parameters: { Temperature: { value: 25, unit: "C" }, Pressure: { value: 760, unit: "Torr" }, GasFlow: { value: 0, unit: "sccm" } } },
        { StepID: 2, Timestamp: "2026-03-05T11:02:10Z", Parameters: { Temperature: { value: 80, unit: "C" }, Pressure: { value: 0.5, unit: "Torr" }, GasFlow: { value: 200, unit: "sccm" } } },
        { StepID: 3, Timestamp: "2026-03-05T11:05:30Z", Parameters: { Temperature: { value: 120, unit: "C" }, Pressure: { value: 0.8, unit: "Torr" }, RF_Power: { value: 500, unit: "W" }, GasFlow: { value: 350, unit: "sccm" } } },
        { StepID: 4, Timestamp: "2026-03-05T11:10:00Z", Parameters: { Temperature: { value: 120, unit: "C" }, Pressure: { value: 0.75, unit: "Torr" }, RF_Power: { value: 480, unit: "W" }, GasFlow: { value: 340, unit: "sccm" } } },
        { StepID: 5, Timestamp: "2026-03-05T11:15:00Z", Parameters: { Temperature: { value: 40, unit: "C" }, Pressure: { value: 200, unit: "Torr" }, GasFlow: { value: 50, unit: "sccm" } } },
      ]
    }, null, 2),

    'deposition_csv.csv': `timestamp,equipment_id,parameter,value,unit,step_id
2026-03-05T11:00:00,DEP_TOOL_01,temperature,400,C,1
2026-03-05T11:00:05,DEP_TOOL_01,pressure,2.5,Torr,1
2026-03-05T11:00:10,DEP_TOOL_01,gas_flow,500,sccm,1
2026-03-05T11:02:00,DEP_TOOL_01,temperature,420,C,2
2026-03-05T11:02:05,DEP_TOOL_01,pressure,2.8,Torr,2
2026-03-05T11:02:10,DEP_TOOL_01,rf_power,800,W,2
2026-03-05T11:04:00,DEP_TOOL_01,temperature,415,C,3
2026-03-05T11:04:05,DEP_TOOL_01,pressure,2.6,Torr,3
2026-03-05T11:04:10,DEP_TOOL_01,gas_flow,480,sccm,3
2026-03-05T11:06:00,DEP_TOOL_01,temperature,30,C,4
2026-03-05T11:06:05,DEP_TOOL_01,pressure,760,Torr,4`,

    'euv_scanner_syslog.log': `Mar 05 11:00:08 EUV_SCAN_01 SENSOR rf_power=480W temperature=22C pressure=1.2Torr
Mar 05 11:00:15 EUV_SCAN_01 SENSOR laser_power=1200W wavelength=13.5nm
Mar 05 11:01:02 EUV_SCAN_01 ALARM temperature=85C rf_power=520W
Mar 05 11:01:30 EUV_SCAN_01 WARNING pressure=0.3Torr gas_flow=150sccm
Mar 05 11:02:00 EUV_SCAN_01 SENSOR temperature=45C pressure=0.8Torr
Mar 05 11:02:30 EUV_SCAN_01 SENSOR rf_power=500W gas_flow=300sccm
Mar 05 11:03:00 EUV_SCAN_01 WARNING temperature=78C
Mar 05 11:03:30 EUV_SCAN_01 SENSOR temperature=35C pressure=1.0Torr`,

    'metrology_kv.log': `timestamp=2026-03-05T11:30:05 equipment_id=METRO_TOOL_01 temperature=23.5 humidity=45.2 vibration=0.002
timestamp=2026-03-05T11:30:10 equipment_id=METRO_TOOL_01 measurement=cd_width value=32.5 unit=nm
timestamp=2026-03-05T11:30:15 equipment_id=METRO_TOOL_01 measurement=overlay value=1.2 unit=nm
timestamp=2026-03-05T11:30:20 equipment_id=METRO_TOOL_01 temperature=23.6 humidity=45.1 vibration=0.003
timestamp=2026-03-05T11:30:25 equipment_id=METRO_TOOL_01 measurement=thickness value=150.3 unit=nm`,

    'binary_hex.log': `45 54 43 48 5F 54 4F 4F 4C 5F 30 36 20 54 45 4D 50 3D 31 32 30 43 20 50 52 45 53 53 3D 30 2E 38 54`,
  };
}
