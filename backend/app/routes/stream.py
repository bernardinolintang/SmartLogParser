"""Real-time streaming simulation endpoints."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Run, Event
from app.services.format_detector import detect_format
from app.services.normalization import normalize_events
from app.services.validation import validate_events
from app.services.llm_service import enhance_partial_events
from app.services.deduplication import deduplicate_event_dicts, existing_hashes_from_models
from app.parsers import parse_json, parse_csv, parse_kv, parse_syslog, parse_text, parse_hex, parse_xml

router = APIRouter(prefix="/api/stream", tags=["streaming"])

_PARSER_MAP = {
    "json": parse_json,
    "xml": parse_xml,
    "csv": parse_csv,
    "kv": parse_kv,
    "syslog": parse_syslog,
    "text": parse_text,
    "hex": parse_hex,
}


class StreamStartRequest(BaseModel):
    tool_id: str = "STREAM_TOOL"
    format_hint: str | None = None


class StreamAppendRequest(BaseModel):
    run_id: str
    lines: str


@router.post("/start")
def stream_start(req: StreamStartRequest, db: Session = Depends(get_db)):
    run_id = f"STREAM_{uuid.uuid4().hex[:10].upper()}"
    run = Run(
        run_id=run_id,
        filename=f"stream_{req.tool_id}",
        source_format=req.format_hint or "text",
        status="streaming",
    )
    db.add(run)
    db.commit()
    return {"run_id": run_id, "status": "streaming"}


@router.post("/append")
def stream_append(req: StreamAppendRequest, db: Session = Depends(get_db)):
    run = db.query(Run).filter(Run.run_id == req.run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Stream session not found")

    fmt = detect_format(req.lines)
    parser_fn = _PARSER_MAP.get(fmt, parse_text)
    raw_events = parser_fn(req.lines, req.run_id)
    normalized = normalize_events(raw_events)
    validated = validate_events(normalized)

    partial_count = sum(1 for e in validated if e.get("parse_status") == "partial")
    if partial_count > 0:
        validated = enhance_partial_events(validated, req.run_id)
        validated = normalize_events(validated)
        validated = validate_events(validated)

    existing_events = db.query(Event).filter(Event.run_id == req.run_id).all()
    existing_hashes = existing_hashes_from_models(existing_events)
    unique_events, dropped_duplicates, _ = deduplicate_event_dicts(validated, existing_hashes)

    db_events = []
    for e in unique_events:
        db_events.append(Event(
            run_id=e.get("run_id", req.run_id),
            timestamp=e.get("timestamp"),
            fab_id=e.get("fab_id", "FAB_01"),
            tool_id=e.get("tool_id", "UNKNOWN"),
            tool_type=e.get("tool_type", "unknown"),
            chamber_id=e.get("chamber_id", "CH_A"),
            recipe_name=e.get("recipe_name"),
            recipe_step=e.get("recipe_step"),
            event_type=e.get("event_type", "PARAMETER_READING"),
            parameter=e.get("parameter"),
            value=e.get("value"),
            unit=e.get("unit"),
            alarm_code=e.get("alarm_code"),
            severity=e.get("severity", "info"),
            message=e.get("message"),
            raw_line=e.get("raw_line"),
            raw_line_number=e.get("raw_line_number"),
            parse_status=e.get("parse_status", "ok"),
        ))

    db.add_all(db_events)
    run.total_events = (run.total_events or 0) + len(db_events)
    db.commit()

    return {
        "run_id": req.run_id,
        "new_events": len(db_events),
        "duplicates_dropped": dropped_duplicates,
        "total_events": run.total_events,
    }


@router.post("/finish")
def stream_finish(run_id: str, db: Session = Depends(get_db)):
    run = db.query(Run).filter(Run.run_id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Stream session not found")
    run.status = "completed"
    db.commit()
    return {"run_id": run_id, "status": "completed", "total_events": run.total_events}
