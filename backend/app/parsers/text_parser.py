"""Rule-based parser for plain-text semiconductor logs.

Handles four specialised text formats before falling back to generic patterns:

  1. SECS/GEM message logs
       [2024-06-01T08:01:15] S6F11  EQP→HOST  Event Report: TEMP_SENSOR=412.9 ...
  2. Wafer lot trace logs
       2024-06-01 10:15:00  WAF_003  DEPOSIT  9:47  TIMEOUT  ← [!ANOMALY:...]
  3. Recipe execution logs
       [2024-06-01 11:01:37] STEP_07  PulseReactantA  Expected: 0.1s  Actual: 2.87s  FAIL
  4. Generic colon / "set to" patterns, with alarm/warning keyword detection.

Lines that match none of the above are emitted as partial text_message events
for optional LLM enrichment downstream.
"""
from __future__ import annotations

import re

from app.utils.mappings import normalize_parameter
from app.utils.unit_parser import parse_value_unit

# ── Format-detection signatures ──────────────────────────────────────────────
_SECS_GEM_SIG = re.compile(r"SECS/GEM MESSAGE LOG", re.IGNORECASE)
_WAFER_LOT_SIG = re.compile(r"WAFER LOT TRACE LOG", re.IGNORECASE)
_RECIPE_EXEC_SIG = re.compile(r"RECIPE EXECUTION LOG", re.IGNORECASE)

# ── SECS/GEM patterns ─────────────────────────────────────────────────────────
# [2024-06-01T08:01:15] S6F11   EQP→HOST   description
_SECS_LINE = re.compile(
    r"^\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})\]\s+"
    r"(S\d+F[\d?]+|\w+)\s+\S+\s+(.*)"
)
# TEMP_SENSOR=412.9 or PRESSURE=4.2E-5
_KV_IN_MSG = re.compile(r"(\w+)\s*=\s*([\d.eE+\-]+)")
# Alarm Report: ALID=0x0A ALTX='Thermal runaway detected'
_ALARM_ALTX = re.compile(r"ALTX=['\"]([^'\"]+)['\"]")
# Header lines on the SECS/GEM file (tool, date)
_SECS_HEADER_TOOL = re.compile(r"TOOL\s*:\s*(\S+)", re.IGNORECASE)

# ── Wafer lot trace patterns ──────────────────────────────────────────────────
# "  2024-06-01 10:15:00  WAF_003    DEPOSIT      9:47     TIMEOUT"
_WAFER_LOT_LINE = re.compile(
    r"^\s+(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\s+"
    r"(\S+)\s+"            # wafer_id  (may be ?????? for missing)
    r"(\w+)\s+"            # step name
    r"(\S+)\s+"            # duration / count
    r"(\w+)"               # status (OK / TIMEOUT / ALARM / …)
)
_WAFER_HEADER_TOOL = re.compile(r"^Tool\s*:\s*(\S+)", re.IGNORECASE)
_WAFER_HEADER_LOT  = re.compile(r"^LotID\s*:\s*(\S+)", re.IGNORECASE)

# ── Recipe execution log patterns ─────────────────────────────────────────────
# "  [2024-06-01 11:01:37] STEP_07   PulseReactantA   Expected: 0.1s   Actual: 2.87s   FAIL"
_RECIPE_STEP_LINE = re.compile(
    r"^\s*\[(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2})\]\s+"
    r"(STEP_\S+)\s+"
    r"(\S+)\s+"
    r"Expected:\s+(\S+)\s+"
    r"Actual:\s+(\S+)\s+"
    r"(PASS|FAIL|UNKNOWN|PARTIAL|RESUMED|ACTIVE)"
)
# "  [2024-06-01 11:02:14] STEP_11   [ALARM]   ALM_P01   ChamberLeak   ACTIVE"
_RECIPE_ALARM_LINE = re.compile(
    r"^\s*\[(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2})\]\s+"
    r"(STEP_\S+)\s+\[ALARM\]\s+"
    r"(\S+)\s+"    # alarm code
    r"(\S+)\s+"    # alarm name
    r"ACTIVE"
)
# Corrupt / unparseable timestamp token like 14:??:??
_CORRUPT_TS = re.compile(r"\d{4}-\d{2}-\d{2}[T ]\d{2}:\?{2}:\?{2}|\d{4}-\d{2}-\d{2}[T ]\?{2}:\?{2}:\?{2}")
_RECIPE_CORRUPT_LINE = re.compile(r"^\s*\[.*?\?\?.*?\]\s+(STEP_\S+|\S+)\s+\[CORRUPTED\]")
_RECIPE_HEADER_TOOL   = re.compile(r"^Tool\s*:\s*(\S+)", re.IGNORECASE)
_RECIPE_HEADER_RECIPE = re.compile(r"^Recipe\s*:\s*(\S+)", re.IGNORECASE)

# ── Generic patterns ──────────────────────────────────────────────────────────
_COLON_PATTERN = re.compile(r"([\w\s]+?):\s*([\d.]+)\s*(\w+)?")
_SET_TO_PATTERN = re.compile(r"([\w\s]+?)\s+set\s+to\s+([\d.]+)\s*(\w+)?", re.IGNORECASE)
_ALARM_PATTERN = re.compile(r"alarm|fault|failure|error|critical", re.IGNORECASE)
_WARNING_PATTERN = re.compile(r"warning|caution|unstable|drift", re.IGNORECASE)
_PROCESS_ABORT_PATTERN = re.compile(r"process\s+abort|process\s+aborted|abort", re.IGNORECASE)

# Duration string: "9:47" → 587 seconds; "0.1s" → 0.1
_DURATION_RE = re.compile(r"^(\d+):(\d{2})$")
_FLOAT_UNIT_RE = re.compile(r"^([\d.eE+\-]+)\s*(\w*)$")


def _duration_to_seconds(s: str) -> float | None:
    m = _DURATION_RE.match(s)
    if m:
        return int(m.group(1)) * 60 + int(m.group(2))
    m2 = _FLOAT_UNIT_RE.match(s)
    if m2:
        try:
            return float(m2.group(1))
        except ValueError:
            pass
    return None


# ── Top-level parse entry point ───────────────────────────────────────────────

def parse_text(content: str, run_id: str) -> list[dict]:
    lines = content.split("\n")
    head = "\n".join(lines[:10])

    if _SECS_GEM_SIG.search(head):
        return _parse_secs_gem(lines, run_id)
    if _WAFER_LOT_SIG.search(head):
        return _parse_wafer_lot(lines, run_id)
    if _RECIPE_EXEC_SIG.search(head):
        return _parse_recipe_exec(lines, run_id)

    return _parse_generic(lines, run_id)


# ── SECS/GEM parser ───────────────────────────────────────────────────────────

def _parse_secs_gem(lines: list[str], run_id: str) -> list[dict]:
    events: list[dict] = []
    tool_id = ""

    for line_num, raw_line in enumerate(lines, start=1):
        line = raw_line.strip()
        if not line or line.startswith("="):
            m = _SECS_HEADER_TOOL.search(line)
            if m:
                tool_id = m.group(1)
            continue

        m = _SECS_HEADER_TOOL.search(line)
        if m:
            tool_id = m.group(1)
            continue

        m = _SECS_LINE.match(line)
        if not m:
            continue

        ts, stream_func, description = m.group(1), m.group(2), m.group(3)

        # Strip inline anomaly tags for clean description
        clean_desc = re.sub(r"\s*\[!ANOMALY:[^\]]+\]", "", description).strip()
        clean_desc = re.sub(r"\s*\*\*\*.*?\*\*\*", "", clean_desc).strip()

        is_alarm = "S5F1" in stream_func or re.search(
            r"alarm|ALARM|abort|ABORT|fault", description, re.IGNORECASE
        ) is not None
        is_corrupt = "S6F??" in stream_func or "CORRUPTED" in description.upper()
        is_gap = "GAP" in description.upper()

        base = {
            "run_id":        run_id,
            "timestamp":     ts,
            "tool_id":       tool_id,
            "event_type":    "ALARM" if is_alarm else "INFO",
            "severity":      "alarm" if is_alarm else "warning" if is_gap else "info",
            "message":       clean_desc,
            "raw_line":      raw_line,
            "raw_line_number": line_num,
            "parse_status":  "failed" if is_corrupt else "ok",
        }

        # Extract ALTX alarm text
        m_altx = _ALARM_ALTX.search(description)
        if m_altx:
            base["alarm_code"] = stream_func
            base["message"] = m_altx.group(1)

        # Corrupt lines take priority — don't try to extract KV pairs from them
        if is_corrupt:
            base["parameter"] = "corrupt_field"
            base["value"] = "CORRUPT"
            base["parse_status"] = "failed"
            events.append(base)
            continue

        # Extract key=value sensor readings from Event Reports
        kv_matches = _KV_IN_MSG.findall(description)
        if kv_matches and not is_alarm:
            for key, val in kv_matches:
                parsed_val, unit = parse_value_unit(val)
                events.append({
                    **base,
                    "event_type": "PARAMETER_READING",
                    "severity":   "info",
                    "parameter":  normalize_parameter(key),
                    "value":      parsed_val,
                    "unit":       unit,
                })
        else:
            base["parameter"] = normalize_parameter(
                m_altx.group(1) if m_altx else "secs_event"
            )
            base["value"] = "1" if is_alarm else clean_desc
            events.append(base)

    return events


# ── Wafer lot trace parser ────────────────────────────────────────────────────

def _parse_wafer_lot(lines: list[str], run_id: str) -> list[dict]:
    events: list[dict] = []
    tool_id, lot_id = "", ""

    for line_num, raw_line in enumerate(lines, start=1):
        line = raw_line.strip()
        if not line or line.startswith("-") or line.startswith("="):
            continue
        if line.startswith("END"):
            break

        # Header metadata
        m = _WAFER_HEADER_TOOL.match(line)
        if m:
            tool_id = m.group(1)
            continue
        m = _WAFER_HEADER_LOT.match(line)
        if m:
            lot_id = m.group(1)
            continue

        m = _WAFER_LOT_LINE.match(raw_line)
        if not m:
            continue

        ts, wafer_id_raw, step_name, duration_str, status = (
            m.group(1), m.group(2), m.group(3), m.group(4), m.group(5)
        )

        # Detect placeholder / missing wafer
        wafer_id = None if re.match(r"\?+", wafer_id_raw) else wafer_id_raw

        # Severity from status
        is_alarm = status.upper() in ("ALARM", "TIMEOUT", "ABORT", "FAIL", "ERROR")
        is_warn  = status.upper() in ("WARNING", "WARN")
        severity = "alarm" if is_alarm else "warning" if is_warn else "info"

        # Convert duration → seconds as the numeric value
        dur_s = _duration_to_seconds(duration_str)
        val   = str(round(dur_s, 3)) if dur_s is not None else duration_str

        events.append({
            "run_id":          run_id,
            "timestamp":       ts,
            "tool_id":         tool_id,
            "wafer_id":        wafer_id,
            "lot_id":          lot_id or None,
            "recipe_step":     step_name,
            "event_type":      "ALARM" if is_alarm else "STEP_END",
            "parameter":       normalize_parameter(f"{step_name}_duration"),
            "value":           val,
            "unit":            "s",
            "severity":        severity,
            "message":         f"Step {step_name} status: {status}",
            "raw_line":        raw_line,
            "raw_line_number": line_num,
            "parse_status":    "ok",
        })

    return events


# ── Recipe execution log parser ───────────────────────────────────────────────

def _parse_recipe_exec(lines: list[str], run_id: str) -> list[dict]:
    events: list[dict] = []
    tool_id, recipe_name = "", ""

    for line_num, raw_line in enumerate(lines, start=1):
        line = raw_line.strip()
        if not line or line.startswith("="):
            continue

        # Header metadata
        m = _RECIPE_HEADER_TOOL.match(line)
        if m:
            tool_id = m.group(1)
            continue
        m = _RECIPE_HEADER_RECIPE.match(line)
        if m:
            recipe_name = m.group(1)
            continue

        # Corrupt timestamp line — emit a null-timestamp event
        if _RECIPE_CORRUPT_LINE.match(raw_line) or _CORRUPT_TS.search(raw_line):
            events.append({
                "run_id":          run_id,
                "timestamp":       "",
                "tool_id":         tool_id,
                "recipe_name":     recipe_name,
                "event_type":      "ALARM",
                "parameter":       "corrupt_step",
                "value":           "CORRUPT",
                "severity":        "alarm",
                "message":         line,
                "raw_line":        raw_line,
                "raw_line_number": line_num,
                "parse_status":    "failed",
            })
            continue

        # Alarm event line
        m = _RECIPE_ALARM_LINE.match(raw_line)
        if m:
            ts, step_id, alarm_code, alarm_name = (
                m.group(1).replace("T", " "), m.group(2), m.group(3), m.group(4)
            )
            events.append({
                "run_id":          run_id,
                "timestamp":       ts,
                "tool_id":         tool_id,
                "recipe_name":     recipe_name,
                "recipe_step":     step_id,
                "event_type":      "ALARM",
                "parameter":       normalize_parameter(alarm_name),
                "value":           "1",
                "alarm_code":      alarm_code,
                "severity":        "alarm",
                "message":         f"[ALARM] {alarm_code}: {alarm_name}",
                "raw_line":        raw_line,
                "raw_line_number": line_num,
                "parse_status":    "ok",
            })
            continue

        # Step result line
        m = _RECIPE_STEP_LINE.match(raw_line)
        if m:
            ts, step_id, step_name, expected_str, actual_str, result = (
                m.group(1).replace("T", " "), m.group(2), m.group(3),
                m.group(4), m.group(5), m.group(6)
            )

            is_fail    = result in ("FAIL", "PARTIAL")
            is_unknown = result == "UNKNOWN"
            is_resumed = result == "RESUMED"
            severity   = "alarm" if is_fail else "warning" if is_unknown or is_resumed else "info"

            # Handle corrupted actual value
            actual_corrupt = actual_str in ("???", "N/A", "UNKNOWN")
            if actual_corrupt:
                actual_str = "CORRUPT"

            parsed_actual, unit = parse_value_unit(actual_str)

            events.append({
                "run_id":          run_id,
                "timestamp":       ts,
                "tool_id":         tool_id,
                "recipe_name":     recipe_name,
                "recipe_step":     step_id,
                "event_type":      "ALARM" if is_fail else "STEP_END",
                "parameter":       normalize_parameter(f"{step_name}_actual"),
                "value":           parsed_actual,
                "unit":            unit,
                "severity":        severity,
                "message":         (
                    f"{step_name}: expected={expected_str}, actual={actual_str}, "
                    f"result={result}"
                ),
                "raw_line":        raw_line,
                "raw_line_number": line_num,
                "parse_status":    "failed" if actual_corrupt else "ok",
            })
            continue

    return events


# ── Generic text parser ───────────────────────────────────────────────────────

def _parse_generic(lines: list[str], run_id: str) -> list[dict]:
    events: list[dict] = []

    for line_num, raw_line in enumerate(lines, start=1):
        line = raw_line.strip()
        if not line:
            continue

        event = _try_deterministic(line, line_num, run_id)
        if event:
            events.append(event)
            continue

        # Keyword-based severity
        if _PROCESS_ABORT_PATTERN.search(line):
            severity, event_type = "alarm", "PROCESS_ABORT"
        elif _ALARM_PATTERN.search(line):
            severity, event_type = "alarm", "ALARM"
        elif _WARNING_PATTERN.search(line):
            severity = "warning"
            event_type = "DRIFT_WARNING" if "drift" in line.lower() else "WARNING"
        else:
            severity, event_type = "info", "INFO"

        events.append({
            "run_id":          run_id,
            "event_type":      event_type,
            "parameter":       "text_message",
            "value":           line,
            "severity":        severity,
            "message":         line,
            "raw_line":        raw_line,
            "raw_line_number": line_num,
            "parse_status":    "partial",
        })

    return events


def _try_deterministic(line: str, line_num: int, run_id: str) -> dict | None:
    m = _COLON_PATTERN.match(line)
    if m:
        return {
            "run_id":          run_id,
            "event_type":      "PARAMETER_READING",
            "parameter":       normalize_parameter(m.group(1).strip()),
            "value":           m.group(2),
            "unit":            m.group(3),
            "severity":        "info",
            "raw_line":        line,
            "raw_line_number": line_num,
            "parse_status":    "ok",
        }

    m = _SET_TO_PATTERN.match(line)
    if m:
        return {
            "run_id":          run_id,
            "event_type":      "PARAMETER_READING",
            "parameter":       normalize_parameter(m.group(1).strip()),
            "value":           m.group(2),
            "unit":            m.group(3),
            "severity":        "info",
            "raw_line":        line,
            "raw_line_number": line_num,
            "parse_status":    "ok",
        }

    return None
