"""Post-parse normalization: standardize names, units, event types, severity."""
from __future__ import annotations


from app.utils.mappings import (
    normalize_parameter,
    normalize_event_type,
    normalize_severity,
    normalize_alarm_code,
    infer_severity_from_alarm_code,
    infer_tool_type,
)


def normalize_events(events: list[dict]) -> list[dict]:
    for e in events:
        if e.get("parameter"):
            e["parameter"] = normalize_parameter(e["parameter"])

        if e.get("event_type"):
            e["event_type"] = normalize_event_type(e["event_type"])

        if e.get("severity"):
            e["severity"] = normalize_severity(e["severity"])

        if e.get("alarm_code"):
            e["alarm_code"] = normalize_alarm_code(e["alarm_code"])
            # If severity is weak/unknown, derive it from alarm code.
            if e.get("severity") in (None, "", "info"):
                inferred = infer_severity_from_alarm_code(e.get("alarm_code"))
                if inferred:
                    e["severity"] = inferred

        if e.get("tool_id") and not e.get("tool_type"):
            e["tool_type"] = infer_tool_type(e["tool_id"])

        _fill_defaults(e)

    return events


def _fill_defaults(e: dict) -> None:
    e.setdefault("fab_id", "FAB_01")
    e.setdefault("tool_id", "UNKNOWN")
    e.setdefault("tool_type", "unknown")
    e.setdefault("chamber_id", "CH_A")
    e.setdefault("event_type", "PARAMETER_READING")
    e.setdefault("severity", "info")
    e.setdefault("parse_status", "ok")
    e.setdefault("timestamp", "")
    e.setdefault("recipe_name", "")
    e.setdefault("recipe_step", "")
