"""Deterministic parser for XML semiconductor logs.

Uses defusedxml for safe parsing (no external entity attacks).
"""

from defusedxml import ElementTree as ET

from app.utils.mappings import normalize_parameter, infer_tool_type
from app.utils.unit_parser import parse_value_unit


def parse_xml(content: str, run_id: str) -> list[dict]:
    events: list[dict] = []
    try:
        root = ET.fromstring(content)
    except ET.ParseError:
        return events

    tool_id = root.get("EquipmentID") or _child_text(root, "EquipmentID") or "UNKNOWN"
    recipe_id = root.get("RecipeID") or _child_text(root, "RecipeID") or ""
    chamber_id = root.get("ChamberID") or _child_text(root, "ChamberID") or "CH_A"
    fab_id = root.get("FabID") or _child_text(root, "FabID") or "FAB_01"
    lot_id = root.get("LotID") or _child_text(root, "LotID")
    xml_run_id = root.get("RunID") or _child_text(root, "RunID") or run_id
    tool_type = infer_tool_type(tool_id)

    for step in root.iter("Step"):
        step_id = step.get("id") or step.get("StepID") or ""
        step_name = step.get("name") or step.get("StepName") or step_id
        ts = step.get("timestamp") or step.get("Timestamp") or ""

        for param in list(step.iter("Param")) + list(step.iter("Parameter")):
            name = param.get("name") or param.get("Name") or "unknown"
            raw_val = (param.text or param.get("value") or "").strip()
            val, unit = parse_value_unit(raw_val)
            unit = unit or param.get("unit")

            events.append({
                "run_id": xml_run_id,
                "timestamp": ts,
                "fab_id": fab_id,
                "tool_id": tool_id,
                "tool_type": tool_type,
                "chamber_id": chamber_id,
                "lot_id": lot_id,
                "recipe_name": recipe_id,
                "recipe_step": step_name,
                "event_type": "PARAMETER_READING",
                "parameter": normalize_parameter(name),
                "value": val,
                "unit": unit,
                "severity": "info",
                "parse_status": "ok",
            })

    if not events:
        for param in list(root.iter("Param")) + list(root.iter("Parameter")) + list(root.iter("Event")):
            name = param.get("name") or param.get("Name") or param.tag
            raw_val = (param.text or param.get("value") or "").strip()
            val, unit = parse_value_unit(raw_val)
            events.append({
                "run_id": xml_run_id,
                "timestamp": param.get("timestamp") or "",
                "fab_id": fab_id,
                "tool_id": tool_id,
                "tool_type": tool_type,
                "chamber_id": chamber_id,
                "recipe_name": recipe_id,
                "recipe_step": "",
                "event_type": "PARAMETER_READING",
                "parameter": normalize_parameter(name),
                "value": val,
                "unit": unit,
                "severity": "info",
                "parse_status": "ok",
            })

    return events


def _child_text(el, tag: str) -> str | None:
    child = el.find(tag)
    return child.text.strip() if child is not None and child.text else None
