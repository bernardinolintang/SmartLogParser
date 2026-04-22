// Log parsing engine - detects format and parses semiconductor tool logs

export type LogFormat = 'json' | 'xml' | 'csv' | 'syslog' | 'text' | 'hex' | 'keyvalue' | 'kv';

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
  severity?: 'info' | 'warning' | 'alarm' | 'critical';
  // Keep legacy compat
  equipment_id: string;
  step_id?: string;
  recipe_id?: string;
}

export interface ParseResult {
  run_id?: string;
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
  // Fields populated by the backend (not present in client-side fallback)
  total_events?: number;
  alarm_count?: number;
  warning_count?: number;
  duplicates_dropped?: number;
  failed_event_count?: number;
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
  const toolId = partial.tool_id || partial.equipment_id || '';
  return {
    timestamp: partial.timestamp || new Date().toISOString(),
    fab_id: partial.fab_id || '',
    tool_id: toolId,
    chamber_id: partial.chamber_id || '',
    recipe_name: partial.recipe_name || partial.recipe_id || '',
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
    const data: unknown = JSON.parse(content);
    const items = Array.isArray(data) ? data : [data];
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Record<string, unknown>;
      const toolId = String(row.EquipmentID || row.equipment_id || row.ToolID || row.tool_id || '');
      const recipeId = String(row.RecipeID || row.recipe_id || row.RecipeName || '');
      const lotId = row.LotID || row.lot_id ? String(row.LotID || row.lot_id) : undefined;
      const fabId = String(row.FabID || row.fab_id || '');
      const chamberId = String(row.ChamberID || row.chamber_id || '');
      const runId = String(row.RunID || row.run_id || `RUN_${toolId.slice(-2)}_001`);

      if (row.ProcessSteps || row.steps) {
        const steps = Array.isArray(row.ProcessSteps) ? row.ProcessSteps : (Array.isArray(row.steps) ? row.steps : []);
        for (const step of steps) {
          if (!step || typeof step !== 'object') continue;
          const stepRow = step as Record<string, unknown>;
          const stepId = stepRow.StepID || stepRow.step_id || stepRow.id;
          const stepName = stepRow.StepName || stepRow.step_name || '';
          const paramsRaw = stepRow.Parameters || stepRow.parameters || stepRow.params || {};
          const params = (paramsRaw && typeof paramsRaw === 'object') ? paramsRaw as Record<string, unknown> : {};
          for (const [key, val] of Object.entries(params)) {
            const v = val as unknown;
            const vObj = (v && typeof v === 'object') ? v as Record<string, unknown> : null;
            events.push(makeEvent({
              timestamp: String(stepRow.Timestamp || stepRow.timestamp || row.Timestamp || new Date().toISOString()),
              fab_id: fabId,
              tool_id: toolId,
              chamber_id: chamberId,
              recipe_name: recipeId,
              recipe_step: stepName || String(stepId),
              event_type: 'sensor',
              parameter: normalizeParam(key),
              value: vObj ? String(vObj.value ?? String(v)) : String(v),
              unit: vObj?.unit ? String(vObj.unit) : undefined,
              run_id: runId,
              lot_id: lotId,
              severity: 'info',
            }));
          }
        }
      } else {
        for (const [key, val] of Object.entries(row)) {
          if (['EquipmentID', 'equipment_id', 'RecipeID', 'LotID', 'Timestamp', 'ToolID', 'FabID', 'ChamberID', 'RunID'].includes(key)) continue;
          events.push(makeEvent({
            timestamp: String(row.Timestamp || row.timestamp || new Date().toISOString()),
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
      fab_id: row['fab_id'] || '',
      tool_id: row['equipment_id'] || row['tool_id'] || row['equipment'] || '',
      chamber_id: row['chamber_id'] || '',
      recipe_name: row['recipe_name'] || row['recipe'] || '',
      recipe_step: row['step_id'] || row['step'] || row['recipe_step'] || '',
      event_type: (row['event_type'] as ParsedEvent['event_type']) || 'sensor',
      parameter: normalizeParam(row['parameter'] || row['param'] || 'value'),
      value: row['value'] || row['reading'] || '',
      unit: row['unit'],
      run_id: row['run_id'] || `RUN_CSV_${i}`,
      lot_id: row['lot_id'],
      wafer_id: row['wafer_id'],
      severity: (row['severity'] as ParsedEvent['severity']) || 'info',
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
  const toolId = root.getAttribute('EquipmentID') || root.querySelector('EquipmentID')?.textContent || '';
  const recipeId = root.getAttribute('RecipeID') || root.querySelector('RecipeID')?.textContent || '';
  const chamberId = root.getAttribute('ChamberID') || '';

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
      const severity: ParsedEvent['severity'] = isAlarm ? 'alarm' : isWarning ? 'warning' : 'info';
      const eventType: ParsedEvent['event_type'] = isAlarm ? 'alarm' : isWarning ? 'warning' : 'sensor';
      if (kvPairs) {
        for (const kv of kvPairs) {
          const [key, val] = kv.split('=');
          const unitMatch = val.match(/^([\d.]+)(\w+)$/);
          events.push(makeEvent({
            timestamp: `2026-${timestamp}`,
            tool_id: equipment,
            event_type: eventType,
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
            event_type: eventType,
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
    tool_id: ascii.match(/[A-Z_]+\d+/)?.[0] || '',
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
      const toolId = pairs['equipment_id'] || pairs['tool_id'] || '';
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
      alarms: events.filter(e => e.severity === 'alarm' || e.severity === 'critical').length,
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

    'plasma_etch_01.json': JSON.stringify([
      { timestamp: "2026-03-10T08:00:01Z", tool_id: "ETCH_TOOL_03", chamber_id: "CH_A", recipe_name: "RCP_POLYETCH_05", recipe_step: "Pump Down", event_type: "STEP_START", parameter: null, value: null, unit: null, alarm_code: null, severity: null, message: "Step Pump Down initiated" },
      { timestamp: "2026-03-10T08:00:15Z", tool_id: "ETCH_TOOL_03", chamber_id: "CH_A", recipe_name: "RCP_POLYETCH_05", recipe_step: "Pump Down", event_type: "PARAMETER_READING", parameter: "pressure", value: 743.2, unit: "Torr", alarm_code: null, severity: null, message: null },
      { timestamp: "2026-03-10T08:00:30Z", tool_id: "ETCH_TOOL_03", chamber_id: "CH_A", recipe_name: "RCP_POLYETCH_05", recipe_step: "Pump Down", event_type: "PARAMETER_READING", parameter: "temperature", value: 24.8, unit: "C", alarm_code: null, severity: null, message: null },
      { timestamp: "2026-03-10T08:02:05Z", tool_id: "ETCH_TOOL_03", chamber_id: "CH_A", recipe_name: "RCP_POLYETCH_05", recipe_step: "Pump Down", event_type: "STEP_END", parameter: null, value: null, unit: null, alarm_code: null, severity: null, message: "Pump Down complete. Base pressure reached." },
      { timestamp: "2026-03-10T08:02:06Z", tool_id: "ETCH_TOOL_03", chamber_id: "CH_A", recipe_name: "RCP_POLYETCH_05", recipe_step: "Gas Stabilization", event_type: "STEP_START", parameter: null, value: null, unit: null, alarm_code: null, severity: null, message: "Step Gas Stabilization initiated" },
      { timestamp: "2026-03-10T08:02:20Z", tool_id: "ETCH_TOOL_03", chamber_id: "CH_A", recipe_name: "RCP_POLYETCH_05", recipe_step: "Gas Stabilization", event_type: "PARAMETER_READING", parameter: "gas_flow", value: 185.0, unit: "sccm", alarm_code: null, severity: null, message: null },
      { timestamp: "2026-03-10T08:02:35Z", tool_id: "ETCH_TOOL_03", chamber_id: "CH_A", recipe_name: "RCP_POLYETCH_05", recipe_step: "Gas Stabilization", event_type: "PARAMETER_READING", parameter: "pressure", value: 0.48, unit: "Torr", alarm_code: null, severity: null, message: null },
      { timestamp: "2026-03-10T08:04:00Z", tool_id: "ETCH_TOOL_03", chamber_id: "CH_A", recipe_name: "RCP_POLYETCH_05", recipe_step: "Gas Stabilization", event_type: "STEP_END", parameter: null, value: null, unit: null, alarm_code: null, severity: null, message: "Gas flow stabilized" },
      { timestamp: "2026-03-10T08:04:01Z", tool_id: "ETCH_TOOL_03", chamber_id: "CH_A", recipe_name: "RCP_POLYETCH_05", recipe_step: "Plasma Strike", event_type: "STEP_START", parameter: null, value: null, unit: null, alarm_code: null, severity: null, message: "RF power ramping for plasma ignition" },
      { timestamp: "2026-03-10T08:04:10Z", tool_id: "ETCH_TOOL_03", chamber_id: "CH_A", recipe_name: "RCP_POLYETCH_05", recipe_step: "Plasma Strike", event_type: "PARAMETER_READING", parameter: "rf_power", value: 320.5, unit: "W", alarm_code: null, severity: null, message: null },
      { timestamp: "2026-03-10T08:04:22Z", tool_id: "ETCH_TOOL_03", chamber_id: "CH_A", recipe_name: "RCP_POLYETCH_05", recipe_step: "Plasma Strike", event_type: "ALARM", parameter: "rf_power", value: 612.0, unit: "W", alarm_code: "ALM_RF_OVERPWR_001", severity: "WARNING", message: "RF power exceeded setpoint threshold during strike" },
      { timestamp: "2026-03-10T08:06:00Z", tool_id: "ETCH_TOOL_03", chamber_id: "CH_A", recipe_name: "RCP_POLYETCH_05", recipe_step: "Main Etch", event_type: "STEP_START", parameter: null, value: null, unit: null, alarm_code: null, severity: null, message: "Main Etch step commenced" },
      { timestamp: "2026-03-10T08:06:15Z", tool_id: "ETCH_TOOL_03", chamber_id: "CH_A", recipe_name: "RCP_POLYETCH_05", recipe_step: "Main Etch", event_type: "PARAMETER_READING", parameter: "rf_power", value: 490.0, unit: "W", alarm_code: null, severity: null, message: null },
      { timestamp: "2026-03-10T08:06:30Z", tool_id: "ETCH_TOOL_03", chamber_id: "CH_A", recipe_name: "RCP_POLYETCH_05", recipe_step: "Main Etch", event_type: "PARAMETER_READING", parameter: "pressure", value: 0.77, unit: "Torr", alarm_code: null, severity: null, message: null },
      { timestamp: "2026-03-10T08:06:45Z", tool_id: "ETCH_TOOL_03", chamber_id: "CH_A", recipe_name: "RCP_POLYETCH_05", recipe_step: "Main Etch", event_type: "PARAMETER_READING", parameter: "gas_flow", value: 342.1, unit: "sccm", alarm_code: null, severity: null, message: null },
      { timestamp: "2026-03-10T08:07:00Z", tool_id: "ETCH_TOOL_03", chamber_id: "CH_A", recipe_name: "RCP_POLYETCH_05", recipe_step: "Main Etch", event_type: "PARAMETER_READING", parameter: "temperature", value: 121.5, unit: "C", alarm_code: null, severity: null, message: null },
      { timestamp: "2026-03-10T08:14:00Z", tool_id: "ETCH_TOOL_03", chamber_id: "CH_A", recipe_name: "RCP_POLYETCH_05", recipe_step: "Main Etch", event_type: "STEP_END", parameter: null, value: null, unit: null, alarm_code: null, severity: null, message: "Main Etch complete. Endpoint detected." },
      { timestamp: "2026-03-10T08:14:01Z", tool_id: "ETCH_TOOL_03", chamber_id: "CH_A", recipe_name: "RCP_POLYETCH_05", recipe_step: "Cool Down", event_type: "STEP_START", parameter: null, value: null, unit: null, alarm_code: null, severity: null, message: "Cool Down step initiated. RF off." },
      { timestamp: "2026-03-10T08:15:30Z", tool_id: "ETCH_TOOL_03", chamber_id: "CH_A", recipe_name: "RCP_POLYETCH_05", recipe_step: "Cool Down", event_type: "PARAMETER_READING", parameter: "temperature", value: 65.2, unit: "C", alarm_code: null, severity: null, message: null },
      { timestamp: "2026-03-10T08:18:00Z", tool_id: "ETCH_TOOL_03", chamber_id: "CH_A", recipe_name: "RCP_POLYETCH_05", recipe_step: "Cool Down", event_type: "STEP_END", parameter: null, value: null, unit: null, alarm_code: null, severity: null, message: "Cool Down complete. Wafer transfer enabled." },
    ], null, 2),

    'pvd_sputter_01.csv': `timestamp,tool_id,chamber_id,recipe_name,recipe_step,event_type,parameter,value,unit,alarm_code,severity,message
2026-03-10T10:00:00Z,PVD_TOOL_01,CH_A,RCP_TiN_SPUTTER_02,Pump Down,STEP_START,,,,,,Pump Down initiated
2026-03-10T10:00:15Z,PVD_TOOL_01,CH_A,RCP_TiN_SPUTTER_02,Pump Down,PARAMETER_READING,pressure,750.0,Torr,,,
2026-03-10T10:00:30Z,PVD_TOOL_01,CH_A,RCP_TiN_SPUTTER_02,Pump Down,PARAMETER_READING,temperature,22.5,C,,,
2026-03-10T10:01:00Z,PVD_TOOL_01,CH_A,RCP_TiN_SPUTTER_02,Pump Down,PARAMETER_READING,pressure,120.4,Torr,,,
2026-03-10T10:01:30Z,PVD_TOOL_01,CH_A,RCP_TiN_SPUTTER_02,Pump Down,PARAMETER_READING,pressure,1.2,Torr,,,
2026-03-10T10:02:00Z,PVD_TOOL_01,CH_A,RCP_TiN_SPUTTER_02,Pump Down,PARAMETER_READING,pressure,0.005,Torr,,,
2026-03-10T10:02:10Z,PVD_TOOL_01,CH_A,RCP_TiN_SPUTTER_02,Pump Down,STEP_END,,,,,,Base pressure achieved
2026-03-10T10:02:11Z,PVD_TOOL_01,CH_A,RCP_TiN_SPUTTER_02,Ar Backfill,STEP_START,,,,,,Argon backfill for sputter atmosphere
2026-03-10T10:02:25Z,PVD_TOOL_01,CH_A,RCP_TiN_SPUTTER_02,Ar Backfill,PARAMETER_READING,gas_flow,150.0,sccm,,,
2026-03-10T10:03:00Z,PVD_TOOL_01,CH_A,RCP_TiN_SPUTTER_02,Ar Backfill,PARAMETER_READING,gas_flow,152.3,sccm,,,
2026-03-10T10:03:20Z,PVD_TOOL_01,CH_A,RCP_TiN_SPUTTER_02,Ar Backfill,STEP_END,,,,,,Ar flow stable
2026-03-10T10:03:21Z,PVD_TOOL_01,CH_A,RCP_TiN_SPUTTER_02,Pre-Sputter,STEP_START,,,,,,Target conditioning pre-sputter initiated
2026-03-10T10:03:35Z,PVD_TOOL_01,CH_A,RCP_TiN_SPUTTER_02,Pre-Sputter,PARAMETER_READING,rf_power,100.0,W,,,
2026-03-10T10:04:00Z,PVD_TOOL_01,CH_A,RCP_TiN_SPUTTER_02,Pre-Sputter,PARAMETER_READING,temperature,45.1,C,,,
2026-03-10T10:04:30Z,PVD_TOOL_01,CH_A,RCP_TiN_SPUTTER_02,Pre-Sputter,PARAMETER_READING,rf_power,600.0,W,,,
2026-03-10T10:05:00Z,PVD_TOOL_01,CH_A,RCP_TiN_SPUTTER_02,Pre-Sputter,STEP_END,,,,,,Pre-sputter complete
2026-03-10T10:05:01Z,PVD_TOOL_01,CH_A,RCP_TiN_SPUTTER_02,Deposition,STEP_START,,,,,,Main sputter deposition started
2026-03-10T10:05:15Z,PVD_TOOL_01,CH_A,RCP_TiN_SPUTTER_02,Deposition,PARAMETER_READING,rf_power,800.0,W,,,
2026-03-10T10:05:30Z,PVD_TOOL_01,CH_A,RCP_TiN_SPUTTER_02,Deposition,PARAMETER_READING,temperature,78.4,C,,,
2026-03-10T10:05:45Z,PVD_TOOL_01,CH_A,RCP_TiN_SPUTTER_02,Deposition,PARAMETER_READING,gas_flow,148.9,sccm,,,
2026-03-10T10:06:00Z,PVD_TOOL_01,CH_A,RCP_TiN_SPUTTER_02,Deposition,PARAMETER_READING,pressure,0.0034,Torr,,,
2026-03-10T10:06:30Z,PVD_TOOL_01,CH_A,RCP_TiN_SPUTTER_02,Deposition,ALARM,temperature,112.7,C,ALM_TEMP_HIGH_003,WARNING,Chuck temperature above limit
2026-03-10T10:07:00Z,PVD_TOOL_01,CH_A,RCP_TiN_SPUTTER_02,Deposition,PARAMETER_READING,rf_power,799.5,W,,,
2026-03-10T10:09:00Z,PVD_TOOL_01,CH_A,RCP_TiN_SPUTTER_02,Deposition,STEP_END,,,,,,Deposition complete
2026-03-10T10:09:01Z,PVD_TOOL_01,CH_A,RCP_TiN_SPUTTER_02,Cool Down,STEP_START,,,,,,RF off. N2 purge active.
2026-03-10T10:10:00Z,PVD_TOOL_01,CH_A,RCP_TiN_SPUTTER_02,Cool Down,PARAMETER_READING,temperature,55.0,C,,,
2026-03-10T10:11:30Z,PVD_TOOL_01,CH_A,RCP_TiN_SPUTTER_02,Cool Down,STEP_END,,,,,,Cool Down complete`,

    'euv_scanner_02.log': `Mar 10 11:00:00 EUV_SCAN_02 PROCESS[1042]: tool_id=EUV_SCAN_02 chamber_id=CH_EUV recipe=RCP_EUV_LITHO_07 step=Wafer_Load event=STEP_START msg="Wafer loaded onto chuck"
Mar 10 11:00:05 EUV_SCAN_02 SENSOR[1042]: tool_id=EUV_SCAN_02 chamber_id=CH_EUV recipe=RCP_EUV_LITHO_07 step=Wafer_Load parameter=temperature value=22.1 unit=C alarm_code=None
Mar 10 11:00:10 EUV_SCAN_02 SENSOR[1042]: tool_id=EUV_SCAN_02 chamber_id=CH_EUV recipe=RCP_EUV_LITHO_07 step=Wafer_Load parameter=pressure value=0.9 unit=Torr alarm_code=None
Mar 10 11:00:20 EUV_SCAN_02 PROCESS[1042]: tool_id=EUV_SCAN_02 chamber_id=CH_EUV recipe=RCP_EUV_LITHO_07 step=Wafer_Load event=STEP_END msg="Wafer load complete. Vacuum seal confirmed."
Mar 10 11:00:21 EUV_SCAN_02 PROCESS[1042]: tool_id=EUV_SCAN_02 chamber_id=CH_EUV recipe=RCP_EUV_LITHO_07 step=Reticle_Align event=STEP_START msg="Reticle alignment sequence initiated"
Mar 10 11:00:35 EUV_SCAN_02 SENSOR[1042]: tool_id=EUV_SCAN_02 chamber_id=CH_EUV recipe=RCP_EUV_LITHO_07 step=Reticle_Align parameter=temperature value=22.3 unit=C alarm_code=None
Mar 10 11:00:50 EUV_SCAN_02 SENSOR[1042]: tool_id=EUV_SCAN_02 chamber_id=CH_EUV recipe=RCP_EUV_LITHO_07 step=Reticle_Align parameter=pressure value=0.85 unit=Torr alarm_code=None
Mar 10 11:01:10 EUV_SCAN_02 ALARM[1042]: tool_id=EUV_SCAN_02 chamber_id=CH_EUV recipe=RCP_EUV_LITHO_07 step=Reticle_Align parameter=pressure value=1.4 unit=Torr alarm_code=ALM_PRESS_DRIFT_011 severity=WARNING msg="Reticle chamber pressure drifting above nominal"
Mar 10 11:01:20 EUV_SCAN_02 PROCESS[1042]: tool_id=EUV_SCAN_02 chamber_id=CH_EUV recipe=RCP_EUV_LITHO_07 step=Reticle_Align event=STEP_END msg="Alignment complete. Overlay error within spec."
Mar 10 11:01:21 EUV_SCAN_02 PROCESS[1042]: tool_id=EUV_SCAN_02 chamber_id=CH_EUV recipe=RCP_EUV_LITHO_07 step=Exposure event=STEP_START msg="EUV exposure step started. Source on."
Mar 10 11:01:30 EUV_SCAN_02 SENSOR[1042]: tool_id=EUV_SCAN_02 chamber_id=CH_EUV recipe=RCP_EUV_LITHO_07 step=Exposure parameter=rf_power value=480.0 unit=W alarm_code=None
Mar 10 11:01:45 EUV_SCAN_02 SENSOR[1042]: tool_id=EUV_SCAN_02 chamber_id=CH_EUV recipe=RCP_EUV_LITHO_07 step=Exposure parameter=temperature value=23.0 unit=C alarm_code=None
Mar 10 11:02:00 EUV_SCAN_02 SENSOR[1042]: tool_id=EUV_SCAN_02 chamber_id=CH_EUV recipe=RCP_EUV_LITHO_07 step=Exposure parameter=gas_flow value=55.0 unit=sccm alarm_code=None
Mar 10 11:02:15 EUV_SCAN_02 SENSOR[1042]: tool_id=EUV_SCAN_02 chamber_id=CH_EUV recipe=RCP_EUV_LITHO_07 step=Exposure parameter=pressure value=0.88 unit=Torr alarm_code=None
Mar 10 11:02:45 EUV_SCAN_02 ALARM[1042]: tool_id=EUV_SCAN_02 chamber_id=CH_EUV recipe=RCP_EUV_LITHO_07 step=Exposure parameter=rf_power value=540.1 unit=W alarm_code=ALM_RF_OVERPWR_002 severity=WARNING msg="Source power transient spike detected"
Mar 10 11:03:00 EUV_SCAN_02 SENSOR[1042]: tool_id=EUV_SCAN_02 chamber_id=CH_EUV recipe=RCP_EUV_LITHO_07 step=Exposure parameter=rf_power value=479.8 unit=W alarm_code=None
Mar 10 11:03:30 EUV_SCAN_02 PROCESS[1042]: tool_id=EUV_SCAN_02 chamber_id=CH_EUV recipe=RCP_EUV_LITHO_07 step=Exposure event=STEP_END msg="Exposure complete. Dose confirmed within spec."
Mar 10 11:03:31 EUV_SCAN_02 PROCESS[1042]: tool_id=EUV_SCAN_02 chamber_id=CH_EUV recipe=RCP_EUV_LITHO_07 step=Wafer_Unload event=STEP_START msg="Wafer unload sequence initiated"
Mar 10 11:03:45 EUV_SCAN_02 SENSOR[1042]: tool_id=EUV_SCAN_02 chamber_id=CH_EUV recipe=RCP_EUV_LITHO_07 step=Wafer_Unload parameter=pressure value=760.0 unit=Torr alarm_code=None
Mar 10 11:04:00 EUV_SCAN_02 PROCESS[1042]: tool_id=EUV_SCAN_02 chamber_id=CH_EUV recipe=RCP_EUV_LITHO_07 step=Wafer_Unload event=STEP_END msg="Wafer unload complete. Robot transfer ready."`,

    'ald_tool_01.kv': `timestamp=2026-03-10T12:00:00Z tool_id=ALD_TOOL_01 chamber_id=CH_ALD recipe_name=RCP_HfO2_ALD_04 recipe_step=Purge event_type=STEP_START alarm_code=None message="Purge cycle initiated"
timestamp=2026-03-10T12:00:10Z tool_id=ALD_TOOL_01 chamber_id=CH_ALD recipe_name=RCP_HfO2_ALD_04 recipe_step=Purge event_type=PARAMETER_READING parameter=gas_flow value=300.0 unit=sccm alarm_code=None
timestamp=2026-03-10T12:00:20Z tool_id=ALD_TOOL_01 chamber_id=CH_ALD recipe_name=RCP_HfO2_ALD_04 recipe_step=Purge event_type=PARAMETER_READING parameter=pressure value=1.05 unit=Torr alarm_code=None
timestamp=2026-03-10T12:00:30Z tool_id=ALD_TOOL_01 chamber_id=CH_ALD recipe_name=RCP_HfO2_ALD_04 recipe_step=Purge event_type=PARAMETER_READING parameter=temperature value=250.0 unit=C alarm_code=None
timestamp=2026-03-10T12:00:45Z tool_id=ALD_TOOL_01 chamber_id=CH_ALD recipe_name=RCP_HfO2_ALD_04 recipe_step=Purge event_type=STEP_END alarm_code=None message="Purge complete"
timestamp=2026-03-10T12:00:46Z tool_id=ALD_TOOL_01 chamber_id=CH_ALD recipe_name=RCP_HfO2_ALD_04 recipe_step=Precursor_A_Dose event_type=STEP_START alarm_code=None message="HfCl4 precursor dose started"
timestamp=2026-03-10T12:01:00Z tool_id=ALD_TOOL_01 chamber_id=CH_ALD recipe_name=RCP_HfO2_ALD_04 recipe_step=Precursor_A_Dose event_type=PARAMETER_READING parameter=gas_flow value=25.0 unit=sccm alarm_code=None
timestamp=2026-03-10T12:01:10Z tool_id=ALD_TOOL_01 chamber_id=CH_ALD recipe_name=RCP_HfO2_ALD_04 recipe_step=Precursor_A_Dose event_type=PARAMETER_READING parameter=pressure value=1.22 unit=Torr alarm_code=None
timestamp=2026-03-10T12:01:20Z tool_id=ALD_TOOL_01 chamber_id=CH_ALD recipe_name=RCP_HfO2_ALD_04 recipe_step=Precursor_A_Dose event_type=PARAMETER_READING parameter=temperature value=251.3 unit=C alarm_code=None
timestamp=2026-03-10T12:01:30Z tool_id=ALD_TOOL_01 chamber_id=CH_ALD recipe_name=RCP_HfO2_ALD_04 recipe_step=Precursor_A_Dose event_type=STEP_END alarm_code=None message="HfCl4 dose complete"
timestamp=2026-03-10T12:01:31Z tool_id=ALD_TOOL_01 chamber_id=CH_ALD recipe_name=RCP_HfO2_ALD_04 recipe_step=Purge_A event_type=STEP_START alarm_code=None message="Post-precursor purge started"
timestamp=2026-03-10T12:01:40Z tool_id=ALD_TOOL_01 chamber_id=CH_ALD recipe_name=RCP_HfO2_ALD_04 recipe_step=Purge_A event_type=PARAMETER_READING parameter=gas_flow value=300.0 unit=sccm alarm_code=None
timestamp=2026-03-10T12:02:35Z tool_id=ALD_TOOL_01 chamber_id=CH_ALD recipe_name=RCP_HfO2_ALD_04 recipe_step=Oxidant_Dose event_type=ALARM parameter=pressure value=1.85 unit=Torr alarm_code=ALM_PRESS_SPIKE_005 severity=WARNING message="Pressure spike during H2O dose. Valve timing check recommended."
timestamp=2026-03-10T12:02:55Z tool_id=ALD_TOOL_01 chamber_id=CH_ALD recipe_name=RCP_HfO2_ALD_04 recipe_step=Oxidant_Dose event_type=STEP_END alarm_code=None message="H2O dose complete"
timestamp=2026-03-10T12:03:10Z tool_id=ALD_TOOL_01 chamber_id=CH_ALD recipe_name=RCP_HfO2_ALD_04 recipe_step=Purge_B event_type=PARAMETER_READING parameter=gas_flow value=300.0 unit=sccm alarm_code=None
timestamp=2026-03-10T12:03:20Z tool_id=ALD_TOOL_01 chamber_id=CH_ALD recipe_name=RCP_HfO2_ALD_04 recipe_step=Purge_B event_type=PARAMETER_READING parameter=temperature value=250.5 unit=C alarm_code=None
timestamp=2026-03-10T12:03:30Z tool_id=ALD_TOOL_01 chamber_id=CH_ALD recipe_name=RCP_HfO2_ALD_04 recipe_step=Purge_B event_type=STEP_END alarm_code=None message="Purge B complete. ALD cycle 1 done."`,

    'etch_tool_06_binary.hex': `# TOOL: ETCH_TOOL_06 | CHAMBER: CH_B | RECIPE: RCP_DRYETCH_09 | FORMAT: HEX_PACKED_V2
# FIELDS: [UNIX_TS_4B][TOOL_ID_8B][CHAMBER_ID_4B][STEP_ID_1B][EVENT_TYPE_1B][PARAM_ID_1B][VALUE_4B_FLOAT][ALARM_1B][CHECKSUM_1B]
# EVENT_TYPE: 01=STEP_START 02=STEP_END 03=PARAMETER_READING 04=ALARM
# PARAM_ID:   01=temperature 02=pressure 03=rf_power 04=gas_flow FF=N/A
# ALARM_CODE: 00=None A1=ALM_TEMP_HIGH_003 A2=ALM_RF_OVERPWR_001 A3=ALM_PRESS_DRIFT_011 A4=ALM_GASFLOW_HIGH_007
67CE 5200 4554 4348 5F54 4F4F 4C5F 3036 4348 5F42 0101 FF00 0000 0000 7A
67CE 5210 4554 4348 5F54 4F4F 4C5F 3036 4348 5F42 0103 0242 3C00 0000 8B
67CE 5220 4554 4348 5F54 4F4F 4C5F 3036 4348 5F42 0103 0141 C800 0000 9C
67CE 5300 4554 4348 5F54 4F4F 4C5F 3036 4348 5F42 0301 FF00 0000 0000 36
67CE 5310 4554 4348 5F54 4F4F 4C5F 3036 4348 5F42 0303 0343 9600 0000 47
67CE 5330 4554 4348 5F54 4F4F 4C5F 3036 4348 5F42 0304 0244 1800 00A2 69
67CE 5350 4554 4348 5F54 4F4F 4C5F 3036 4348 5F42 0401 FF00 0000 0000 8B
67CE 5360 4554 4348 5F54 4F4F 4C5F 3036 4348 5F42 0403 0344 1400 0000 9C
67CE 5370 4554 4348 5F54 4F4F 4C5F 3036 4348 5F42 0403 0142 F200 0000 AD
67CE 53C0 4554 4348 5F54 4F4F 4C5F 3036 4348 5F42 0404 0143 8800 00A1 F2
67CE 53E0 4554 4348 5F54 4F4F 4C5F 3036 4348 5F42 0402 FF00 0000 0000 14
67CE 53E1 4554 4348 5F54 4F4F 4C5F 3036 4348 5F42 0501 FF00 0000 0000 25
67CE 5400 4554 4348 5F54 4F4F 4C5F 3036 4348 5F42 0503 0142 8400 0000 36
67CE 5460 4554 4348 5F54 4F4F 4C5F 3036 4348 5F42 0502 FF00 0000 0000 69`,

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
