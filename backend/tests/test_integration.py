"""Integration tests: full parse pipeline, golden run comparison, format detection, API routes."""
from __future__ import annotations

import json
import math
import os
import sys

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.database import Base
from app.models import Run, Event, DriftAlert, FailedEvent, RunSummary
from app.services.parser_service import parse_file
from app.services.golden_run import mark_golden, compare_runs, _stats_by_param
from app.services.format_detector import detect_format_with_confidence
from app.services.normalization import normalize_events
from app.services.validation import validate_events
from app.utils.physical_limits import PHYSICAL_LIMITS, validate_physical_plausibility


SAMPLE_JSON = os.path.join(os.path.dirname(__file__), "..", "sample_logs", "plasma_etch_01.json")


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


class TestParsePipeline:
    """Full end-to-end parse through the DB."""

    def test_parse_json_sample(self, db):
        with open(SAMPLE_JSON) as f:
            content = f.read()
        result = parse_file(content, "plasma_etch_01.json", db)
        assert result["status"] == "completed"
        assert result["format"] == "json"
        assert result["total_events"] > 0
        assert result["run_id"].startswith("RUN_")

    def test_parse_json_events_stored_in_db(self, db):
        with open(SAMPLE_JSON) as f:
            content = f.read()
        result = parse_file(content, "plasma_etch_01.json", db)
        events = db.query(Event).filter(Event.run_id == result["run_id"]).all()
        assert len(events) == result["total_events"]

    def test_parse_run_created(self, db):
        with open(SAMPLE_JSON) as f:
            content = f.read()
        result = parse_file(content, "plasma_etch_01.json", db)
        run = db.query(Run).filter(Run.run_id == result["run_id"]).first()
        assert run is not None
        assert run.status == "completed"
        assert run.filename == "plasma_etch_01.json"

    def test_parse_events_have_tool_id(self, db):
        with open(SAMPLE_JSON) as f:
            content = f.read()
        result = parse_file(content, "plasma_etch_01.json", db)
        events = db.query(Event).filter(Event.run_id == result["run_id"]).all()
        for e in events:
            assert e.tool_id == "ETCH_TOOL_03"

    def test_parse_events_normalized_parameters(self, db):
        """JSON with ProcessSteps structure should normalize parameter names."""
        content = json.dumps([{
            "ToolID": "ETCH_01",
            "ChamberID": "CH_A",
            "RecipeID": "RCP_01",
            "Timestamp": "2026-01-01T10:00:00Z",
            "ProcessSteps": [
                {"StepName": "MainEtch", "Timestamp": "2026-01-01T10:00:00Z",
                 "Parameters": {"TEMP_C": "120", "PRESSURE": "0.5"}}
            ]
        }])
        result = parse_file(content, "test_norm.json", db)
        params = db.query(Event).filter(Event.run_id == result["run_id"]).all()
        param_names = {e.parameter for e in params if e.parameter}
        assert "temperature" in param_names
        assert "pressure" in param_names

    def test_parse_csv_content(self, db):
        csv_content = "timestamp,tool_id,chamber_id,event_type,parameter,value,unit\n2026-01-01T10:00:00Z,ETCH_01,CH_A,PARAMETER_READING,temperature,120,C\n2026-01-01T10:00:05Z,ETCH_01,CH_A,PARAMETER_READING,pressure,0.5,Torr\n"
        result = parse_file(csv_content, "test.csv", db)
        assert result["status"] == "completed"
        assert result["total_events"] >= 2

    def test_parse_kv_content(self, db):
        kv_content = "timestamp=2026-01-01T10:00:00Z tool_id=ETCH_01 chamber_id=CH_A event_type=PARAMETER_READING parameter=temperature value=120 unit=C\ntimestamp=2026-01-01T10:00:05Z tool_id=ETCH_01 chamber_id=CH_A event_type=PARAMETER_READING parameter=pressure value=0.5 unit=Torr\n"
        result = parse_file(kv_content, "test.kv", db)
        assert result["status"] == "completed"
        assert result["total_events"] >= 1

    def test_parse_empty_content(self, db):
        result = parse_file("", "empty.json", db)
        assert result["status"] == "completed"
        assert result["total_events"] == 0

    def test_default_sentinel_not_fab01(self, db):
        """Events without fab_id should get _DEFAULT, not FAB_01."""
        content = json.dumps([{
            "timestamp": "2026-01-01T10:00:00Z",
            "ToolID": "ETCH_01",
            "event_type": "PARAMETER_READING",
            "parameter": "temperature",
            "value": "120",
        }])
        result = parse_file(content, "test.json", db)
        events = db.query(Event).filter(Event.run_id == result["run_id"]).all()
        for e in events:
            assert e.fab_id != "FAB_01", f"fab_id should not be hardcoded FAB_01, got: {e.fab_id}"

    def test_alarm_count_tracked(self, db):
        """CSV with ALARM event_type should track alarm count."""
        content = "timestamp,tool_id,chamber_id,event_type,parameter,value,alarm_code,severity,message\n2026-01-01T10:00:00Z,ETCH_01,CH_A,ALARM,,vacuum failure,VACUUM_FAILURE,critical,Vacuum pump failure\n"
        result = parse_file(content, "alarm.csv", db)
        events = db.query(Event).filter(Event.run_id == result["run_id"]).all()
        alarm_events = [e for e in events if e.severity in ("alarm", "critical")]
        assert len(alarm_events) >= 1 or result["alarm_count"] >= 1


class TestGoldenRunComparison:
    """Server-side golden run + drift detection."""

    def _create_run_with_events(self, db, run_id: str, params: dict[str, list[float]],
                                recipe_step: str = "MainEtch"):
        run = Run(run_id=run_id, filename="test.json", source_format="json", status="completed")
        db.add(run)
        db.flush()
        idx = 0
        for param, values in params.items():
            for v in values:
                db.add(Event(
                    run_id=run_id,
                    timestamp=f"2026-01-01T10:{idx:02d}:00Z",
                    tool_id="ETCH_01",
                    chamber_id="CH_A",
                    event_type="PARAMETER_READING",
                    parameter=param,
                    value=str(v),
                    recipe_step=recipe_step,
                ))
                idx += 1
        db.commit()

    def test_mark_golden(self, db):
        self._create_run_with_events(db, "RUN_GOLD", {"temperature": [100, 110]})
        assert mark_golden(db, "RUN_GOLD")
        run = db.query(Run).filter(Run.run_id == "RUN_GOLD").first()
        assert run.is_golden is True

    def test_mark_golden_nonexistent(self, db):
        assert not mark_golden(db, "RUN_NONEXIST")

    def test_compare_identical_runs(self, db):
        self._create_run_with_events(db, "RUN_A", {"temperature": [100, 110]})
        self._create_run_with_events(db, "RUN_B", {"temperature": [100, 110]})
        result = compare_runs(db, "RUN_A", "RUN_B")
        assert result["drift_count"] == 0
        for c in result["comparisons"]:
            assert c["pct_deviation"] is not None
            assert abs(c["pct_deviation"]) < 1.0

    def test_compare_detects_drift(self, db):
        self._create_run_with_events(db, "RUN_BASE", {"temperature": [100, 100]})
        self._create_run_with_events(db, "RUN_DRIFT", {"temperature": [130, 130]})
        result = compare_runs(db, "RUN_BASE", "RUN_DRIFT")
        assert result["drift_count"] > 0
        temp_comp = [c for c in result["comparisons"] if c["parameter"] == "temperature"][0]
        assert temp_comp["severity"] in ("warning", "alarm")

    def test_compare_includes_stddev(self, db):
        self._create_run_with_events(db, "RUN_S1", {"temperature": [100, 120, 110]})
        self._create_run_with_events(db, "RUN_S2", {"temperature": [200, 220, 210]})
        result = compare_runs(db, "RUN_S1", "RUN_S2")
        for c in result["comparisons"]:
            assert "stddev_baseline" in c
            assert "stddev_current" in c

    def test_compare_no_duplicate_alerts(self, db):
        """Repeated comparisons should not create duplicate alerts."""
        self._create_run_with_events(db, "RUN_G", {"temperature": [100]})
        self._create_run_with_events(db, "RUN_C", {"temperature": [200]})
        compare_runs(db, "RUN_G", "RUN_C")
        compare_runs(db, "RUN_G", "RUN_C")
        alerts = db.query(DriftAlert).filter(DriftAlert.run_id == "RUN_C").all()
        param_counts = {}
        for a in alerts:
            param_counts[a.parameter] = param_counts.get(a.parameter, 0) + 1
        for count in param_counts.values():
            assert count == 1

    def test_compare_zero_baseline(self, db):
        self._create_run_with_events(db, "RUN_Z0", {"pressure": [0.0]})
        self._create_run_with_events(db, "RUN_Z1", {"pressure": [5.0]})
        result = compare_runs(db, "RUN_Z0", "RUN_Z1")
        comp = [c for c in result["comparisons"] if c["parameter"] == "pressure"][0]
        assert comp["pct_deviation"] is not None

    def test_stats_by_param_basic(self, db):
        from collections import namedtuple
        FakeEvent = namedtuple("FakeEvent", ["parameter", "value", "recipe_step"])
        events = [FakeEvent("temperature", "100", "step1"), FakeEvent("temperature", "200", "step1")]
        stats = _stats_by_param(events, group_by_step=False)
        assert stats["temperature"]["mean"] == 150.0
        assert stats["temperature"]["stddev"] > 0


class TestFormatDetection:
    def test_json_detected(self):
        content = json.dumps([{"tool_id": "ETCH_01", "value": 100}])
        fmt, conf, amb = detect_format_with_confidence(content)
        assert fmt == "json"
        assert conf > 0.9

    def test_ndjson_detected(self):
        content = '{"tool_id": "ETCH_01"}\n{"tool_id": "ETCH_02"}\n{"tool_id": "ETCH_03"}\n'
        fmt, conf, amb = detect_format_with_confidence(content)
        assert fmt == "json"
        assert conf >= 0.85

    def test_csv_detected(self):
        content = "timestamp,tool_id,value\n2026-01-01,ETCH_01,120\n"
        fmt, conf, amb = detect_format_with_confidence(content)
        assert fmt == "csv"

    def test_xml_detected(self):
        content = '<?xml version="1.0"?><root><event tool_id="ETCH"/></root>'
        fmt, conf, amb = detect_format_with_confidence(content)
        assert fmt == "xml"
        assert conf > 0.9

    def test_kv_detected(self):
        content = "tool_id=ETCH_01 temp=120\nchamber=CH_A press=0.5\n"
        fmt, conf, amb = detect_format_with_confidence(content)
        assert fmt == "kv"

    def test_syslog_detected(self):
        content = "Jan  5 10:00:00 fabhost tool[1234]: temperature=120\n"
        fmt, conf, amb = detect_format_with_confidence(content)
        assert fmt == "syslog"

    def test_empty_content(self):
        fmt, conf, amb = detect_format_with_confidence("")
        assert fmt == "text"

    def test_binary_detected(self):
        raw_bytes = bytes(range(256)) * 10
        fmt, conf, amb = detect_format_with_confidence("", raw_bytes)
        assert fmt == "binary"


class TestPhysicalLimits:
    def test_temperature_in_range(self):
        errs = validate_physical_plausibility({"parameter": "temperature", "value": "120"})
        assert len(errs) == 0

    def test_temperature_out_of_range(self):
        errs = validate_physical_plausibility({"parameter": "temperature", "value": "50000"})
        assert len(errs) > 0

    def test_pedestal_power_now_covered(self):
        assert "pedestal_power" in PHYSICAL_LIMITS
        errs = validate_physical_plausibility({"parameter": "pedestal_power", "value": "500"})
        assert len(errs) == 0

    def test_pedestal_power_out_of_range(self):
        errs = validate_physical_plausibility({"parameter": "pedestal_power", "value": "99999"})
        assert len(errs) > 0

    def test_power_covered(self):
        assert "power" in PHYSICAL_LIMITS

    def test_wavelength_covered(self):
        assert "wavelength" in PHYSICAL_LIMITS

    def test_vibration_covered(self):
        assert "vibration" in PHYSICAL_LIMITS


class TestNormalizationDefaults:
    def test_empty_event_gets_default_sentinel(self):
        events = normalize_events([{}])
        e = events[0]
        assert e["fab_id"] == "_DEFAULT"
        assert e["tool_id"] == "_DEFAULT"
        assert e["chamber_id"] == "_DEFAULT"
        assert e["tool_type"] == "_DEFAULT"

    def test_provided_values_preserved(self):
        events = normalize_events([{"fab_id": "FAB_99", "tool_id": "ETCH_01", "chamber_id": "CH_B"}])
        e = events[0]
        assert e["fab_id"] == "FAB_99"
        assert e["tool_id"] == "ETCH_01"
        assert e["chamber_id"] == "CH_B"


class TestValidation:
    def test_default_tool_id_flagged(self):
        result = validate_events([{"tool_id": "_DEFAULT", "event_type": "PARAMETER_READING", "value": "120"}])
        assert result[0]["parse_status"] == "partial"
        assert "tool_id_missing" in result[0]["parse_error"]


class TestEventTypeMapping:
    def test_drift_warning_mapped(self):
        from app.services.parser_service import _event_type_to_frontend
        assert _event_type_to_frontend("DRIFT_WARNING") == "warning"

    def test_process_abort_mapped(self):
        from app.services.parser_service import _event_type_to_frontend
        assert _event_type_to_frontend("PROCESS_ABORT") == "alarm"

    def test_unknown_defaults_info(self):
        from app.services.parser_service import _event_type_to_frontend
        assert _event_type_to_frontend("SOME_UNKNOWN_TYPE") == "info"
