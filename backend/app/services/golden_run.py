"""Golden run comparison and drift detection."""

from sqlalchemy.orm import Session

from app.models import Run, Event, DriftAlert


def mark_golden(db: Session, run_id: str) -> bool:
    run = db.query(Run).filter(Run.run_id == run_id).first()
    if not run:
        return False
    run.is_golden = True
    db.commit()
    return True


def compare_runs(db: Session, baseline_run_id: str, current_run_id: str) -> dict:
    baseline_events = db.query(Event).filter(
        Event.run_id == baseline_run_id,
        Event.event_type == "PARAMETER_READING",
    ).all()
    current_events = db.query(Event).filter(
        Event.run_id == current_run_id,
        Event.event_type == "PARAMETER_READING",
    ).all()

    def _avg_by_param(events: list) -> dict[str, float]:
        totals: dict[str, list[float]] = {}
        for e in events:
            if e.parameter and e.value:
                try:
                    v = float(e.value)
                    totals.setdefault(e.parameter, []).append(v)
                except ValueError:
                    pass
        return {k: sum(v) / len(v) for k, v in totals.items()}

    baseline_avgs = _avg_by_param(baseline_events)
    current_avgs = _avg_by_param(current_events)

    all_params = set(baseline_avgs) | set(current_avgs)
    comparisons = []
    drift_alerts = []

    for param in sorted(all_params):
        b_val = baseline_avgs.get(param)
        c_val = current_avgs.get(param)
        if b_val is not None and c_val is not None and b_val != 0:
            pct = ((c_val - b_val) / abs(b_val)) * 100
        else:
            pct = None

        severity = "info"
        if pct is not None:
            if abs(pct) > 20:
                severity = "alarm"
            elif abs(pct) > 10:
                severity = "warning"

        comp = {
            "parameter": param,
            "baseline_value": round(b_val, 4) if b_val is not None else None,
            "current_value": round(c_val, 4) if c_val is not None else None,
            "pct_deviation": round(pct, 2) if pct is not None else None,
            "severity": severity,
        }
        comparisons.append(comp)

        if severity != "info" and pct is not None:
            drift_alerts.append(DriftAlert(
                run_id=current_run_id,
                parameter=param,
                baseline_value=b_val,
                current_value=c_val,
                pct_deviation=pct,
                severity=severity,
            ))

    if drift_alerts:
        db.add_all(drift_alerts)
        db.commit()

    return {
        "baseline_run_id": baseline_run_id,
        "current_run_id": current_run_id,
        "comparisons": comparisons,
        "drift_count": len(drift_alerts),
    }
