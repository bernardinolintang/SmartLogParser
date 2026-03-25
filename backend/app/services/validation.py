"""Validate parsed events before storing them.

Marks invalid events as partial rather than dropping them entirely.
"""
from __future__ import annotations


import re

from app.utils.physical_limits import validate_physical_plausibility

_ISO_LIKE = re.compile(r"\d{4}.*\d{2}.*\d{2}")
_NUMERIC = re.compile(r"^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$")


def validate_events(events: list[dict]) -> list[dict]:
    for e in events:
        errors: list[str] = []

        ts = e.get("timestamp", "")
        if ts and not _ISO_LIKE.search(str(ts)):
            errors.append("timestamp_unparseable")

        val = e.get("value", "")
        if e.get("event_type") == "PARAMETER_READING" and val:
            if not _NUMERIC.match(str(val)):
                errors.append("value_not_numeric")

        if not e.get("tool_id") or e["tool_id"] == "UNKNOWN":
            errors.append("tool_id_missing")

        errors.extend(validate_physical_plausibility(e))

        if errors:
            e["parse_status"] = "partial"
            e["parse_error"] = "; ".join(errors)

    return events
