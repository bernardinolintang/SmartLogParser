"""Detects the format of uploaded log content using deterministic rules.

Returns one of: json, xml, csv, kv, syslog, text, hex
"""

import re

LogFormat = str  # one of: json, xml, csv, kv, syslog, text, hex


def detect_format(content: str) -> LogFormat:
    trimmed = content.strip()
    if not trimmed:
        return "text"

    if trimmed[0] in ("{", "["):
        return "json"

    if trimmed.startswith("<?xml") or (trimmed.startswith("<") and ("</" in trimmed or "/>" in trimmed)):
        return "xml"

    if re.match(r"^[0-9A-Fa-f]{2}(\s+[0-9A-Fa-f]{2}){4,}", trimmed):
        return "hex"

    lines = trimmed.split("\n")

    first_line = lines[0]
    if first_line.count(",") >= 2 and len(lines) > 1:
        return "csv"

    if re.match(r"^\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}", trimmed):
        return "syslog"

    kv_lines = [l for l in lines if l.strip() and "=" in l]
    if len(kv_lines) > len(lines) * 0.5:
        return "kv"

    return "text"
