"""Statistical and structural anomaly detection for parsed semiconductor data.

Statistical techniques (per-parameter, on PARAMETER_READING events only):
  1. Z-score — flags readings > Z_THRESHOLD σ from the per-parameter mean.
  2. Rolling-mean drift — flags readings > ROLLING_THRESHOLD σ from the local
     sliding-window mean, catching slow drift the global mean misses.

Structural techniques (all events, original insertion order):
  3. Alarm cascade — 3+ ALARM-severity events within ALARM_CASCADE_WINDOW_S seconds.
  4. Timestamp gap — gap of >= TS_GAP_THRESHOLD_S seconds between consecutive events.
  5. Timestamp reversal — an event whose timestamp is earlier than the previous event.
  6. Corrupt field — null/missing timestamp, or sensor value containing an error token
     (ERR_ADC, 0xFFFF, #N/A, ???, etc.).
  7. Missing field — null/empty tool_id or wafer_id containing placeholder tokens.
"""
from __future__ import annotations

import math
import re
import statistics
from collections import defaultdict, deque
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from app.models import Event

# ── Thresholds ──────────────────────────────────────────────────────────────
Z_THRESHOLD = 2.5
ROLLING_WINDOW = 10
ROLLING_THRESHOLD = 2.0

ALARM_CASCADE_WINDOW_S = 30   # seconds — window for consecutive alarm detection
ALARM_CASCADE_MIN_COUNT = 3   # minimum alarms in window to flag

TS_GAP_THRESHOLD_S = 300      # 5 minutes gap → flagged

# Sensor value strings that indicate a corrupt/unreadable reading
_CORRUPT_VALUE_RE = re.compile(
    r"(?i)^err_|^#n/a$|^0xff{2,}|0xdead|deadbeef|corrupt|unreadable|\?\?\?|\?\?:\?\?"
)
# Wafer ID placeholder
_CORRUPT_WAFER_RE = re.compile(r"\?{2,}")

_TS_FORMATS = [
    "%Y-%m-%dT%H:%M:%S",
    "%Y-%m-%dT%H:%M:%S.%f",
    "%Y-%m-%dT%H:%M:%SZ",
    "%Y-%m-%dT%H:%M:%S.%fZ",
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%d %H:%M:%S.%f",
    "%Y-%m-%dT%H:%M",
    "%Y-%m-%d %H:%M",
]


def _to_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(str(value).strip())
    except (ValueError, TypeError):
        return None


def _parse_ts(ts: str | None) -> datetime | None:
    if not ts:
        return None
    s = ts.strip().rstrip("Z")
    for fmt in _TS_FORMATS:
        try:
            return datetime.strptime(s, fmt.rstrip("Z"))
        except ValueError:
            continue
    return None


# ── Statistical detection ────────────────────────────────────────────────────

def detect_anomalies(events: list[Event]) -> list[dict]:
    """Z-score + rolling-mean drift on PARAMETER_READING events."""
    param_readings: dict[str, list[tuple[str, float, int]]] = defaultdict(list)
    for idx, e in enumerate(events):
        if e.event_type != "PARAMETER_READING":
            continue
        val = _to_float(e.value)
        if val is None:
            continue
        param_readings[e.parameter or "unknown"].append((e.timestamp or "", val, idx))

    anomalies: list[dict] = []

    for param, readings in param_readings.items():
        if len(readings) < 3:
            continue

        values = [r[1] for r in readings]
        mean = statistics.mean(values)
        try:
            std = statistics.stdev(values)
        except statistics.StatisticsError:
            std = 0.0

        # Z-score
        for ts, val, idx in readings:
            z = (val - mean) / std if std > 0 else 0.0
            if abs(z) >= Z_THRESHOLD:
                anomalies.append({
                    "parameter": param,
                    "timestamp": ts,
                    "value": val,
                    "mean": round(mean, 4),
                    "std": round(std, 4),
                    "z_score": round(z, 3),
                    "type": "z_score",
                    "severity": "alarm" if abs(z) >= Z_THRESHOLD * 1.5 else "warning",
                    "description": (
                        f"{param} reading {val} is {abs(z):.1f}σ from mean {mean:.4f}"
                    ),
                    "event_index": idx,
                })

        # Rolling-mean drift
        window: deque[float] = deque(maxlen=ROLLING_WINDOW)
        for ts, val, idx in readings:
            if len(window) >= 3:
                roll_mean = statistics.mean(window)
                roll_std = statistics.stdev(window) if len(window) >= 2 else 0.0
                roll_z = abs(val - roll_mean) / roll_std if roll_std > 0 else 0.0
                if roll_z >= ROLLING_THRESHOLD:
                    already = any(
                        a["event_index"] == idx and a["type"] == "z_score"
                        for a in anomalies
                    )
                    if not already:
                        anomalies.append({
                            "parameter": param,
                            "timestamp": ts,
                            "value": val,
                            "mean": round(roll_mean, 4),
                            "std": round(roll_std, 4),
                            "z_score": round(roll_z, 3),
                            "type": "rolling_drift",
                            "severity": "warning",
                            "description": (
                                f"{param} drift: {val} deviates {roll_z:.1f}σ "
                                f"from rolling mean {roll_mean:.4f}"
                            ),
                            "event_index": idx,
                        })
            window.append(val)

    anomalies.sort(key=lambda a: a["timestamp"])
    return anomalies


# ── Structural detection ─────────────────────────────────────────────────────

def _detect_structural_anomalies(events: list[Event]) -> list[dict]:
    """Detect alarm cascades, timestamp gaps/reversals, and corrupt/missing fields.

    Events must be in original insertion order (order_by id) so that reversals
    are visible as out-of-order rows.

    Structural anomalies are deduplicated by (type, timestamp) so that wide-format
    CSVs (which emit multiple events per row with the same timestamp) only produce
    one flag per unique situation.
    """
    structural: list[dict] = []
    _seen: set[tuple[str, str]] = set()  # (type, timestamp) deduplication key
    prev_ts: datetime | None = None
    prev_ts_str: str = ""
    alarm_window: list[tuple[datetime, int]] = []  # (ts, event_index)

    def _append_once(anomaly: dict) -> None:
        key = (anomaly["type"], anomaly["timestamp"])
        if key not in _seen:
            _seen.add(key)
            structural.append(anomaly)

    for idx, e in enumerate(events):
        ts_str: str = e.timestamp or ""
        tool_id: str = e.tool_id or ""
        wafer_id: str | None = e.wafer_id
        value: str = e.value or ""
        event_type: str = (e.event_type or "").upper()
        severity_str: str = (e.severity or "").lower()

        cur_ts = _parse_ts(ts_str)

        # ── Corrupt / missing timestamp ──────────────────────────────────────
        if not ts_str or cur_ts is None:
            _append_once({
                "parameter": "timestamp",
                "timestamp": prev_ts_str or "",
                "value": 0,
                "mean": 0.0,
                "std": 0.0,
                "z_score": 0.0,
                "type": "corrupt_field",
                "severity": "alarm",
                "description": (
                    f"Event #{idx + 1} has null/unreadable timestamp"
                    + (f": '{ts_str}'" if ts_str else "")
                ),
                "event_index": idx,
            })

        # ── Missing tool_id (genuine null only — skip _DEFAULT sentinel) ─────
        if not tool_id or tool_id == "":
            _append_once({
                "parameter": "tool_id",
                "timestamp": ts_str or prev_ts_str,
                "value": 0,
                "mean": 0.0,
                "std": 0.0,
                "z_score": 0.0,
                "type": "missing_field",
                "severity": "warning",
                "description": f"Event #{idx + 1} is missing tool_id",
                "event_index": idx,
            })

        # ── Corrupt / placeholder wafer_id ───────────────────────────────────
        if wafer_id and _CORRUPT_WAFER_RE.search(str(wafer_id)):
            _append_once({
                "parameter": "wafer_id",
                "timestamp": ts_str or prev_ts_str,
                "value": 0,
                "mean": 0.0,
                "std": 0.0,
                "z_score": 0.0,
                "type": "missing_field",
                "severity": "warning",
                "description": f"Wafer ID is missing/unknown: '{wafer_id}'",
                "event_index": idx,
            })

        # ── Corrupt sensor value ─────────────────────────────────────────────
        if value and _CORRUPT_VALUE_RE.search(str(value)):
            _append_once({
                "parameter": "value",
                "timestamp": ts_str or prev_ts_str,
                "value": 0,
                "mean": 0.0,
                "std": 0.0,
                "z_score": 0.0,
                "type": "corrupt_field",
                "severity": "alarm",
                "description": f"Corrupt/unreadable sensor value: '{value}'",
                "event_index": idx,
            })

        if cur_ts is not None:
            if prev_ts is not None:
                gap_s = (cur_ts - prev_ts).total_seconds()

                # ── Timestamp reversal (immediate-predecessor comparison) ────
                # Compare only against the PREVIOUS event, not the global max,
                # so a single reversed row doesn't cascade to flag all subsequent
                # rows that also precede the "peak" timestamp.
                if cur_ts < prev_ts:
                    _append_once({
                        "parameter": "timestamp",
                        "timestamp": ts_str,
                        "value": 0,
                        "mean": 0.0,
                        "std": 0.0,
                        "z_score": 0.0,
                        "type": "timestamp_reversal",
                        "severity": "warning",
                        "description": (
                            f"Timestamp reversal: {ts_str} precedes "
                            f"previous event at {prev_ts_str}"
                        ),
                        "event_index": idx,
                    })

                # ── Timestamp gap ────────────────────────────────────────────
                elif gap_s >= TS_GAP_THRESHOLD_S:
                    _append_once({
                        "parameter": "timestamp",
                        "timestamp": ts_str,
                        "value": round(gap_s / 60, 1),
                        "mean": 0.0,
                        "std": 0.0,
                        "z_score": 0.0,
                        "type": "timestamp_gap",
                        "severity": "warning",
                        "description": (
                            f"Timestamp gap of {gap_s / 60:.1f} min between "
                            f"{prev_ts_str} and {ts_str}"
                        ),
                        "event_index": idx,
                    })

            # Always advance prev_ts to the current event (even for reversals)
            # so the next comparison is against the immediate predecessor.
            prev_ts = cur_ts
            prev_ts_str = ts_str

        elif ts_str:
            prev_ts_str = ts_str

        # ── Alarm cascade ────────────────────────────────────────────────────
        is_alarm = (
            event_type in ("ALARM", "ALARM_CASCADE", "PROCESS_ABORT")
            or severity_str in ("alarm", "critical")
        )
        if is_alarm and cur_ts is not None:
            alarm_window.append((cur_ts, idx))
            alarm_window = [
                (t, i) for (t, i) in alarm_window
                if (cur_ts - t).total_seconds() <= ALARM_CASCADE_WINDOW_S
            ]
            if len(alarm_window) >= ALARM_CASCADE_MIN_COUNT:
                _append_once({
                    "parameter": "alarm_cascade",
                    "timestamp": ts_str,
                    "value": len(alarm_window),
                    "mean": 0.0,
                    "std": 0.0,
                    "z_score": 0.0,
                    "type": "alarm_cascade",
                    "severity": "alarm",
                    "description": (
                        f"Alarm cascade: {len(alarm_window)} alarms "
                        f"within {ALARM_CASCADE_WINDOW_S}s window"
                    ),
                    "event_index": idx,
                })
        elif not is_alarm and cur_ts is not None:
            alarm_window = [
                (t, i) for (t, i) in alarm_window
                if (cur_ts - t).total_seconds() <= ALARM_CASCADE_WINDOW_S
            ]

    return structural


# ── Public API ───────────────────────────────────────────────────────────────

def detect_anomalies_for_run(run_id: str, db: Session) -> dict:
    """Fetch events for a run and return full anomaly detection results.

    Queries all events in original insertion order (by id) so that
    structural checks (reversal, gap) see the file's original sequence.
    """
    all_events: list[Event] = (
        db.query(Event)
        .filter(Event.run_id == run_id)
        .order_by(Event.id)
        .all()
    )

    sensor_events = [e for e in all_events if e.event_type == "PARAMETER_READING"]

    stat_anomalies = detect_anomalies(sensor_events)
    struct_anomalies = _detect_structural_anomalies(all_events)

    all_anomalies = stat_anomalies + struct_anomalies
    all_anomalies.sort(key=lambda a: (a["timestamp"], a["type"]))

    def _count(atype: str) -> int:
        return sum(1 for a in all_anomalies if a["type"] == atype)

    return {
        "run_id": run_id,
        "total_readings_analysed": sum(
            1 for e in sensor_events if _to_float(e.value) is not None
        ),
        "anomaly_count": len(all_anomalies),
        "z_score_anomalies": _count("z_score"),
        "drift_anomalies": _count("rolling_drift"),
        "alarm_cascade_anomalies": _count("alarm_cascade"),
        "timestamp_gap_anomalies": _count("timestamp_gap"),
        "timestamp_reversal_anomalies": _count("timestamp_reversal"),
        "corrupt_field_anomalies": _count("corrupt_field"),
        "missing_field_anomalies": _count("missing_field"),
        "parameters_with_anomalies": sorted(
            {a["parameter"] for a in all_anomalies}
        ),
        "anomalies": all_anomalies,
    }
