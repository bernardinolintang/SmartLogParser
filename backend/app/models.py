from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, Text, Index, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime, timezone, UTC

from app.database import Base


class Run(Base):
    __tablename__ = "runs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    run_id = Column(String, unique=True, nullable=False, index=True)
    filename = Column(String, nullable=False)
    source_format = Column(String, nullable=False)
    source_vendor = Column(String, default="unknown")
    uploaded_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    status = Column(String, default="processing")  # processing | completed | failed
    is_golden = Column(Boolean, default=False)
    total_events = Column(Integer, default=0)
    alarm_count = Column(Integer, default=0)
    warning_count = Column(Integer, default=0)
    needs_review = Column(Boolean, default=False)

    events = relationship("Event", back_populates="run", cascade="all, delete-orphan")
    drift_alerts = relationship("DriftAlert", back_populates="run", cascade="all, delete-orphan")
    failed_events = relationship("FailedEvent", back_populates="run", cascade="all, delete-orphan")


class Event(Base):
    __tablename__ = "events"
    __table_args__ = (
        Index("ix_events_run_tool", "run_id", "tool_id"),
        Index("ix_events_run_param", "run_id", "parameter"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    run_id = Column(String, ForeignKey("runs.run_id"), nullable=False, index=True)
    timestamp = Column(String)
    fab_id = Column(String, default="_DEFAULT")
    tool_id = Column(String, default="_DEFAULT")
    tool_type = Column(String, default="_DEFAULT")  # etch, deposition, lithography, metrology, _DEFAULT
    chamber_id = Column(String, default="_DEFAULT")
    module_id = Column(String)
    lot_id = Column(String)
    wafer_id = Column(String)
    recipe_name = Column(String)
    recipe_step = Column(String)
    event_type = Column(String, default="PARAMETER_READING")
    event_subtype = Column(String)
    parameter = Column(String)
    value = Column(String)
    unit = Column(String)
    alarm_code = Column(String)
    severity = Column(String, default="info")  # info | warning | alarm | critical
    message = Column(Text)
    raw_line = Column(Text)
    raw_line_number = Column(Integer)
    parse_status = Column(String, default="ok")  # ok | partial | failed | low_confidence
    parse_error = Column(String)
    parser_version = Column(String, default="1.0.0")

    run = relationship("Run", back_populates="events")


class DriftAlert(Base):
    __tablename__ = "drift_alerts"
    __table_args__ = (
        UniqueConstraint("run_id", "parameter", name="uq_drift_run_param"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    run_id = Column(String, ForeignKey("runs.run_id"), nullable=False, index=True)
    tool_id = Column(String)
    chamber_id = Column(String)
    recipe_name = Column(String)
    recipe_step = Column(String)
    parameter = Column(String)
    baseline_value = Column(Float)
    current_value = Column(Float)
    pct_deviation = Column(Float)
    severity = Column(String, default="info")
    stddev_baseline = Column(Float)
    stddev_current = Column(Float)

    run = relationship("Run", back_populates="drift_alerts")


class FailedEvent(Base):
    __tablename__ = "failed_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    run_id = Column(String, ForeignKey("runs.run_id"), nullable=False, index=True)
    raw_line = Column(Text)
    raw_line_number = Column(Integer)
    error = Column(Text)
    parser_version = Column(String)
    retry_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))
    last_retry_at = Column(DateTime, nullable=True)

    run = relationship("Run", back_populates="failed_events")


class RunSummary(Base):
    __tablename__ = "run_summaries"

    id = Column(Integer, primary_key=True, autoincrement=True)
    run_id = Column(String, unique=True, nullable=False, index=True)
    alarm_count = Column(Integer, default=0)
    warning_count = Column(Integer, default=0)
    total_events = Column(Integer, default=0)
    process_success = Column(Boolean, default=True)
    stability_score = Column(Float, default=1.0)
    top_alarm = Column(String)
    fab_ids = Column(Text)
    tool_ids = Column(Text)
    chamber_ids = Column(Text)
    recipe_names = Column(Text)
    run_ids = Column(Text)
    parameters = Column(Text)
    time_start = Column(String)
    time_end = Column(String)
