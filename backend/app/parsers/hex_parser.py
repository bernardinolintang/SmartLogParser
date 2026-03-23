"""Parser for hex/binary-like log data.

Decodes hex bytes to ASCII, then delegates to the text or KV parser.
"""
from __future__ import annotations


import re

from app.parsers.kv_parser import parse_kv
from app.parsers.text_parser import parse_text

_HEX_BYTE = re.compile(r"[0-9A-Fa-f]{2}")


def parse_hex(content: str, run_id: str) -> list[dict]:
    hex_bytes = _HEX_BYTE.findall(content)
    if not hex_bytes:
        return [{
            "run_id": run_id,
            "event_type": "INFO",
            "parameter": "binary_payload",
            "value": content[:200],
            "parse_status": "partial",
            "raw_line": content[:200],
        }]

    ascii_text = ""
    for b in hex_bytes:
        code = int(b, 16)
        ascii_text += chr(code) if 32 <= code < 127 else "."

    if "=" in ascii_text:
        events = parse_kv(ascii_text, run_id)
        if events:
            for e in events:
                e["parse_status"] = "ok"
            return events

    events = parse_text(ascii_text, run_id)
    if events:
        return events

    tool_match = re.search(r"[A-Z_]+\d+", ascii_text)
    return [{
        "run_id": run_id,
        "tool_id": tool_match.group(0) if tool_match else "UNKNOWN",
        "event_type": "INFO",
        "parameter": "binary_payload",
        "value": ascii_text,
        "raw_line": content[:200],
        "parse_status": "partial",
    }]
