// Log parsing engine - detects format and parses semiconductor tool logs

export type LogFormat = 'json' | 'xml' | 'csv' | 'syslog' | 'text' | 'hex' | 'keyvalue';

export interface ParsedEvent {
  timestamp: string;
  fab_id: string;
  tool_id: string;
  chamber_id: string;
  recipe_name: string;
  recipe_step: string;
  event_type: 'sensor' | 'alarm' | 'warning' | 'step_start' | 'step_end' | 'process_start' | 'process_end' | 'info';
  parameter: string;
  value: string;
  unit?: string;
  alarm_code?: string;
  run_id: string;
  lot_id?: string;
  wafer_id?: string;
  severity?: 'info' | 'warning' | 'alarm';
  // Keep legacy compat
  equipment_id: string;
  step_id?: string;
  recipe_id?: string;
}

export interface ParseResult {
  format: LogFormat;
  events: ParsedEvent[];
  rawContent: string;
  summary: {
    totalEvents: number;
    equipmentIds: string[];
    parameters: string[];
    timeRange: { start: string; end: string };
    alarms: number;
    warnings: number;
    fabIds: string[];
    toolIds: string[];
    chamberIds: string[];
    recipeNames: string[];
    runIds: string[];
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

function makeEvent(partial: Partial<ParsedEvent>): ParsedEvent {
  const toolId = partial.tool_id || partial.equipment_id || 'UNKNOWN';
  return {
    timestamp: partial.timestamp || new Date().toISOString(),
    fab_id: partial.fab_id || 'FAB_01',
    tool_id: toolId,
    chamber_id: partial.chamber_id || 'CH_A',
    recipe_name: partial.recipe_name || partial.recipe_id || 'UNKNOWN',
    recipe_step: partial.recipe_step || partial.step_id || '',
    event_type: partial.event_type || 'sensor',
    parameter: partial.parameter || '',
    value: partial.value || '',
    unit: partial.unit,
    alarm_code: partial.alarm_code,
    run_id: partial.run_id || `RUN_${Date.now().toString(36).slice(-6).toUpperCase()}`,
    lot_id: partial.lot_id,
    wafer_id: partial.wafer_id,
    severity: partial.severity || 'info',
    equipment_id: toolId,
    step_id: partial.recipe_step || partial.step_id || '',
    recipe_id: partial.recipe_name || partial.recipe_id || '',
  };
}

function parseJSON(content: string): ParsedEvent[] {
  const events: ParsedEvent[] = [];
  try {
    const data = JSON.parse(content);
    const items = Array.isArray(data) ? data : [data];
    for (const item of items) {
      const toolId = item.EquipmentID || item.equipment_id || item.ToolID || item.tool_id || 'UNKNOWN';
      const recipeId = item.RecipeID || item.recipe_id || item.RecipeName || '';
      const lotId = item.LotID || item.lot_id;
      const fabId = item.FabID || item.fab_id || 'FAB_01';
      const chamberId = item.ChamberID || item.chamber_id || 'CH_A';
      const runId = item.RunID || item.run_id || `RUN_${toolId.slice(-2)}_001`;

      if (item.ProcessSteps || item.steps) {
        const steps = item.ProcessSteps || item.steps;
        for (const step of steps) {
          const stepId = step.StepID || step.step_id || step.id;
          const stepName = step.StepName || step.step_name || '';
          const params = step.Parameters || step.parameters || step.params || {};
          for (const [key, val] of Object.entries(params)) {
            const v = val as any;
            events.push(makeEvent({
              timestamp: step.Timestamp || step.timestamp || item.Timestamp || new Date().toISOString(),
              fab_id: fabId,
              tool_id: toolId,
              chamber_id: chamberId,
              recipe_name: recipeId,
              recipe_step: stepName || String(stepId),
              event_type: 'sensor',
              parameter: normalizeParam(key),
              value: typeof v === 'object' ? (v.value ?? String(v)) : String(v),
              unit: typeof v === 'object' ? v.unit : undefined,
              run_id: runId,
              lot_id: lotId,
              severity: 'info',
            }));
          }
        }
      } else {
        for (const [key, val] of Object.entries(item)) {
          if (['EquipmentID', 'equipment_id', 'RecipeID', 'LotID', 'Timestamp', 'ToolID', 'FabID', 'ChamberID', 'RunID'].includes(key)) continue;
          events.push(makeEvent({
            timestamp: item.Timestamp || item.timestamp || new Date().toISOString(),
            fab_id: fabId,
            tool_id: toolId,
            chamber_id: chamberId,
            recipe_name: recipeId,
            parameter: normalizeParam(key),
            value: String(val),
            run_id: runId,
            lot_id: lotId,
            severity: 'info',
          }));
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
    events.push(makeEvent({
      timestamp: row['timestamp'] || row['time'] || new Date().toISOString(),
      fab_id: row['fab_id'] || 'FAB_01',
      tool_id: row['equipment_id'] || row['tool_id'] || row['equipment'] || 'UNKNOWN',
      chamber_id: row['chamber_id'] || 'CH_A',
      recipe_name: row['recipe_name'] || row['recipe'] || '',
      recipe_step: row['step_id'] || row['step'] || row['recipe_step'] || '',
      event_type: (row['event_type'] as any) || 'sensor',
      parameter: normalizeParam(row['parameter'] || row['param'] || 'value'),
      value: row['value'] || row['reading'] || '',
      unit: row['unit'],
      run_id: row['run_id'] || `RUN_CSV_${i}`,
      lot_id: row['lot_id'],
      wafer_id: row['wafer_id'],
      severity: row['severity'] as any || 'info',
    }));
  }
  return events;
}

function parseXML(content: string): ParsedEvent[] {
  const events: ParsedEvent[] = [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(content, 'text/xml');
  const steps = doc.querySelectorAll('Step');
  const root = doc.documentElement;
  const toolId = root.getAttribute('EquipmentID') || root.querySelector('EquipmentID')?.textContent || 'UNKNOWN';
  const recipeId = root.getAttribute('RecipeID') || root.querySelector('RecipeID')?.textContent || '';
  const chamberId = root.getAttribute('ChamberID') || 'CH_A';

  if (steps.length > 0) {
    steps.forEach(step => {
      const stepId = step.getAttribute('id') || step.getAttribute('StepID') || '';
      const params = step.querySelectorAll('Param, Parameter');
      params.forEach(param => {
        const name = param.getAttribute('name') || param.getAttribute('Name') || 'unknown';
        const value = param.textContent || param.getAttribute('value') || '';
        events.push(makeEvent({
          timestamp: step.getAttribute('timestamp') || new Date().toISOString(),
          tool_id: toolId,
          chamber_id: chamberId,
          recipe_name: recipeId,
          recipe_step: stepId,
          parameter: normalizeParam(name),
          value: value.trim(),
          severity: 'info',
        }));
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
      const isAlarm = category === 'ALARM';
      const isWarning = category === 'WARNING';
      const severity = isAlarm ? 'alarm' : isWarning ? 'warning' : 'info';
      const eventType = isAlarm ? 'alarm' : isWarning ? 'warning' : 'sensor';
      if (kvPairs) {
        for (const kv of kvPairs) {
          const [key, val] = kv.split('=');
          const unitMatch = val.match(/^([\d.]+)(\w+)$/);
          events.push(makeEvent({
            timestamp: `2026-${timestamp}`,
            tool_id: equipment,
            event_type: eventType as any,
            parameter: normalizeParam(key),
            value: unitMatch ? unitMatch[1] : val,
            unit: unitMatch ? unitMatch[2] : undefined,
            alarm_code: isAlarm ? `ALM_${key.toUpperCase()}` : undefined,
            severity,
          }));
        }
      } else {
        events.push(makeEvent({
          timestamp: `2026-${timestamp}`,
          tool_id: equipment,
          event_type: eventType as any,
          parameter: category.toLowerCase(),
          value: rest,
          severity,
        }));
      }
    }
  }
  return events;
}

function parseHex(content: string): ParsedEvent[] {
  const hexBytes = content.trim().split(/\s+/);
  const ascii = hexBytes.map(b => {
    const code = parseInt(b, 16);
    return code >= 32 && code < 127 ? String.fromCharCode(code) : '.';
  }).join('');

  return [makeEvent({
    tool_id: ascii.match(/[A-Z_]+\d+/)?.[0] || 'UNKNOWN',
    parameter: 'binary_payload',
    value: ascii,
    event_type: 'info',
  })];
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
      const toolId = pairs['equipment_id'] || pairs['tool_id'] || 'UNKNOWN';
      delete pairs['timestamp'];
      delete pairs['equipment_id'];
      delete pairs['tool_id'];
      for (const [key, val] of Object.entries(pairs)) {
        events.push(makeEvent({
          timestamp,
          tool_id: toolId,
          parameter: normalizeParam(key),
          value: val,
        }));
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
      events.push(makeEvent({
        parameter: normalizeParam(paramMatch[1].trim()),
        value: paramMatch[2],
        unit: paramMatch[3],
      }));
    } else {
      const setMatch = line.match(/([\w\s]+?)\s+set to\s+([\d.]+)\s*(\w+)?/i);
      if (setMatch) {
        events.push(makeEvent({
          parameter: normalizeParam(setMatch[1].trim()),
          value: setMatch[2],
          unit: setMatch[3],
        }));
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
    rawContent: content,
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
      fabIds: [...new Set(events.map(e => e.fab_id))],
      toolIds: [...new Set(events.map(e => e.tool_id))],
      chamberIds: [...new Set(events.map(e => e.chamber_id))],
      recipeNames: [...new Set(events.map(e => e.recipe_name).filter(Boolean))],
      runIds: [...new Set(events.map(e => e.run_id))],
    },
    rawPreview: content.slice(0, 500),
  };
}

// Enhanced synthetic log generation with full fab hierarchy
export function getSampleLogs(): Record<string, string> {
  return {
    'etch_tool_json.json': JSON.stringify({
      FabID: "FAB_01",
      EquipmentID: "ETCH_TOOL_01",
      ChamberID: "CH_A",
      RecipeID: "RCP_POLYETCH_02",
      LotID: "LOT_2026_0305",
      RunID: "RUN_ET01_001",
      Timestamp: "2026-03-05T11:00:00Z",
      ProcessSteps: [
        { StepID: 1, StepName: "Pump Down", Timestamp: "2026-03-05T11:00:05Z", Parameters: { Temperature: { value: 25, unit: "C" }, Pressure: { value: 760, unit: "Torr" }, GasFlow: { value: 0, unit: "sccm" } } },
        { StepID: 2, StepName: "Gas Stabilization", Timestamp: "2026-03-05T11:02:10Z", Parameters: { Temperature: { value: 80, unit: "C" }, Pressure: { value: 0.5, unit: "Torr" }, GasFlow: { value: 200, unit: "sccm" } } },
        { StepID: 3, StepName: "Plasma Etch", Timestamp: "2026-03-05T11:05:30Z", Parameters: { Temperature: { value: 120, unit: "C" }, Pressure: { value: 0.8, unit: "Torr" }, RF_Power: { value: 500, unit: "W" }, GasFlow: { value: 350, unit: "sccm" } } },
        { StepID: 4, StepName: "Main Etch", Timestamp: "2026-03-05T11:10:00Z", Parameters: { Temperature: { value: 120, unit: "C" }, Pressure: { value: 0.75, unit: "Torr" }, RF_Power: { value: 480, unit: "W" }, GasFlow: { value: 340, unit: "sccm" } } },
        { StepID: 5, StepName: "Cool Down", Timestamp: "2026-03-05T11:15:00Z", Parameters: { Temperature: { value: 40, unit: "C" }, Pressure: { value: 200, unit: "Torr" }, GasFlow: { value: 50, unit: "sccm" } } },
      ]
    }, null, 2),

    'deposition_csv.csv': `timestamp,equipment_id,chamber_id,parameter,value,unit,step_id,recipe_name,run_id
2026-03-05T11:00:00,DEP_TOOL_01,CH_B,temperature,400,C,Preheat,CVD_OXIDE_01,RUN_DT01_001
2026-03-05T11:00:05,DEP_TOOL_01,CH_B,pressure,2.5,Torr,Preheat,CVD_OXIDE_01,RUN_DT01_001
2026-03-05T11:00:10,DEP_TOOL_01,CH_B,gas_flow,500,sccm,Preheat,CVD_OXIDE_01,RUN_DT01_001
2026-03-05T11:02:00,DEP_TOOL_01,CH_B,temperature,420,C,Deposition,CVD_OXIDE_01,RUN_DT01_001
2026-03-05T11:02:05,DEP_TOOL_01,CH_B,pressure,2.8,Torr,Deposition,CVD_OXIDE_01,RUN_DT01_001
2026-03-05T11:02:10,DEP_TOOL_01,CH_B,rf_power,800,W,Deposition,CVD_OXIDE_01,RUN_DT01_001
2026-03-05T11:04:00,DEP_TOOL_01,CH_B,temperature,415,C,Stabilize,CVD_OXIDE_01,RUN_DT01_001
2026-03-05T11:04:05,DEP_TOOL_01,CH_B,pressure,2.6,Torr,Stabilize,CVD_OXIDE_01,RUN_DT01_001
2026-03-05T11:04:10,DEP_TOOL_01,CH_B,gas_flow,480,sccm,Stabilize,CVD_OXIDE_01,RUN_DT01_001
2026-03-05T11:06:00,DEP_TOOL_01,CH_B,temperature,30,C,Cool Down,CVD_OXIDE_01,RUN_DT01_001
2026-03-05T11:06:05,DEP_TOOL_01,CH_B,pressure,760,Torr,Cool Down,CVD_OXIDE_01,RUN_DT01_001`,

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

    'multi_chamber_etch.json': JSON.stringify([
      {
        FabID: "FAB_01", EquipmentID: "ETCH_TOOL_02", ChamberID: "CH_A", RecipeID: "RCP_SI_ETCH_01", RunID: "RUN_ET02_001", LotID: "LOT_2026_0306",
        ProcessSteps: [
          { StepID: 1, StepName: "Pump Down", Timestamp: "2026-03-06T09:00:00Z", Parameters: { Temperature: { value: 22, unit: "C" }, Pressure: { value: 750, unit: "Torr" } } },
          { StepID: 2, StepName: "Plasma Etch", Timestamp: "2026-03-06T09:05:00Z", Parameters: { Temperature: { value: 150, unit: "C" }, Pressure: { value: 0.6, unit: "Torr" }, RF_Power: { value: 550, unit: "W" }, GasFlow: { value: 400, unit: "sccm" } } },
          { StepID: 3, StepName: "Over Etch", Timestamp: "2026-03-06T09:10:00Z", Parameters: { Temperature: { value: 155, unit: "C" }, Pressure: { value: 0.65, unit: "Torr" }, RF_Power: { value: 530, unit: "W" } } },
        ]
      },
      {
        FabID: "FAB_01", EquipmentID: "ETCH_TOOL_02", ChamberID: "CH_B", RecipeID: "RCP_SI_ETCH_01", RunID: "RUN_ET02_002", LotID: "LOT_2026_0306",
        ProcessSteps: [
          { StepID: 1, StepName: "Pump Down", Timestamp: "2026-03-06T09:15:00Z", Parameters: { Temperature: { value: 23, unit: "C" }, Pressure: { value: 755, unit: "Torr" } } },
          { StepID: 2, StepName: "Plasma Etch", Timestamp: "2026-03-06T09:20:00Z", Parameters: { Temperature: { value: 148, unit: "C" }, Pressure: { value: 0.62, unit: "Torr" }, RF_Power: { value: 545, unit: "W" }, GasFlow: { value: 395, unit: "sccm" } } },
          { StepID: 3, StepName: "Over Etch", Timestamp: "2026-03-06T09:25:00Z", Parameters: { Temperature: { value: 152, unit: "C" }, Pressure: { value: 0.68, unit: "Torr" }, RF_Power: { value: 525, unit: "W" } } },
        ]
      }
    ], null, 2),
  };
}

// Generate streaming simulation data
export function generateStreamEvent(toolId: string, chamberId: string, recipeName: string, stepName: string, runId: string): ParsedEvent {
  const params = ['temperature', 'pressure', 'rf_power', 'gas_flow'];
  const param = params[Math.floor(Math.random() * params.length)];
  const ranges: Record<string, { base: number; var: number; unit: string }> = {
    temperature: { base: 120, var: 30, unit: 'C' },
    pressure: { base: 1.0, var: 0.5, unit: 'Torr' },
    rf_power: { base: 500, var: 50, unit: 'W' },
    gas_flow: { base: 300, var: 80, unit: 'sccm' },
  };
  const r = ranges[param];
  const value = r.base + (Math.random() - 0.5) * r.var * 2;
  const isAlarm = Math.random() < 0.05;
  const isWarning = !isAlarm && Math.random() < 0.1;

  return makeEvent({
    timestamp: new Date().toISOString(),
    fab_id: 'FAB_01',
    tool_id: toolId,
    chamber_id: chamberId,
    recipe_name: recipeName,
    recipe_step: stepName,
    event_type: isAlarm ? 'alarm' : isWarning ? 'warning' : 'sensor',
    parameter: param,
    value: value.toFixed(2),
    unit: r.unit,
    alarm_code: isAlarm ? `ALM_${param.toUpperCase()}_OOR` : undefined,
    run_id: runId,
    severity: isAlarm ? 'alarm' : isWarning ? 'warning' : 'info',
  });
}
