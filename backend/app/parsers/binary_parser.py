"""Parser for binary semiconductor logs.

Binary decoding strategy:
1) Attempt fixed-record struct decode for known synthetic format.
2) Fallback to hex-dump text extraction for traceability.
"""

from __future__ import annotations

import struct
from datetime import datetime, timezone

from app.utils.mappings import infer_tool_type

_MAGIC = 0xDEADBEEF
_HEADER_FMT = "<I"
_RECORD_FMT = "<IHHHHfI"  # ts, tool_idx, chamber_idx, param_id, reserved, value, alarm_code
_RECORD_SIZE = struct.calcsize(_RECORD_FMT)

_TOOL_MAP = {
    1: "DRY_ETCH_001",
    2: "DRY_ETCH_002",
    3: "EUV_SCANNER_001",
    4: "CVD_TOOL_001",
    5: "CMP_TOOL_001",
}

_CHAMBER_MAP = {1: "C1", 2: "C2", 3: "C3", 4: "C4"}
_PARAM_MAP = {
    1: ("temperature", "C"),
    2: ("pressure", "Pa"),
    3: ("rf_power", "W"),
    4: ("gas_flow", "sccm"),
}
_ALARM_MAP = {
    1: "VACUUM_FAULT",
    2: "TEMP_HIGH",
    3: "PRESSURE_LOW",
    4: "RF_INTERLOCK",
    5: "DOOR_OPEN",
}


def parse_binary(content: str, run_id: str, raw_bytes: bytes | None = None) -> list[dict]:
    if not raw_bytes:
        return _fallback_hex_events(content, run_id)

    # Try fixed binary format decode.
    if len(raw_bytes) >= 4:
        magic = struct.unpack(_HEADER_FMT, raw_bytes[:4])[0]
        if magic == _MAGIC:
            events = _parse_fixed_records(raw_bytes[4:], run_id)
            if events:
                return events

    # Fallback: store raw bytes as payload event.
    return _fallback_hex_events(raw_bytes.hex(" "), run_id)


def _parse_fixed_records(payload: bytes, run_id: str) -> list[dict]:
    events: list[dict] = []
    for idx in range(0, len(payload), _RECORD_SIZE):
        chunk = payload[idx : idx + _RECORD_SIZE]
        if len(chunk) != _RECORD_SIZE:
            break
        ts, tool_idx, chamber_idx, param_id, _reserved, value, alarm_code = struct.unpack(_RECORD_FMT, chunk)
        tool_id = _TOOL_MAP.get(tool_idx, f"TOOL_{tool_idx}")
        chamber_id = _CHAMBER_MAP.get(chamber_idx, f"C{chamber_idx}")
        parameter, unit = _PARAM_MAP.get(param_id, (f"param_{param_id}", ""))
        timestamp = datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()

        events.append({
            "run_id": run_id,
            "timestamp": timestamp,
            "tool_id": tool_id,
            "tool_type": infer_tool_type(tool_id),
            "chamber_id": chamber_id,
            "event_type": "PARAMETER_READING",
            "parameter": parameter,
            "value": f"{value:.4f}",
            "unit": unit,
            "severity": "info",
            "raw_line": chunk.hex(" "),
            "raw_line_number": int(idx / _RECORD_SIZE) + 1,
            "parse_status": "ok",
        })

        if alarm_code and alarm_code in _ALARM_MAP:
            events.append({
                "run_id": run_id,
                "timestamp": timestamp,
                "tool_id": tool_id,
                "tool_type": infer_tool_type(tool_id),
                "chamber_id": chamber_id,
                "event_type": "ALARM",
                "parameter": "alarm",
                "value": _ALARM_MAP[alarm_code],
                "alarm_code": _ALARM_MAP[alarm_code],
                "severity": "critical",
                "raw_line": chunk.hex(" "),
                "raw_line_number": int(idx / _RECORD_SIZE) + 1,
                "parse_status": "ok",
            })
    return events


def _fallback_hex_events(content: str, run_id: str) -> list[dict]:
    return [{
        "run_id": run_id,
        "event_type": "INFO",
        "parameter": "binary_payload",
        "value": content[:2000],
        "severity": "info",
        "raw_line": content[:2000],
        "parse_status": "partial",
        "parse_error": "binary_decode_fallback",
    }]
