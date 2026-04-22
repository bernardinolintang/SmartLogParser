"""Upload and parse log files."""

from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.security import validate_upload, sanitize_filename, ensure_upload_dir
from app.services.parser_service import parse_file
from app.services.format_detector import looks_binary_bytes

router = APIRouter(prefix="/api", tags=["upload"])


@router.post("/upload")
async def upload_log(file: UploadFile = File(...), db: Session = Depends(get_db)):
    content_bytes = await file.read()
    ok, err = validate_upload(file.filename or "unknown.txt", len(content_bytes))
    if not ok:
        raise HTTPException(status_code=400, detail=err)

    is_binary = looks_binary_bytes(content_bytes)
    content = content_bytes.decode("latin-1" if is_binary else "utf-8", errors="replace")
    safe_name = sanitize_filename(file.filename or "unknown.txt")

    upload_dir = ensure_upload_dir()
    if is_binary:
        with open(upload_dir / safe_name, "wb") as f:
            f.write(content_bytes)
    else:
        with open(upload_dir / safe_name, "w", encoding="utf-8") as f:
            f.write(content)

    result = parse_file(content, file.filename or "unknown.txt", db, raw_bytes=content_bytes)

    return {
        "run_id": result["run_id"],
        "filename": result["filename"],
        "detected_format": result["format"],
        "detection_confidence": result.get("format_confidence"),
        "total_events": result["total_events"],
        "alarm_count": result["alarm_count"],
        "warning_count": result["warning_count"],
        "status": result["status"],
    }


@router.post("/parse")
async def parse_log_full(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Parse and return full result matching the frontend ParseResult schema."""
    content_bytes = await file.read()
    ok, err = validate_upload(file.filename or "unknown.txt", len(content_bytes))
    if not ok:
        raise HTTPException(status_code=400, detail=err)

    is_binary = looks_binary_bytes(content_bytes)
    content = content_bytes.decode("latin-1" if is_binary else "utf-8", errors="replace")
    safe_name = sanitize_filename(file.filename or "unknown.txt")

    upload_dir = ensure_upload_dir()
    if is_binary:
        with open(upload_dir / safe_name, "wb") as f:
            f.write(content_bytes)
    else:
        with open(upload_dir / safe_name, "w", encoding="utf-8") as f:
            f.write(content)

    result = parse_file(content, file.filename or "unknown.txt", db, raw_bytes=content_bytes)

    return {
        "run_id": result["run_id"],
        "format": result["format"],
        "events": result["events"],
        "rawContent": result["rawContent"],
        "summary": result["summary"],
        "rawPreview": result["rawPreview"],
        "total_events": result["total_events"],
        "alarm_count": result["alarm_count"],
        "warning_count": result["warning_count"],
        "duplicates_dropped": result["duplicates_dropped"],
        "failed_event_count": result["failed_events"],
    }
