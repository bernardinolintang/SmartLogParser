"""Rule-based parser for plain-text semiconductor logs.

Falls back to LLM parsing when confidence is low.
Lines like 'Temperature: 23C' or 'Pressure set to 0.8 Torr' are handled
deterministically. Anything else is marked as partial and queued for LLM.
"""

import re

from app.utils.mappings import normalize_parameter
from app.utils.unit_parser import parse_value_unit

_COLON_PATTERN = re.compile(r"([\w\s]+?):\s*([\d.]+)\s*(\w+)?")
_SET_TO_PATTERN = re.compile(r"([\w\s]+?)\s+set\s+to\s+([\d.]+)\s*(\w+)?", re.IGNORECASE)
_ALARM_PATTERN = re.compile(r"alarm|fault|failure|error|critical", re.IGNORECASE)
_WARNING_PATTERN = re.compile(r"warning|caution|unstable|drift", re.IGNORECASE)


def parse_text(content: str, run_id: str) -> list[dict]:
    events: list[dict] = []
    lines = content.strip().split("\n")

    for line_num, line in enumerate(lines, start=1):
        line = line.strip()
        if not line:
            continue

        event = _try_deterministic(line, line_num, run_id)
        if event:
            events.append(event)
        else:
            severity = "info"
            event_type = "INFO"
            if _ALARM_PATTERN.search(line):
                severity = "alarm"
                event_type = "ALARM"
            elif _WARNING_PATTERN.search(line):
                severity = "warning"
                event_type = "WARNING"

            events.append({
                "run_id": run_id,
                "event_type": event_type,
                "parameter": "text_message",
                "value": line,
                "severity": severity,
                "message": line,
                "raw_line": line,
                "raw_line_number": line_num,
                "parse_status": "partial",
            })

    return events


def _try_deterministic(line: str, line_num: int, run_id: str) -> dict | None:
    m = _COLON_PATTERN.match(line)
    if m:
        return {
            "run_id": run_id,
            "event_type": "PARAMETER_READING",
            "parameter": normalize_parameter(m.group(1).strip()),
            "value": m.group(2),
            "unit": m.group(3),
            "severity": "info",
            "raw_line": line,
            "raw_line_number": line_num,
            "parse_status": "ok",
        }

    m = _SET_TO_PATTERN.match(line)
    if m:
        return {
            "run_id": run_id,
            "event_type": "PARAMETER_READING",
            "parameter": normalize_parameter(m.group(1).strip()),
            "value": m.group(2),
            "unit": m.group(3),
            "severity": "info",
            "raw_line": line,
            "raw_line_number": line_num,
            "parse_status": "ok",
        }

    return None
