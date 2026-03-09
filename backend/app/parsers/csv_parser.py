"""Deterministic parser for CSV semiconductor logs.

Expects header row with columns mapping to the canonical schema.
"""

import csv
import io

from app.utils.mappings import normalize_parameter, normalize_event_type, normalize_severity, infer_tool_type
from app.utils.unit_parser import parse_value_unit


def parse_csv(content: str, run_id: str) -> list[dict]:
    events: list[dict] = []
    reader = csv.DictReader(io.StringIO(content))

    for line_num, row in enumerate(reader, start=2):
        lrow = {k.strip().lower(): v.strip() for k, v in row.items() if k}
        tool_id = lrow.get("equipment_id") or lrow.get("tool_id") or lrow.get("equipment") or "UNKNOWN"
        raw_val = lrow.get("value") or lrow.get("reading") or ""
        val, inferred_unit = parse_value_unit(raw_val)
        unit = lrow.get("unit") or inferred_unit

        events.append({
            "run_id": lrow.get("run_id") or run_id,
            "timestamp": lrow.get("timestamp") or lrow.get("time") or "",
            "fab_id": lrow.get("fab_id") or "FAB_01",
            "tool_id": tool_id,
            "tool_type": infer_tool_type(tool_id),
            "chamber_id": lrow.get("chamber_id") or "CH_A",
            "lot_id": lrow.get("lot_id"),
            "wafer_id": lrow.get("wafer_id"),
            "recipe_name": lrow.get("recipe_name") or lrow.get("recipe") or "",
            "recipe_step": lrow.get("step_id") or lrow.get("step") or lrow.get("recipe_step") or "",
            "event_type": normalize_event_type(lrow.get("event_type") or "sensor"),
            "parameter": normalize_parameter(lrow.get("parameter") or lrow.get("param") or "value"),
            "value": val,
            "unit": unit,
            "alarm_code": lrow.get("alarm_code"),
            "severity": normalize_severity(lrow.get("severity") or "info"),
            "message": lrow.get("message"),
            "raw_line_number": line_num,
            "parse_status": "ok",
        })

    return events
