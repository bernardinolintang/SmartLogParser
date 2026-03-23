"""Detects the format of uploaded log content using deterministic rules.

Returns one of: json, xml, csv, kv, syslog, text, hex, binary
"""
from __future__ import annotations

import re

LogFormat = str  # one of: json, xml, csv, kv, syslog, text, hex, binary


def looks_binary_bytes(raw_bytes: bytes) -> bool:
    if not raw_bytes:
        return False
    sample = raw_bytes[:2048]
    nul_ratio = sample.count(0) / max(1, len(sample))
    non_printable = sum(1 for b in sample if b < 9 or (13 < b < 32) or b > 126)
    non_printable_ratio = non_printable / max(1, len(sample))
    return nul_ratio > 0.02 or non_printable_ratio > 0.30


def detect_format(content: str) -> LogFormat:
    fmt, _ = detect_format_with_confidence(content)
    return fmt


def detect_format_with_confidence(content: str, raw_bytes: bytes | None = None) -> tuple[LogFormat, float]:
    if raw_bytes is not None and looks_binary_bytes(raw_bytes):
        return "binary", 0.95

    trimmed = content.strip()
    if not trimmed:
        return "text", 0.5

    if trimmed[0] in ("{", "["):
        return "json", 0.95

    if trimmed.startswith("<?xml") or (trimmed.startswith("<") and ("</" in trimmed or "/>" in trimmed)):
        return "xml", 0.92

    if re.match(r"^[0-9A-Fa-f]{2}(\s+[0-9A-Fa-f]{2}){4,}", trimmed):
        return "hex", 0.9

    lines = trimmed.split("\n")

    first_line = lines[0]
    if first_line.count(",") >= 2 and len(lines) > 1:
        return "csv", 0.85

    if re.match(r"^\<\d+\>\d+\s+\d{4}-\d{2}-\d{2}T", first_line) or re.match(r"^\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}", trimmed):
        return "syslog", 0.82

    kv_lines = [l for l in lines if l.strip() and "=" in l]
    if len(kv_lines) > len(lines) * 0.5:
        return "kv", 0.78

    return "text", 0.6
