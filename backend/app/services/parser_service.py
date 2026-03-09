"""Main parser orchestrator.

Flow:
    detect format -> deterministic parse -> normalize -> validate
    -> LLM fallback for partial events -> store in DB -> compute summary
"""

import uuid
import logging

from sqlalchemy.orm import Session

from app.models import Run, Event
from app.services.format_detector import detect_format
from app.services.normalization import normalize_events
from app.services.validation import validate_events
from app.services.llm_service import enhance_partial_events
from app.services.summary import compute_summary
from app.parsers import (
    parse_json,
    parse_xml,
    parse_csv,
    parse_kv,
    parse_syslog,
    parse_text,
    parse_hex,
)

logger = logging.getLogger(__name__)

_PARSER_MAP = {
    "json": parse_json,
    "xml": parse_xml,
    "csv": parse_csv,
    "kv": parse_kv,
    "syslog": parse_syslog,
    "text": parse_text,
    "hex": parse_hex,
}


def parse_file(content: str, filename: str, db: Session) -> dict:
    """Full parse pipeline: detect -> parse -> normalize -> validate -> LLM -> store."""
    run_id = f"RUN_{uuid.uuid4().hex[:12].upper()}"

    fmt = detect_format(content)
    logger.info("Detected format: %s for %s", fmt, filename)

    run = Run(
        run_id=run_id,
        filename=filename,
        source_format=fmt,
        status="processing",
    )
    db.add(run)
    db.commit()

    try:
        parser_fn = _PARSER_MAP.get(fmt, parse_text)
        raw_events = parser_fn(content, run_id)

        normalized = normalize_events(raw_events)
        validated = validate_events(normalized)

        partial_count = sum(1 for e in validated if e.get("parse_status") == "partial")
        if partial_count > 0:
            logger.info("Sending %d partial events to LLM fallback", partial_count)
            validated = enhance_partial_events(validated, run_id)
            validated = normalize_events(validated)
            validated = validate_events(validated)

        db_events = []
        for e in validated:
            db_events.append(Event(
                run_id=e.get("run_id", run_id),
                timestamp=e.get("timestamp"),
                fab_id=e.get("fab_id", "FAB_01"),
                tool_id=e.get("tool_id", "UNKNOWN"),
                tool_type=e.get("tool_type", "unknown"),
                chamber_id=e.get("chamber_id", "CH_A"),
                module_id=e.get("module_id"),
                lot_id=e.get("lot_id"),
                wafer_id=e.get("wafer_id"),
                recipe_name=e.get("recipe_name"),
                recipe_step=e.get("recipe_step"),
                event_type=e.get("event_type", "PARAMETER_READING"),
                event_subtype=e.get("event_subtype"),
                parameter=e.get("parameter"),
                value=e.get("value"),
                unit=e.get("unit"),
                alarm_code=e.get("alarm_code"),
                severity=e.get("severity", "info"),
                message=e.get("message"),
                raw_line=e.get("raw_line"),
                raw_line_number=e.get("raw_line_number"),
                parse_status=e.get("parse_status", "ok"),
                parse_error=e.get("parse_error"),
            ))

        db.add_all(db_events)

        alarm_count = sum(1 for e in db_events if e.severity in ("alarm", "critical"))
        warning_count = sum(1 for e in db_events if e.severity == "warning")

        run.status = "completed"
        run.total_events = len(db_events)
        run.alarm_count = alarm_count
        run.warning_count = warning_count
        db.commit()

        summary = compute_summary(db, run_id)

        frontend_events = []
        for e in db_events:
            frontend_events.append({
                "timestamp": e.timestamp or "",
                "fab_id": e.fab_id,
                "tool_id": e.tool_id,
                "tool_type": e.tool_type or "unknown",
                "chamber_id": e.chamber_id,
                "module_id": e.module_id,
                "lot_id": e.lot_id,
                "wafer_id": e.wafer_id,
                "recipe_name": e.recipe_name or "",
                "recipe_step": e.recipe_step or "",
                "event_type": _event_type_to_frontend(e.event_type),
                "parameter": e.parameter or "",
                "value": e.value or "",
                "unit": e.unit,
                "alarm_code": e.alarm_code,
                "severity": e.severity or "info",
                "message": e.message,
                "run_id": e.run_id,
                "equipment_id": e.tool_id,
                "step_id": e.recipe_step,
                "recipe_id": e.recipe_name,
                "parse_status": e.parse_status,
            })

        return {
            "run_id": run_id,
            "format": fmt,
            "events": frontend_events,
            "rawContent": content,
            "summary": summary,
            "rawPreview": content[:500],
            "filename": filename,
            "total_events": len(db_events),
            "alarm_count": alarm_count,
            "warning_count": warning_count,
            "status": "completed",
        }

    except Exception as exc:
        logger.exception("Parse failed for %s", filename)
        run.status = "failed"
        db.commit()
        raise exc


def _event_type_to_frontend(et: str) -> str:
    mapping = {
        "PARAMETER_READING": "sensor",
        "ALARM": "alarm",
        "WARNING": "warning",
        "STEP_START": "step_start",
        "STEP_END": "step_end",
        "PROCESS_START": "process_start",
        "PROCESS_END": "process_end",
        "INFO": "info",
        "STATE_CHANGE": "info",
    }
    return mapping.get(et, "info")
