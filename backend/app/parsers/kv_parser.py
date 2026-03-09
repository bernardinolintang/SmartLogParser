"""Parser for key-value style logs.

Example:
    timestamp=2026-03-05T11:30:05 equipment_id=METRO_TOOL_01 temperature=23.5 humidity=45.2
"""

import re

from app.utils.mappings import normalize_parameter, infer_tool_type
from app.utils.unit_parser import parse_value_unit

_KV_PATTERN = re.compile(r'(\w+)=("(?:[^"\\]|\\.)*"|[^\s]+)')

_CONTEXT_KEYS = {"timestamp", "equipment_id", "tool_id", "fab_id", "chamber_id",
                 "run_id", "lot_id", "wafer_id", "recipe_name", "recipe_step",
                 "step_id", "step", "module_id"}


def parse_kv(content: str, run_id: str) -> list[dict]:
    events: list[dict] = []
    lines = content.strip().split("\n")

    for line_num, line in enumerate(lines, start=1):
        line = line.strip()
        if not line:
            continue

        pairs: dict[str, str] = {}
        for m in _KV_PATTERN.finditer(line):
            key = m.group(1)
            val = m.group(2).strip('"')
            pairs[key] = val

        if not pairs:
            continue

        ctx = {k: pairs.pop(k) for k in list(pairs) if k in _CONTEXT_KEYS}
        tool_id = ctx.get("equipment_id") or ctx.get("tool_id") or "UNKNOWN"

        for key, raw_val in pairs.items():
            val, unit = parse_value_unit(raw_val)
            events.append({
                "run_id": ctx.get("run_id") or run_id,
                "timestamp": ctx.get("timestamp") or "",
                "fab_id": ctx.get("fab_id") or "FAB_01",
                "tool_id": tool_id,
                "tool_type": infer_tool_type(tool_id),
                "chamber_id": ctx.get("chamber_id") or "CH_A",
                "lot_id": ctx.get("lot_id"),
                "wafer_id": ctx.get("wafer_id"),
                "recipe_name": ctx.get("recipe_name") or "",
                "recipe_step": ctx.get("recipe_step") or ctx.get("step_id") or ctx.get("step") or "",
                "event_type": "PARAMETER_READING",
                "parameter": normalize_parameter(key),
                "value": val,
                "unit": unit,
                "severity": "info",
                "raw_line": line,
                "raw_line_number": line_num,
                "parse_status": "ok",
            })

    return events
