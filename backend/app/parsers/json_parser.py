"""Deterministic parser for JSON semiconductor logs.

Handles three schemas:
  1. SEMI/GEM ControlJob — Vendor A style with deep nesting:
     ControlJob → ProcessJobs[] → ModuleProcessReports[] → SensorData[] → Measurements[]
  2. ProcessSteps / steps — flat step + parameters dict
  3. Flat key/value rows — fallback for other vendor objects

Adding a new vendor schema is a schema adapter: implement a _parse_<vendor>()
function that walks the vendor-specific tree and emits the same normalised
event dict as the existing adapters. No other code changes are needed.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

from app.utils.mappings import normalize_parameter, infer_tool_type
from app.utils.unit_parser import parse_value_unit

_SKIP_KEYS = {
    "EquipmentID", "equipment_id", "ToolID", "tool_id",
    "RecipeID", "recipe_id", "RecipeName", "recipe_name",
    "LotID", "lot_id", "Timestamp", "timestamp",
    "FabID", "fab_id", "ChamberID", "chamber_id",
    "RunID", "run_id", "WaferID", "wafer_id",
    "ProcessSteps", "steps",
    "ControlJob", "ProcessJobs",
}

_ALARM_EVENT_TEXTS = {"alarm", "error", "fault", "fail", "critical"}
_WARNING_EVENT_TEXTS = {"warn", "drift", "caution", "low", "high"}


def _severity_from_text(text: str) -> str:
    low = text.lower()
    if any(k in low for k in _ALARM_EVENT_TEXTS):
        return "alarm"
    if any(k in low for k in _WARNING_EVENT_TEXTS):
        return "warning"
    return "info"


def _parse_control_job(item: dict, run_id: str) -> list[dict]:
    """Vendor A adapter — walks SEMI/GEM ControlJob schema.

    Schema path:
      item["ControlJob"]["ProcessJobs"][*]["ModuleProcessReports"][*]
        .SensorData[*].Measurements[*]   → PARAMETER_READING events
        .Attributes.Events.ControlStateEvents[*] → INFO / ALARM events
        .Attributes.Events.Alarms[*]     → ALARM events
    """
    events: list[dict] = []
    cj = item.get("ControlJob", {})
    tool_id = cj.get("EquipmentID") or cj.get("equipment_id") or ""
    fab_id = cj.get("FabID") or cj.get("fab_id") or ""
    tool_type = infer_tool_type(tool_id)

    for pjob in cj.get("ProcessJobs", []):
        lot_id = pjob.get("LotID") or pjob.get("lot_id")
        wafer_id = pjob.get("WaferID") or pjob.get("wafer_id")
        recipe = pjob.get("RecipeID") or pjob.get("recipe_id") or ""

        for report in pjob.get("ModuleProcessReports", []):
            keys = report.get("Keys", {})
            module_id = keys.get("ModuleID") or keys.get("module_id") or ""
            step_id = keys.get("RecipeStepID") or keys.get("recipe_step_id") or ""
            step_name = keys.get("RecipeStepName") or keys.get("recipe_step_name") or str(step_id)

            # ── Sensor readings ───────────────────────────────────────────────
            for sensor in report.get("SensorData", []):
                sensor_name = sensor.get("SensorName") or sensor.get("sensor_name") or sensor.get("SensorID") or "unknown"
                unit = sensor.get("Unit") or sensor.get("unit")
                for meas in sensor.get("Measurements", []):
                    ts = meas.get("DateTime") or meas.get("timestamp") or datetime.now(timezone.utc).isoformat()
                    val = str(meas.get("Value", meas.get("value", "")))
                    events.append({
                        "run_id": run_id,
                        "timestamp": ts,
                        "fab_id": fab_id,
                        "tool_id": tool_id,
                        "tool_type": tool_type,
                        "chamber_id": module_id,
                        "module_id": module_id,
                        "lot_id": lot_id,
                        "wafer_id": wafer_id,
                        "recipe_name": recipe,
                        "recipe_step": step_name,
                        "event_type": "PARAMETER_READING",
                        "parameter": normalize_parameter(sensor_name),
                        "value": val,
                        "unit": unit,
                        "severity": "info",
                        "parse_status": "ok",
                    })

            # ── Control state events ──────────────────────────────────────────
            attrs = report.get("Attributes", {})
            evt_block = attrs.get("Events", {})
            for cse in evt_block.get("ControlStateEvents", []):
                ts = cse.get("DateTime") or cse.get("timestamp") or datetime.now(timezone.utc).isoformat()
                text = cse.get("Text") or cse.get("message") or ""
                severity = _severity_from_text(text)
                events.append({
                    "run_id": run_id,
                    "timestamp": ts,
                    "fab_id": fab_id,
                    "tool_id": tool_id,
                    "tool_type": tool_type,
                    "chamber_id": module_id,
                    "module_id": module_id,
                    "lot_id": lot_id,
                    "wafer_id": wafer_id,
                    "recipe_name": recipe,
                    "recipe_step": step_name,
                    "event_type": "INFO" if severity == "info" else "ALARM",
                    "parameter": "control_state",
                    "value": text,
                    "unit": None,
                    "alarm_code": str(cse.get("EventID", "")),
                    "severity": severity,
                    "message": text,
                    "parse_status": "ok",
                })

            # ── Alarm records ─────────────────────────────────────────────────
            for alarm in evt_block.get("Alarms", []):
                ts = alarm.get("DateTime") or alarm.get("timestamp") or datetime.now(timezone.utc).isoformat()
                text = alarm.get("Text") or alarm.get("message") or alarm.get("AlarmText") or ""
                events.append({
                    "run_id": run_id,
                    "timestamp": ts,
                    "fab_id": fab_id,
                    "tool_id": tool_id,
                    "tool_type": tool_type,
                    "chamber_id": module_id,
                    "module_id": module_id,
                    "lot_id": lot_id,
                    "wafer_id": wafer_id,
                    "recipe_name": recipe,
                    "recipe_step": step_name,
                    "event_type": "ALARM",
                    "parameter": "alarm",
                    "value": text,
                    "unit": None,
                    "alarm_code": str(alarm.get("AlarmID") or alarm.get("EventID") or ""),
                    "severity": "alarm",
                    "message": text,
                    "parse_status": "ok",
                })

    return events


def parse_json(content: str, run_id: str) -> list[dict]:
    events: list[dict] = []
    try:
        data = json.loads(content)
    except json.JSONDecodeError:
        return events

    items = data if isinstance(data, list) else [data]

    for item in items:
        # ── Vendor A: SEMI/GEM ControlJob schema ─────────────────────────────
        if "ControlJob" in item:
            events.extend(_parse_control_job(item, run_id))
            continue

        tool_id = item.get("EquipmentID") or item.get("equipment_id") or item.get("ToolID") or item.get("tool_id") or ""
        recipe = item.get("RecipeID") or item.get("recipe_id") or item.get("RecipeName") or ""
        lot_id = item.get("LotID") or item.get("lot_id")
        fab_id = item.get("FabID") or item.get("fab_id") or ""
        chamber_id = item.get("ChamberID") or item.get("chamber_id") or ""
        item_run_id = item.get("RunID") or item.get("run_id") or run_id
        wafer_id = item.get("WaferID") or item.get("wafer_id")
        tool_type = infer_tool_type(tool_id)

        steps = item.get("ProcessSteps") or item.get("steps")
        if steps:
            for step in steps:
                step_id = step.get("StepID") or step.get("step_id") or step.get("id") or ""
                step_name = step.get("StepName") or step.get("step_name") or str(step_id)
                ts = step.get("Timestamp") or step.get("timestamp") or item.get("Timestamp") or datetime.now(timezone.utc).isoformat()
                params = step.get("Parameters") or step.get("parameters") or step.get("params") or {}

                for key, val in params.items():
                    if isinstance(val, dict):
                        v = str(val.get("value", ""))
                        u = val.get("unit")
                    else:
                        v, u = parse_value_unit(str(val))

                    events.append({
                        "run_id": item_run_id,
                        "timestamp": ts,
                        "fab_id": fab_id,
                        "tool_id": tool_id,
                        "tool_type": tool_type,
                        "chamber_id": chamber_id,
                        "lot_id": lot_id,
                        "wafer_id": wafer_id,
                        "recipe_name": recipe,
                        "recipe_step": step_name,
                        "event_type": "PARAMETER_READING",
                        "parameter": normalize_parameter(key),
                        "value": v,
                        "unit": u,
                        "severity": "info",
                        "parse_status": "ok",
                    })
        else:
            ts = item.get("Timestamp") or item.get("timestamp") or datetime.now(timezone.utc).isoformat()
            for key, val in item.items():
                if key in _SKIP_KEYS:
                    continue
                v, u = parse_value_unit(str(val))
                events.append({
                    "run_id": item_run_id,
                    "timestamp": ts,
                    "fab_id": fab_id,
                    "tool_id": tool_id,
                    "tool_type": tool_type,
                    "chamber_id": chamber_id,
                    "lot_id": lot_id,
                    "wafer_id": wafer_id,
                    "recipe_name": recipe,
                    "recipe_step": "",
                    "event_type": "PARAMETER_READING",
                    "parameter": normalize_parameter(key),
                    "value": v,
                    "unit": u,
                    "severity": "info",
                    "parse_status": "ok",
                })

    return events
