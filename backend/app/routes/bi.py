"""BI-friendly endpoints for external dashboard tools.

These endpoints expose flattened, filterable records designed for
Grafana/Tableau/Power BI ingestion.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Event, Run

router = APIRouter(prefix="/api/bi", tags=["bi"])


def _to_float(value: str | None) -> float | None:
    if value is None:
        return None
    s = str(value).strip()
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


@router.get("/events")
def bi_events(
    run_id: str | None = None,
    tool_id: str | None = None,
    chamber_id: str | None = None,
    parameter: str | None = None,
    severity: str | None = None,
    event_type: str | None = None,
    start_ts: str | None = None,
    end_ts: str | None = None,
    limit: int = Query(default=5000, ge=1, le=50000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    """Return flattened events with optional numeric projection for BI tools."""
    q = db.query(Event)

    if run_id:
        q = q.filter(Event.run_id == run_id)
    if tool_id:
        q = q.filter(Event.tool_id == tool_id)
    if chamber_id:
        q = q.filter(Event.chamber_id == chamber_id)
    if parameter:
        q = q.filter(Event.parameter == parameter)
    if severity:
        q = q.filter(Event.severity == severity)
    if event_type:
        q = q.filter(Event.event_type == event_type)
    if start_ts:
        q = q.filter(Event.timestamp >= start_ts)
    if end_ts:
        q = q.filter(Event.timestamp <= end_ts)

    events = q.order_by(Event.timestamp).offset(offset).limit(limit).all()
    return [
        {
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
            "numeric_value": _to_float(e.value),
            "unit": e.unit,
            "alarm_code": e.alarm_code,
            "severity": e.severity,
            "message": e.message,
            "parse_status": e.parse_status,
        }
        for e in events
    ]


@router.get("/timeseries")
def bi_timeseries(
    parameter: str | None = None,
    run_id: str | None = None,
    tool_id: str | None = None,
    start_ts: str | None = None,
    end_ts: str | None = None,
    limit: int = Query(default=5000, ge=1, le=100000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    """Return parameter-reading rows optimized for trend dashboards."""
    q = db.query(Event).filter(Event.event_type == "PARAMETER_READING")

    if parameter:
        q = q.filter(Event.parameter == parameter)
    if run_id:
        q = q.filter(Event.run_id == run_id)
    if tool_id:
        q = q.filter(Event.tool_id == tool_id)
    if start_ts:
        q = q.filter(Event.timestamp >= start_ts)
    if end_ts:
        q = q.filter(Event.timestamp <= end_ts)

    rows = q.order_by(Event.timestamp).offset(offset).limit(limit).all()
    return [
        {
            "run_id": e.run_id,
            "timestamp": e.timestamp,
            "tool_id": e.tool_id,
            "chamber_id": e.chamber_id,
            "recipe_name": e.recipe_name,
            "recipe_step": e.recipe_step,
            "parameter": e.parameter,
            "value": e.value,
            "numeric_value": _to_float(e.value),
            "unit": e.unit,
            "parse_status": e.parse_status,
        }
        for e in rows
    ]


@router.get("/kpis")
def bi_kpis(
    run_id: str | None = None,
    limit: int = Query(default=200, ge=1, le=5000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    """Return per-run KPIs suitable for scorecards and executive dashboards."""
    q = db.query(Run)
    if run_id:
        q = q.filter(Run.run_id == run_id)

    runs = q.order_by(Run.uploaded_at.desc()).offset(offset).limit(limit).all()
    data = []
    for r in runs:
        total = int(r.total_events or 0)
        alarms = int(r.alarm_count or 0)
        warnings = int(r.warning_count or 0)
        health_score = round(1.0 - (alarms / total), 3) if total > 0 else 1.0
        data.append(
            {
                "run_id": r.run_id,
                "filename": r.filename,
                "source_format": r.source_format,
                "uploaded_at": str(r.uploaded_at) if r.uploaded_at else None,
                "status": r.status,
                "is_golden": bool(r.is_golden),
                "total_events": total,
                "alarm_count": alarms,
                "warning_count": warnings,
                "health_score": health_score,
            }
        )
    return data