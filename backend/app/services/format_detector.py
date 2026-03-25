"""Detects the format of uploaded log content using deterministic rules.

Returns one of: json, xml, csv, kv, syslog, text, hex, binary
"""
from __future__ import annotations

import json
import re

LogFormat = str  # one of: json, xml, csv, kv, syslog, text, hex, binary

_CSV_SCORE_HEADERS = {"timestamp", "tool_id", "equipment_id", "parameter", "value"}
_RFC5424 = re.compile(r"^\<\d+\>\d+\s+\d{4}-\d{2}-\d{2}T")
_RFC3164 = re.compile(r"^\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}")
_KV_LINE = re.compile(r"^\w+=\S+")
_HEX_TOKEN = re.compile(r"^[0-9A-Fa-f]{2}$")


def looks_binary_bytes(raw_bytes: bytes) -> bool:
    if not raw_bytes:
        return False
    sample = raw_bytes[:2048]
    nul_ratio = sample.count(0) / max(1, len(sample))
    non_printable = sum(1 for b in sample if b < 9 or (13 < b < 32) or b > 126)
    non_printable_ratio = non_printable / max(1, len(sample))
    return nul_ratio > 0.02 or non_printable_ratio > 0.30


def detect_format(content: str) -> LogFormat:
    fmt, _, _ = detect_format_with_confidence(content)
    return fmt


def detect_format_with_confidence(
    content: str, raw_bytes: bytes | None = None
) -> tuple[LogFormat, float, bool]:
    """Return (format, confidence, ambiguous).

    ambiguous is True when the top two candidate scores are within 0.15 of each other.
    """
    if raw_bytes is not None and looks_binary_bytes(raw_bytes):
        return "binary", 0.95, False

    trimmed = content.strip()
    if not trimmed:
        return "text", 0.5, False

    scores: dict[str, float] = {}
    lines = trimmed.split("\n")
    first_line = lines[0]

    # ── JSON ──────────────────────────────────────────────────────────────────
    if trimmed[0] in ("{", "["):
        try:
            json.loads(trimmed)
            scores["json"] = 0.98
        except Exception:
            scores["json"] = 0.4
    else:
        scores["json"] = 0.0

    # ── XML ───────────────────────────────────────────────────────────────────
    if trimmed.startswith("<?xml"):
        scores["xml"] = 0.92
    elif trimmed.startswith("<") and ("</" in trimmed or "/>" in trimmed):
        scores["xml"] = 0.85
    else:
        scores["xml"] = 0.0

    # ── HEX ───────────────────────────────────────────────────────────────────
    tokens = trimmed[:256].split()
    if tokens:
        hex_ratio = sum(1 for t in tokens if _HEX_TOKEN.match(t)) / len(tokens)
        scores["hex"] = 0.9 if hex_ratio > 0.7 else 0.0
    else:
        scores["hex"] = 0.0

    # ── CSV ───────────────────────────────────────────────────────────────────
    if first_line.count(",") >= 2 and len(lines) > 1:
        csv_score = 0.5
        header_lower = first_line.lower()
        for h in _CSV_SCORE_HEADERS:
            if h in header_lower:
                csv_score += 0.1
        scores["csv"] = min(csv_score, 1.0)
    else:
        scores["csv"] = 0.0

    # ── SYSLOG ────────────────────────────────────────────────────────────────
    if _RFC5424.match(first_line) or _RFC3164.match(trimmed):
        scores["syslog"] = 0.82
    else:
        scores["syslog"] = 0.0

    # ── KV ────────────────────────────────────────────────────────────────────
    kv_lines = [ln for ln in lines if ln.strip() and "=" in ln]
    kv_ratio = len(kv_lines) / max(1, len(lines))
    scores["kv"] = kv_ratio if kv_ratio > 0.5 else 0.0

    # ── TEXT (fallback) ───────────────────────────────────────────────────────
    scores["text"] = 0.5

    # Pick winner
    ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    best_fmt, best_score = ranked[0]
    second_score = ranked[1][1] if len(ranked) > 1 else 0.0

    ambiguous = (best_score - second_score) < 0.15

    return best_fmt, best_score, ambiguous
