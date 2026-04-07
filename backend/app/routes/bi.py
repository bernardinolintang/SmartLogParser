"""BI-friendly endpoints for external dashboard tools.

These endpoints expose flattened, filterable records designed for
Grafana/Tableau/Power BI ingestion.
"""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Event, Run

router = APIRouter(prefix="/api/bi", tags=["bi"])

_SENTINEL = "_DEFAULT"


def _clean(val: str | None) -> str:
    return "" if val == _SENTINEL else (val or "")


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


def _parse_ts(value: str | None) -> datetime | None:
    """Best-effort parse a timestamp string for filtering."""
    if not value:
        return None
    raw = value.strip()
    for fmt in (
        "%Y-%b %d %H:%M:%S",
        "%b %d %H:%M:%S",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d %H:%M:%S.%f",
        "%Y-%m-%dT%H:%M:%S.%f",
    ):
        try:
            return datetime.strptime(raw, fmt)
        except ValueError:
            pass
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        pass
    return None


def _filter_by_time(events: list, start_ts: str | None, end_ts: str | None) -> list:
    """Post-query filter using real datetime comparison for mixed-format timestamps."""
    if not start_ts and not end_ts:
        return events
    start_dt = _parse_ts(start_ts)
    end_dt = _parse_ts(end_ts)
    result = []
    for e in events:
        ts = _parse_ts(e.timestamp)
        if ts is None:
            continue
        ts_naive = ts.replace(tzinfo=None) if ts.tzinfo else ts
        if start_dt:
            start_naive = start_dt.replace(tzinfo=None) if start_dt.tzinfo else start_dt
            if ts_naive < start_naive:
                continue
        if end_dt:
            end_naive = end_dt.replace(tzinfo=None) if end_dt.tzinfo else end_dt
            if ts_naive > end_naive:
                continue
        result.append(e)
    return result


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

    all_events = q.all()
    filtered = _filter_by_time(all_events, start_ts, end_ts)
    page = filtered[offset : offset + limit]

    return [
        {
            "id": e.id,
            "run_id": e.run_id,
            "timestamp": e.timestamp,
            "fab_id": _clean(e.fab_id),
            "tool_id": _clean(e.tool_id),
            "tool_type": _clean(e.tool_type),
            "chamber_id": _clean(e.chamber_id),
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
        for e in page
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

    all_events = q.all()
    filtered = _filter_by_time(all_events, start_ts, end_ts)
    page = filtered[offset : offset + limit]

    return [
        {
            "run_id": e.run_id,
            "timestamp": e.timestamp,
            "tool_id": _clean(e.tool_id),
            "chamber_id": _clean(e.chamber_id),
            "recipe_name": e.recipe_name,
            "recipe_step": e.recipe_step,
            "parameter": e.parameter,
            "value": e.value,
            "numeric_value": _to_float(e.value),
            "unit": e.unit,
            "parse_status": e.parse_status,
        }
        for e in page
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