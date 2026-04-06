"""Deterministic parser for JSON semiconductor logs.

Handles both single objects and arrays, with nested ProcessSteps.
"""
from __future__ import annotations


import json
from datetime import datetime

from app.utils.mappings import normalize_parameter, infer_tool_type
from app.utils.unit_parser import parse_value_unit

_SKIP_KEYS = {
    "EquipmentID", "equipment_id", "ToolID", "tool_id",
    "RecipeID", "recipe_id", "RecipeName", "recipe_name",
    "LotID", "lot_id", "Timestamp", "timestamp",
    "FabID", "fab_id", "ChamberID", "chamber_id",
    "RunID", "run_id", "WaferID", "wafer_id",
    "ProcessSteps", "steps",
}


def parse_json(content: str, run_id: str) -> list[dict]:
    events: list[dict] = []
    try:
        data = json.loads(content)
    except json.JSONDecodeError:
        return events

    items = data if isinstance(data, list) else [data]

    for item in items:
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
                ts = step.get("Timestamp") or step.get("timestamp") or item.get("Timestamp") or datetime.utcnow().isoformat()
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
            ts = item.get("Timestamp") or item.get("timestamp") or datetime.utcnow().isoformat()
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
