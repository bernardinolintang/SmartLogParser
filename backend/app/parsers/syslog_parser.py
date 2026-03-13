"""Parser for syslog-style semiconductor logs.

Supports:
- RFC 5424 style: <PRI>1 2026-03-05T11:00:08Z host app proc msgid [sd] msg
- RFC 3164 style: Mar 05 11:00:08 HOST TAG message
"""

import re
from datetime import datetime

from app.utils.mappings import normalize_parameter, normalize_severity, infer_tool_type
from app.utils.unit_parser import parse_value_unit

_RFC5424 = re.compile(
    r"^<(?P<pri>\d+)>(?P<ver>\d+)\s+(?P<ts>\S+)\s+(?P<host>\S+)\s+(?P<app>\S+)\s+(?P<proc>\S+)\s+(?P<msgid>\S+)\s+(?P<sd>\[[^\]]*\]|-)\s*(?P<msg>.*)$"
)
_RFC3164 = re.compile(r"^(?P<ts>\w{3}\s+\d{1,2}\s+[\d:]+)\s+(?P<host>\S+)\s+(?P<tag>\S+)\s+(?P<msg>.*)$")
_KV_PAIR = re.compile(r"(\w+)=(\S+)")

_CATEGORY_MAP = {
    "SENSOR": ("PARAMETER_READING", "info"),
    "ALARM": ("ALARM", "alarm"),
    "WARNING": ("WARNING", "warning"),
    "INFO": ("INFO", "info"),
    "STATE": ("STATE_CHANGE", "info"),
}


def parse_syslog(content: str, run_id: str) -> list[dict]:
    events: list[dict] = []
    lines = content.strip().split("\n")
    current_year = datetime.now().year

    for line_num, line in enumerate(lines, start=1):
        line = line.strip()
        if not line:
            continue

        parsed = _parse_line(line, current_year)
        if not parsed:
            continue
        timestamp = parsed["timestamp"]
        tool_id = parsed["tool_id"]
        category = parsed["category"]
        rest = parsed["rest"]
        severity = parsed["severity"]
        event_type = parsed["event_type"]
        tool_type = infer_tool_type(tool_id)

        kv_pairs = _KV_PAIR.findall(rest)
        if kv_pairs:
            for key, raw_val in kv_pairs:
                val, unit = parse_value_unit(raw_val)
                alarm_code = f"ALM_{key.upper()}" if event_type == "ALARM" else None
                events.append({
                    "run_id": run_id,
                    "timestamp": timestamp,
                    "tool_id": tool_id,
                    "tool_type": tool_type,
                    "event_type": event_type,
                    "parameter": normalize_parameter(key),
                    "value": val,
                    "unit": unit,
                    "alarm_code": alarm_code,
                    "severity": severity,
                    "raw_line": line,
                    "raw_line_number": line_num,
                    "parse_status": "ok",
                })
        else:
            events.append({
                "run_id": run_id,
                "timestamp": timestamp,
                "tool_id": tool_id,
                "tool_type": tool_type,
                "event_type": event_type,
                "parameter": category.lower(),
                "value": rest,
                "severity": severity,
                "message": rest,
                "raw_line": line,
                "raw_line_number": line_num,
                "parse_status": "ok",
            })

    return events


def _parse_line(line: str, current_year: int) -> dict | None:
    r5424 = _RFC5424.match(line)
    if r5424:
        pri = int(r5424.group("pri"))
        sev_code = pri % 8
        severity_map = {
            0: "critical", 1: "critical", 2: "critical", 3: "alarm",
            4: "warning", 5: "warning", 6: "info", 7: "info",
        }
        severity = severity_map.get(sev_code, "info")
        msg = r5424.group("msg")
        category = _infer_category(msg, severity)
        event_type, default_sev = _CATEGORY_MAP.get(category, ("INFO", "info"))
        return {
            "timestamp": r5424.group("ts"),
            "tool_id": r5424.group("host"),
            "category": category,
            "rest": msg,
            "severity": severity or default_sev,
            "event_type": event_type,
        }

    r3164 = _RFC3164.match(line)
    if r3164:
        ts_raw = r3164.group("ts")
        tag = r3164.group("tag").strip(":")
        msg = r3164.group("msg")
        category = _infer_category(f"{tag} {msg}", "info")
        event_type, severity = _CATEGORY_MAP.get(category, ("INFO", "info"))
        return {
            "timestamp": f"{current_year}-{ts_raw}",
            "tool_id": r3164.group("host"),
            "category": category,
            "rest": msg,
            "severity": severity,
            "event_type": event_type,
        }
    return None


def _infer_category(msg: str, default_severity: str) -> str:
    upper = msg.upper()
    if "ALARM" in upper or default_severity in ("critical", "alarm"):
        return "ALARM"
    if "WARN" in upper:
        return "WARNING"
    if "STATE" in upper:
        return "STATE"
    if "SENSOR" in upper:
        return "SENSOR"
    return "INFO"
