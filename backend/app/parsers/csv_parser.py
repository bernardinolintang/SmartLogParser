"""Deterministic parser for CSV semiconductor logs.

Handles three CSV layouts:
  1. Standard  — has 'parameter' (or aliased) + 'value' (or aliased) columns.
     One sensor reading per row.
  2. Wide      — sensor readings spread across multiple columns, e.g.
     Timestamp,ToolID,WaferID,StepID,Temp_C,Pressure_mTorr,RF_Power_W,...
     Each sensor column is melted into its own event row.
  3. Alarm-log — no parameter/value/sensor columns; rows represent alarm events.
     Alarm code and description are used as the event payload.

Column-name aliases normalise vendor-specific headers to the canonical schema.
The AnomalyFlag column (when present) is used to boost severity so that
ground-truth annotations are reflected in the parsed events.
"""
from __future__ import annotations

import csv
import io
import re

from app.utils.mappings import normalize_parameter, normalize_event_type, normalize_severity, infer_tool_type
from app.utils.unit_parser import parse_value_unit

# ── Metadata column names (never treated as sensor readings) ─────────────────
_META_COLS: frozenset[str] = frozenset({
    "timestamp", "time", "date", "datetime",
    "toolid", "tool_id", "equipment_id", "equipment", "equipmentid",
    "waferid", "wafer_id", "wafer",
    "stepid", "step_id", "step", "step_name",
    "lotid", "lot_id", "lot",
    "recipeid", "recipe_id", "recipe", "recipe_name",
    "chamberid", "chamber_id", "chamber",
    "fabid", "fab_id", "fab",
    "run_id", "runid",
    "severity", "alarm_code", "alarmcode", "alarmid", "alarm_id",
    "status", "result", "fdcresult", "fdc_result",
    "anomalyflag", "anomaly_flag", "anomaly",
    "message", "description",
    "control_limit_lo", "control_limit_hi", "controllimitlo", "controllimithi",
    "sigmalevel", "sigma_level", "sigma",
    "parametername", "parameter_name", "paramname", "param_name",
    "measuredvalue", "measured_value",
    "pass_fail", "passfail", "state", "action",
    "expected", "actual",
})

# ── Column-name aliases: lowercase-stripped header → canonical name ───────────
_COL_ALIASES: dict[str, str] = {
    "toolid":           "tool_id",
    "equipmentid":      "tool_id",
    "equipment":        "tool_id",
    "waferid":          "wafer_id",
    "lotid":            "lot_id",
    "stepid":           "recipe_step",
    "step_name":        "recipe_step",
    "recipeid":         "recipe_name",
    "alarmcode":        "alarm_code",
    "alarmid":          "alarm_id",     # sequence number, not stored
    "description":      "message",
    "parametername":    "parameter",
    "paramname":        "parameter",
    "param_name":       "parameter",
    "measuredvalue":    "value",
    "measured_value":   "value",
    "fdcresult":        "fdc_result",
    "sigmalevel":       "sigma_level",
    "anomalyflag":      "anomaly_flag",
    "anomaly_flag":     "anomaly_flag",
}

# ── AnomalyFlag → severity / event_type overrides ────────────────────────────
_FLAG_SEV: dict[str, str] = {
    "out_of_range":   "alarm",
    "alarm":          "alarm",
    "alarm_cascade":  "alarm",
    "corrupt":        "alarm",
    "ts_gap":         "warning",
    "ts_reversal":    "warning",
    "missing_field":  "warning",
    "missing":        "warning",
    "fault":          "alarm",
    "warning":        "warning",
}

_FLAG_ET: dict[str, str] = {
    "alarm":         "ALARM",
    "alarm_cascade": "ALARM",
    "fault":         "ALARM",
}


def _flag_severity(flag: str) -> str | None:
    key = flag.split(":")[0].strip().lower()
    return _FLAG_SEV.get(key)


def _flag_event_type(flag: str) -> str | None:
    key = flag.split(":")[0].strip().lower()
    return _FLAG_ET.get(key)


def parse_csv(content: str, run_id: str) -> list[dict]:
    events: list[dict] = []
    reader = csv.DictReader(io.StringIO(content))

    if not reader.fieldnames:
        return events

    # ── Build header → canonical-name map ────────────────────────────────────
    col_map: dict[str, str] = {}  # original_header → canonical_name
    for orig in reader.fieldnames:
        if not orig:
            continue
        norm = orig.strip().lower()
        col_map[orig] = _COL_ALIASES.get(norm, norm)

    canonical_vals = set(col_map.values())
    has_param = "parameter" in canonical_vals
    has_value = "value" in canonical_vals

    # ── Identify sensor columns for wide-format melt ──────────────────────────
    sensor_cols: list[tuple[str, str]] = []  # (original_header, canonical_name)
    if not (has_param and has_value):
        for orig, canon in col_map.items():
            if canon not in _META_COLS and canon not in ("parameter", "value", "unit",
                                                          "alarm_code", "alarm_id",
                                                          "message", "fdc_result",
                                                          "sigma_level", "anomaly_flag"):
                sensor_cols.append((orig, canon))

    # ── Parse rows ────────────────────────────────────────────────────────────
    for line_num, row in enumerate(reader, start=2):
        # Build canonical-keyed row dict
        lrow: dict[str, str] = {}
        for orig, val in row.items():
            if not orig:
                continue
            canon = col_map.get(orig, orig.strip().lower())
            lrow[canon] = val.strip() if isinstance(val, str) else ""

        # ── Extract common meta fields ────────────────────────────────────────
        tool_id      = lrow.get("tool_id") or lrow.get("equipment_id") or lrow.get("equipment") or ""
        timestamp    = lrow.get("timestamp") or lrow.get("time") or lrow.get("date") or ""
        wafer_id     = lrow.get("wafer_id") or None
        lot_id       = lrow.get("lot_id") or None
        recipe_step  = lrow.get("recipe_step") or lrow.get("step") or ""
        recipe_name  = lrow.get("recipe_name") or lrow.get("recipe") or ""
        alarm_code   = lrow.get("alarm_code") or None
        message      = lrow.get("message") or None
        anomaly_flag = lrow.get("anomaly_flag") or ""
        raw_severity = lrow.get("severity") or "info"
        raw_et       = lrow.get("event_type") or lrow.get("status") or ""

        # AnomalyFlag boosts severity / event_type when informative
        flag_sev = _flag_severity(anomaly_flag)
        flag_et  = _flag_event_type(anomaly_flag)

        severity   = normalize_severity(flag_sev or raw_severity)
        event_type = normalize_event_type(flag_et or raw_et or "sensor")

        base = {
            "run_id":       lrow.get("run_id") or run_id,
            "timestamp":    timestamp,
            "tool_id":      tool_id,
            "tool_type":    infer_tool_type(tool_id),
            "wafer_id":     wafer_id,
            "lot_id":       lot_id,
            "recipe_step":  recipe_step,
            "recipe_name":  recipe_name,
            "alarm_code":   alarm_code,
            "message":      message,
            "severity":     severity,
            "raw_line_number": line_num,
            "parse_status": "ok",
        }

        # ── Wide format: one event per sensor column ──────────────────────────
        if sensor_cols and not (has_param and has_value):
            for orig_col, sensor_name in sensor_cols:
                raw_v = lrow.get(sensor_name, "")
                if not raw_v:
                    continue
                val, unit = parse_value_unit(raw_v)
                events.append({
                    **base,
                    "event_type": event_type if event_type != "PARAMETER_READING"
                                  else "PARAMETER_READING",
                    "parameter":  normalize_parameter(sensor_name),
                    "value":      val,
                    "unit":       lrow.get("unit") or unit,
                })

        # ── Standard format: single parameter + value per row ─────────────────
        elif has_param and has_value:
            raw_v = lrow.get("value") or lrow.get("reading") or ""
            val, inferred_unit = parse_value_unit(raw_v)
            unit = lrow.get("unit") or inferred_unit
            parameter = lrow.get("parameter") or lrow.get("param") or "value"
            events.append({
                **base,
                "event_type": event_type,
                "parameter":  normalize_parameter(parameter),
                "value":      val,
                "unit":       unit,
            })

        # ── Alarm-log format: emit alarm/info event per row ───────────────────
        else:
            parameter = alarm_code or "alarm_event"
            value_str = message or alarm_code or "1"
            et = "ALARM" if severity in ("alarm", "critical") else (
                 "WARNING" if severity == "warning" else "INFO")
            events.append({
                **base,
                "event_type": et,
                "parameter":  normalize_parameter(parameter),
                "value":      value_str,
                "unit":       None,
            })

    return events
