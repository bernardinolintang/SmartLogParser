import os
import re
import uuid
from pathlib import Path

from app.config import settings

ALLOWED_EXTENSIONS = settings.allowed_extensions
MAX_UPLOAD_BYTES = settings.max_upload_size_mb * 1024 * 1024


def validate_upload(filename: str, size: int) -> tuple[bool, str]:
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        return False, f"File type '{ext}' not allowed. Accepted: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
    if size > MAX_UPLOAD_BYTES:
        return False, f"File too large ({size / 1024 / 1024:.1f} MB). Max: {settings.max_upload_size_mb} MB"
    return True, ""


def sanitize_filename(filename: str) -> str:
    stem = Path(filename).stem
    ext = Path(filename).suffix.lower()
    safe = re.sub(r"[^\w\-.]", "_", stem)[:100]
    return f"{safe}_{uuid.uuid4().hex[:8]}{ext}"


def ensure_upload_dir() -> Path:
    p = Path(settings.upload_dir)
    p.mkdir(parents=True, exist_ok=True)
    return p


def sanitize_csv_value(val: str) -> str:
    """Prevent spreadsheet formula injection in CSV exports."""
    if isinstance(val, str) and val and val[0] in ("=", "+", "-", "@"):
        return f"'{val}"
    return val
