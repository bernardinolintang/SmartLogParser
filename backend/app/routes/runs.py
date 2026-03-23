"""Run management and data retrieval endpoints."""
from __future__ import annotations

import csv
import io
import json

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Run, Event
from app.security import sanitize_csv_value
from app.services.summary import compute_summary

router = APIRouter(prefix="/api", tags=["runs"])


@router.get("/runs")
def list_runs(db: Session = Depends(get_db)):
    runs = db.query(Run).order_by(Run.uploaded_at.desc()).all()
    return [
        {
            "run_id": r.run_id,
            "filename": r.filename,
            "source_format": r.source_format,
            "uploaded_at": str(r.uploaded_at) if r.uploaded_at else None,
            "status": r.status,
            "is_golden": r.is_golden,
            "total_events": r.total_events,
            "alarm_count": r.alarm_count,
            "warning_count": r.warning_count,
        }
        for r in runs
    ]


@router.get("/runs/{run_id}")
def get_run(run_id: str, db: Session = Depends(get_db)):
    run = db.query(Run).filter(Run.run_id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return {
        "run_id": run.run_id,
        "filename": run.filename,
        "source_format": run.source_format,
        "uploaded_at": str(run.uploaded_at) if run.uploaded_at else None,
        "status": run.status,
        "is_golden": run.is_golden,
        "total_events": run.total_events,
        "alarm_count": run.alarm_count,
        "warning_count": run.warning_count,
    }


@router.get("/runs/{run_id}/events")
def get_events(
    run_id: str,
    tool_id: str | None = None,
    chamber_id: str | None = None,
    severity: str | None = None,
    parameter: str | None = None,
    limit: int = Query(default=5000, le=50000),
    offset: int = 0,
    db: Session = Depends(get_db),
):
    q = db.query(Event).filter(Event.run_id == run_id)
    if tool_id:
        q = q.filter(Event.tool_id == tool_id)
    if chamber_id:
        q = q.filter(Event.chamber_id == chamber_id)
    if severity:
        q = q.filter(Event.severity == severity)
    if parameter:
        q = q.filter(Event.parameter == parameter)

    events = q.offset(offset).limit(limit).all()
    return [_event_to_dict(e) for e in events]


@router.get("/runs/{run_id}/alarms")
def get_alarms(run_id: str, db: Session = Depends(get_db)):
    alarms = (
        db.query(Event)
        .filter(Event.run_id == run_id, Event.severity.in_(["alarm", "critical"]))
        .all()
    )
    return [_event_to_dict(e) for e in alarms]


@router.get("/runs/{run_id}/summary")
def get_summary(run_id: str, db: Session = Depends(get_db)):
    run = db.query(Run).filter(Run.run_id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return compute_summary(db, run_id)


@router.get("/runs/{run_id}/timeseries")
def get_timeseries(
    run_id: str,
    parameter: str | None = None,
    db: Session = Depends(get_db),
):
    q = db.query(Event).filter(
        Event.run_id == run_id,
        Event.event_type == "PARAMETER_READING",
    )
    if parameter:
        q = q.filter(Event.parameter == parameter)

    events = q.order_by(Event.timestamp).all()
    return [
        {
            "timestamp": e.timestamp,
            "parameter": e.parameter,
            "value": e.value,
            "unit": e.unit,
            "tool_id": e.tool_id,
            "chamber_id": e.chamber_id,
            "recipe_step": e.recipe_step,
        }
        for e in events
    ]


@router.get("/runs/{run_id}/timeline")
def get_timeline(run_id: str, db: Session = Depends(get_db)):
    events = (
        db.query(Event)
        .filter(Event.run_id == run_id)
        .order_by(Event.timestamp)
        .all()
    )
    return [_event_to_dict(e) for e in events]


@router.get("/runs/{run_id}/health")
def get_health(run_id: str, db: Session = Depends(get_db)):
    events = db.query(Event).filter(Event.run_id == run_id).all()
    total = len(events)
    alarms = sum(1 for e in events if e.severity in ("alarm", "critical"))
    warnings = sum(1 for e in events if e.severity == "warning")
    chambers = set(e.chamber_id for e in events if e.chamber_id)
    return {
        "total_events": total,
        "alarm_count": alarms,
        "warning_count": warnings,
        "chambers": sorted(chambers),
        "health_score": round(1.0 - (alarms / total) if total else 1.0, 3),
    }


@router.get("/runs/{run_id}/download/csv")
def download_csv(run_id: str, db: Session = Depends(get_db)):
    events = db.query(Event).filter(Event.run_id == run_id).all()
    if not events:
        raise HTTPException(status_code=404, detail="No events found")

    buf = io.StringIO()
    cols = [
        "timestamp", "fab_id", "tool_id", "tool_type", "chamber_id",
        "recipe_name", "recipe_step", "event_type", "parameter",
        "value", "unit", "alarm_code", "severity", "message",
    ]
    writer = csv.DictWriter(buf, fieldnames=cols)
    writer.writeheader()
    for e in events:
        row = {c: sanitize_csv_value(str(getattr(e, c) or "")) for c in cols}
        writer.writerow(row)

    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={run_id}.csv"},
    )


@router.get("/runs/{run_id}/download/json")
def download_json(run_id: str, db: Session = Depends(get_db)):
    events = db.query(Event).filter(Event.run_id == run_id).all()
    if not events:
        raise HTTPException(status_code=404, detail="No events found")

    data = [_event_to_dict(e) for e in events]
    content = json.dumps(data, indent=2)
    return StreamingResponse(
        io.StringIO(content),
        media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename={run_id}.json"},
    )


def _event_to_dict(e: Event) -> dict:
    return {
        "id": e.id,
        "run_id": e.run_id,
        "timestamp": e.timestamp,
        "fab_id": e.fab_id,
        "tool_id": e.tool_id,
        "tool_type": e.tool_type,
        "chamber_id": e.chamber_id,
        "module_id": e.module_id,
        "lot_id": e.lot_id,
        "wafer_id": e.wafer_id,
        "recipe_name": e.recipe_name,
        "recipe_step": e.recipe_step,
        "event_type": e.event_type,
        "parameter": e.parameter,
        "value": e.value,
        "unit": e.unit,
        "alarm_code": e.alarm_code,
        "severity": e.severity,
        "message": e.message,
        "parse_status": e.parse_status,
    }
