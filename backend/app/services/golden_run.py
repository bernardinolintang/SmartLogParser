"""Golden run comparison and drift detection."""
from __future__ import annotations

import math
from sqlalchemy.orm import Session

from app.models import Run, Event, DriftAlert


def mark_golden(db: Session, run_id: str) -> bool:
    run = db.query(Run).filter(Run.run_id == run_id).first()
    if not run:
        return False
    run.is_golden = True
    db.commit()
    return True


def _stats_by_param(events: list, group_by_step: bool = False) -> dict[str, dict]:
    """Compute mean, stddev, min, max per parameter (optionally grouped by recipe_step)."""
    buckets: dict[str, list[float]] = {}
    for e in events:
        if e.parameter and e.value:
            try:
                v = float(e.value)
            except (ValueError, TypeError):
                continue
            key = e.parameter
            if group_by_step and e.recipe_step:
                key = f"{e.parameter}|{e.recipe_step}"
            buckets.setdefault(key, []).append(v)

    result = {}
    for key, vals in buckets.items():
        n = len(vals)
        mean = sum(vals) / n
        variance = sum((x - mean) ** 2 for x in vals) / n if n > 1 else 0.0
        result[key] = {
            "mean": mean,
            "stddev": math.sqrt(variance),
            "min": min(vals),
            "max": max(vals),
            "count": n,
        }
    return result


def compare_runs(db: Session, baseline_run_id: str, current_run_id: str) -> dict:
    baseline_events = db.query(Event).filter(
        Event.run_id == baseline_run_id,
        Event.event_type == "PARAMETER_READING",
    ).all()
    current_events = db.query(Event).filter(
        Event.run_id == current_run_id,
        Event.event_type == "PARAMETER_READING",
    ).all()

    has_steps = any(e.recipe_step for e in baseline_events) or any(e.recipe_step for e in current_events)
    baseline_stats = _stats_by_param(baseline_events, group_by_step=has_steps)
    current_stats = _stats_by_param(current_events, group_by_step=has_steps)

    all_params = sorted(set(baseline_stats) | set(current_stats))
    comparisons = []
    drift_alerts = []

    for param_key in all_params:
        b = baseline_stats.get(param_key)
        c = current_stats.get(param_key)
        b_mean = b["mean"] if b else None
        c_mean = c["mean"] if c else None

        if b_mean is not None and c_mean is not None and b_mean != 0:
            pct = ((c_mean - b_mean) / abs(b_mean)) * 100
        elif b_mean == 0 and c_mean is not None and c_mean != 0:
            pct = 100.0 if c_mean > 0 else -100.0
        else:
            pct = None

        severity = "info"
        if pct is not None:
            if abs(pct) > 20:
                severity = "alarm"
            elif abs(pct) > 10:
                severity = "warning"

        if "|" in param_key:
            param_name, step = param_key.split("|", 1)
        else:
            param_name, step = param_key, None

        comp = {
            "parameter": param_name,
            "recipe_step": step,
            "baseline_value": round(b_mean, 4) if b_mean is not None else None,
            "current_value": round(c_mean, 4) if c_mean is not None else None,
            "stddev_baseline": round(b["stddev"], 4) if b else None,
            "stddev_current": round(c["stddev"], 4) if c else None,
            "baseline_count": b["count"] if b else 0,
            "current_count": c["count"] if c else 0,
            "pct_deviation": round(pct, 2) if pct is not None else None,
            "severity": severity,
        }
        comparisons.append(comp)

        if severity != "info" and pct is not None:
            drift_alerts.append({
                "run_id": current_run_id,
                "parameter": param_name,
                "baseline_value": b_mean,
                "current_value": c_mean,
                "pct_deviation": pct,
                "severity": severity,
                "stddev_baseline": b["stddev"] if b else None,
                "stddev_current": c["stddev"] if c else None,
                "recipe_step": step,
            })

    _upsert_drift_alerts(db, current_run_id, drift_alerts)

    return {
        "baseline_run_id": baseline_run_id,
        "current_run_id": current_run_id,
        "comparisons": comparisons,
        "drift_count": len(drift_alerts),
    }


def _upsert_drift_alerts(db: Session, run_id: str, alerts: list[dict]) -> None:
    """Insert or update drift alerts, avoiding duplicates per (run_id, parameter)."""
    db.query(DriftAlert).filter(DriftAlert.run_id == run_id).delete()

    for a in alerts:
        db.add(DriftAlert(
            run_id=a["run_id"],
            parameter=a["parameter"],
            baseline_value=a["baseline_value"],
            current_value=a["current_value"],
            pct_deviation=a["pct_deviation"],
            severity=a["severity"],
            stddev_baseline=a.get("stddev_baseline"),
            stddev_current=a.get("stddev_current"),
            recipe_step=a.get("recipe_step"),
        ))
    db.commit()
