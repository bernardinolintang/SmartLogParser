"""Parser for syslog-style semiconductor logs.

Example:
    Mar 05 11:00:08 EUV_SCAN_01 SENSOR rf_power=480W temperature=22C pressure=1.2Torr
"""

import re
from datetime import datetime

from app.utils.mappings import normalize_parameter, normalize_severity, infer_tool_type
from app.utils.unit_parser import parse_value_unit

_SYSLOG_LINE = re.compile(
    r"^(\w{3}\s+\d{1,2}\s+[\d:]+)\s+(\S+)\s+(\S+)\s+(.*)"
)
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

        m = _SYSLOG_LINE.match(line)
        if not m:
            continue

        ts_raw, tool_id, category, rest = m.group(1), m.group(2), m.group(3), m.group(4)
        timestamp = f"{current_year}-{ts_raw}"
        event_type, severity = _CATEGORY_MAP.get(category, ("INFO", "info"))
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
