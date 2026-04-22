"""Parser for Parquet-format semiconductor logs (Vendor B / data-lake style).

Reads a Parquet file from raw bytes using pandas, then maps column names to
the unified normalised schema.  Adding a new vendor's Parquet schema is a
column-mapping exercise: add an alias entry in _COL_ALIASES below.
"""
from __future__ import annotations

import io
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

# Column name aliases: (vendor_col → canonical_col)
_COL_ALIASES: dict[str, str] = {
    # timestamps
    "datetime": "timestamp",
    "date_time": "timestamp",
    "time": "timestamp",
    "event_time": "timestamp",
    # tool identifiers
    "equipment_id": "tool_id",
    "tool_name": "tool_id",
    "equipment": "tool_id",
    # fab / chamber
    "fab": "fab_id",
    "site": "fab_id",
    "chamber": "chamber_id",
    "module_id": "chamber_id",
    # lot / wafer
    "lot": "lot_id",
    "wafer": "wafer_id",
    "wafer_num": "wafer_id",
    # recipe
    "recipe": "recipe_name",
    "recipe_id": "recipe_name",
    "step": "recipe_step",
    "step_name": "recipe_step",
    "step_id": "recipe_step",
    # parameter / value / unit
    "param": "parameter",
    "param_name": "parameter",
    "sensor": "parameter",
    "sensor_name": "parameter",
    "measurement": "value",
    "reading": "value",
    "val": "value",
    "units": "unit",
    # severity / alarm
    "level": "severity",
    "alarm_level": "severity",
    "alarm_text": "alarm_code",
    "alarm_id": "alarm_code",
    "event_message": "message",
    "msg": "message",
}

_ALARM_KEYWORDS = {"alarm", "error", "fault", "critical", "fail"}
_WARNING_KEYWORDS = {"warn", "drift", "caution", "limit", "high", "low"}


def _infer_severity(row: dict) -> str:
    sev = str(row.get("severity", "")).lower()
    if sev in ("alarm", "critical", "error", "fault"):
        return "alarm"
    if sev in ("warning", "warn", "drift"):
        return "warning"

    for field in ("alarm_code", "message", "event_type"):
        text = str(row.get(field, "")).lower()
        if any(k in text for k in _ALARM_KEYWORDS):
            return "alarm"
        if any(k in text for k in _WARNING_KEYWORDS):
            return "warning"
    return "info"


def _normalise_row(row: dict, run_id: str) -> dict:
    ts = row.get("timestamp") or datetime.now(timezone.utc).isoformat()
    if not isinstance(ts, str):
        try:
            ts = ts.isoformat()
        except Exception:
            ts = str(ts)

    return {
        "run_id": run_id,
        "timestamp": ts,
        "fab_id": row.get("fab_id") or "",
        "tool_id": str(row.get("tool_id") or ""),
        "tool_type": str(row.get("tool_type") or ""),
        "chamber_id": str(row.get("chamber_id") or ""),
        "lot_id": row.get("lot_id"),
        "wafer_id": row.get("wafer_id"),
        "recipe_name": str(row.get("recipe_name") or ""),
        "recipe_step": str(row.get("recipe_step") or ""),
        "event_type": str(row.get("event_type") or "PARAMETER_READING"),
        "parameter": str(row.get("parameter") or ""),
        "value": str(row.get("value", "")),
        "unit": row.get("unit"),
        "alarm_code": row.get("alarm_code"),
        "severity": _infer_severity(row),
        "message": row.get("message"),
        "parse_status": "ok",
    }


def parse_parquet(content: str, run_id: str, raw_bytes: bytes | None = None) -> list[dict]:
    """Parse a Parquet file from raw bytes.

    `content` is ignored (Parquet is binary); `raw_bytes` is required.
    """
    if not raw_bytes:
        logger.warning("parse_parquet called with no raw_bytes — returning empty")
        return []

    try:
        import pandas as pd
    except ImportError:
        logger.error("pandas is not installed; cannot parse Parquet files")
        return []

    try:
        df = pd.read_parquet(io.BytesIO(raw_bytes))
    except Exception as exc:
        logger.error("Failed to read Parquet: %s", exc)
        return []

    # Normalise column names: lowercase + apply aliases
    df.columns = [str(c).lower().strip() for c in df.columns]
    df.rename(columns=_COL_ALIASES, inplace=True)

    # Fill any still-missing canonical columns with empty string
    for col in ("timestamp", "tool_id", "parameter", "value"):
        if col not in df.columns:
            df[col] = ""

    events: list[dict] = []
    for _, row in df.iterrows():
        row_dict = {k: (None if _is_na(v) else v) for k, v in row.items()}
        events.append(_normalise_row(row_dict, run_id))

    logger.info("Parquet parser produced %d events for run %s", len(events), run_id)
    return events


def _is_na(val) -> bool:
    try:
        import math
        if isinstance(val, float) and math.isnan(val):
            return True
    except Exception:
        pass
    return val is None
