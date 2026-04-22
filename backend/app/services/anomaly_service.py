"""Statistical anomaly detection for parsed semiconductor sensor data.

Two complementary techniques:
  1. Z-score — flags individual readings that deviate > Z_THRESHOLD standard
     deviations from the per-parameter mean across the whole run.
  2. Rolling-mean deviation — computes a sliding window mean (ROLLING_WINDOW
     samples) and flags points where the reading deviates > ROLLING_THRESHOLD
     from the local rolling mean.  This catches *parameter drift* even when
     the global mean is itself drifting.

Both techniques operate per-parameter so different sensors are evaluated on
their own baselines.
"""
from __future__ import annotations

import math
import statistics
from collections import defaultdict, deque
from typing import Any

from sqlalchemy.orm import Session

from app.models import Event

Z_THRESHOLD = 2.5        # standard deviations above/below mean → anomaly
ROLLING_WINDOW = 10      # samples for rolling-mean drift detection
ROLLING_THRESHOLD = 2.0  # rolling-mean deviations to flag as drift


def _to_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(str(value).strip())
    except (ValueError, TypeError):
        return None


def detect_anomalies(events: list[Event]) -> list[dict]:
    """Run Z-score and rolling-mean drift detection on a list of Event ORM objects.

    Returns a list of anomaly dicts, one per flagged data point.
    """
    # Group numeric readings by parameter
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
            # Too few points for meaningful statistics
            continue

        values = [r[1] for r in readings]
        mean = statistics.mean(values)
        try:
            std = statistics.stdev(values)
        except statistics.StatisticsError:
            std = 0.0

        # ── Z-score detection ─────────────────────────────────────────────
        for ts, val, idx in readings:
            if std > 0:
                z = (val - mean) / std
            else:
                z = 0.0

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

        # ── Rolling-mean drift detection ──────────────────────────────────
        window: deque[float] = deque(maxlen=ROLLING_WINDOW)
        for ts, val, idx in readings:
            if len(window) >= 3:
                roll_mean = statistics.mean(window)
                roll_std = statistics.stdev(window) if len(window) >= 2 else 0.0
                if roll_std > 0:
                    roll_z = abs(val - roll_mean) / roll_std
                else:
                    roll_z = 0.0

                if roll_z >= ROLLING_THRESHOLD:
                    already_flagged = any(
                        a["event_index"] == idx and a["type"] == "z_score"
                        for a in anomalies
                    )
                    if not already_flagged:
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

    # Sort by timestamp for readability
    anomalies.sort(key=lambda a: a["timestamp"])
    return anomalies


def detect_anomalies_for_run(run_id: str, db: Session) -> dict:
    """Fetch events for a run and return anomaly detection results."""
    events = (
        db.query(Event)
        .filter(Event.run_id == run_id, Event.event_type == "PARAMETER_READING")
        .order_by(Event.timestamp)
        .all()
    )

    anomalies = detect_anomalies(events)

    z_score_count = sum(1 for a in anomalies if a["type"] == "z_score")
    drift_count = sum(1 for a in anomalies if a["type"] == "rolling_drift")

    return {
        "run_id": run_id,
        "total_readings_analysed": sum(
            1 for e in events if _to_float(e.value) is not None
        ),
        "anomaly_count": len(anomalies),
        "z_score_anomalies": z_score_count,
        "drift_anomalies": drift_count,
        "parameters_with_anomalies": sorted(
            {a["parameter"] for a in anomalies}
        ),
        "anomalies": anomalies,
    }
