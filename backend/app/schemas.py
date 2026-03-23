from __future__ import annotations
from pydantic import BaseModel
from typing import Optional


class EventOut(BaseModel):
    id: int
    run_id: str
    timestamp: Optional[str] = None
    fab_id: str = "FAB_01"
    tool_id: str = "UNKNOWN"
    tool_type: str = "unknown"
    chamber_id: str = "CH_A"
    module_id: Optional[str] = None
    lot_id: Optional[str] = None
    wafer_id: Optional[str] = None
    recipe_name: Optional[str] = None
    recipe_step: Optional[str] = None
    event_type: str = "PARAMETER_READING"
    event_subtype: Optional[str] = None
    parameter: Optional[str] = None
    value: Optional[str] = None
    unit: Optional[str] = None
    alarm_code: Optional[str] = None
    severity: str = "info"
    message: Optional[str] = None
    raw_line: Optional[str] = None
    raw_line_number: Optional[int] = None
    parse_status: str = "ok"
    parse_error: Optional[str] = None

    model_config = {"from_attributes": True}


class RunOut(BaseModel):
    id: int
    run_id: str
    filename: str
    source_format: str
    source_vendor: str
    uploaded_at: Optional[str] = None
    status: str
    is_golden: bool
    total_events: int
    alarm_count: int
    warning_count: int

    model_config = {"from_attributes": True}


class RunSummaryOut(BaseModel):
    run_id: str
    alarm_count: int = 0
    warning_count: int = 0
    total_events: int = 0
    process_success: bool = True
    stability_score: float = 1.0
    top_alarm: Optional[str] = None
    fab_ids: list[str] = []
    tool_ids: list[str] = []
    chamber_ids: list[str] = []
    recipe_names: list[str] = []
    parameters: list[str] = []
    time_start: Optional[str] = None
    time_end: Optional[str] = None


class DriftAlertOut(BaseModel):
    id: int
    run_id: str
    tool_id: Optional[str] = None
    chamber_id: Optional[str] = None
    recipe_name: Optional[str] = None
    recipe_step: Optional[str] = None
    parameter: Optional[str] = None
    baseline_value: Optional[float] = None
    current_value: Optional[float] = None
    pct_deviation: Optional[float] = None
    severity: str = "info"

    model_config = {"from_attributes": True}


class UploadResponse(BaseModel):
    run_id: str
    filename: str
    detected_format: str
    total_events: int
    alarm_count: int
    warning_count: int
    status: str


class StreamStartResponse(BaseModel):
    run_id: str
    status: str


class ParseResultFrontend(BaseModel):
    """Schema matching what the React frontend expects."""
    format: str
    events: list[dict]
    rawContent: str
    summary: dict
    rawPreview: str
