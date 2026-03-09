"""Compute summary metrics for a parsed run."""

from sqlalchemy.orm import Session

from app.models import Event, RunSummary


def compute_summary(db: Session, run_id: str) -> dict:
    events = db.query(Event).filter(Event.run_id == run_id).all()
    if not events:
        return {}

    alarm_count = sum(1 for e in events if e.severity in ("alarm", "critical"))
    warning_count = sum(1 for e in events if e.severity == "warning")
    timestamps = sorted(e.timestamp for e in events if e.timestamp)

    alarm_codes = [e.alarm_code for e in events if e.alarm_code]
    top_alarm = max(set(alarm_codes), key=alarm_codes.count) if alarm_codes else None

    total = len(events)
    failed = sum(1 for e in events if e.parse_status == "failed")
    stability = 1.0 - (alarm_count / total) if total else 1.0

    fab_ids = sorted(set(e.fab_id for e in events if e.fab_id))
    tool_ids = sorted(set(e.tool_id for e in events if e.tool_id))
    chamber_ids = sorted(set(e.chamber_id for e in events if e.chamber_id))
    recipe_names = sorted(set(e.recipe_name for e in events if e.recipe_name))
    parameters = sorted(set(e.parameter for e in events if e.parameter))

    summary = RunSummary(
        run_id=run_id,
        alarm_count=alarm_count,
        warning_count=warning_count,
        total_events=total,
        process_success=alarm_count == 0,
        stability_score=round(stability, 3),
        top_alarm=top_alarm,
        fab_ids=",".join(fab_ids),
        tool_ids=",".join(tool_ids),
        chamber_ids=",".join(chamber_ids),
        recipe_names=",".join(recipe_names),
        parameters=",".join(parameters),
        time_start=timestamps[0] if timestamps else None,
        time_end=timestamps[-1] if timestamps else None,
    )

    existing = db.query(RunSummary).filter(RunSummary.run_id == run_id).first()
    if existing:
        for col in RunSummary.__table__.columns:
            if col.name not in ("id", "run_id"):
                setattr(existing, col.name, getattr(summary, col.name))
    else:
        db.add(summary)

    db.commit()

    return {
        "run_id": run_id,
        "totalEvents": total,
        "alarms": alarm_count,
        "warnings": warning_count,
        "process_success": alarm_count == 0,
        "stability_score": round(stability, 3),
        "top_alarm": top_alarm,
        "fabIds": fab_ids,
        "toolIds": tool_ids,
        "chamberIds": chamber_ids,
        "recipeNames": recipe_names,
        "parameters": parameters,
        "timeRange": {
            "start": timestamps[0] if timestamps else "",
            "end": timestamps[-1] if timestamps else "",
        },
        "equipmentIds": tool_ids,
        "runIds": [run_id],
    }
