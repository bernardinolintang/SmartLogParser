"""Upload and parse log files."""

from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.security import validate_upload, sanitize_filename, ensure_upload_dir
from app.services.parser_service import parse_file

router = APIRouter(prefix="/api", tags=["upload"])


@router.post("/upload")
async def upload_log(file: UploadFile = File(...), db: Session = Depends(get_db)):
    content_bytes = await file.read()
    ok, err = validate_upload(file.filename or "unknown.txt", len(content_bytes))
    if not ok:
        raise HTTPException(status_code=400, detail=err)

    content = content_bytes.decode("utf-8", errors="replace")
    safe_name = sanitize_filename(file.filename or "unknown.txt")

    upload_dir = ensure_upload_dir()
    with open(upload_dir / safe_name, "w", encoding="utf-8") as f:
        f.write(content)

    result = parse_file(content, file.filename or "unknown.txt", db)

    return {
        "run_id": result["run_id"],
        "filename": result["filename"],
        "detected_format": result["format"],
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

    content = content_bytes.decode("utf-8", errors="replace")
    safe_name = sanitize_filename(file.filename or "unknown.txt")

    upload_dir = ensure_upload_dir()
    with open(upload_dir / safe_name, "w", encoding="utf-8") as f:
        f.write(content)

    result = parse_file(content, file.filename or "unknown.txt", db)

    return {
        "format": result["format"],
        "events": result["events"],
        "rawContent": result["rawContent"],
        "summary": result["summary"],
        "rawPreview": result["rawPreview"],
    }
