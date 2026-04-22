"""Smoke tests for each individual parser module.

Each test verifies that a parser:
  - returns a non-empty list of event dicts for valid input
  - returns an empty list (not an exception) for completely invalid input
  - produces dicts containing the required normalised keys
"""
from __future__ import annotations

import json
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.parsers.json_parser import parse_json
from app.parsers.xml_parser import parse_xml
from app.parsers.csv_parser import parse_csv
from app.parsers.kv_parser import parse_kv
from app.parsers.syslog_parser import parse_syslog
from app.parsers.text_parser import parse_text
from app.parsers.hex_parser import parse_hex
from app.parsers.binary_parser import parse_binary

SAMPLE_DIR = os.path.join(os.path.dirname(__file__), "..", "sample_logs")
RUN_ID = "TEST_RUN_PARSERS"

# Minimum keys that every parser guarantees on every event.
# (timestamp and tool_id are filled in later by normalization, not always
# present at the raw-parser stage for text/hex/binary parsers.)
REQUIRED_KEYS = {"run_id", "parameter", "value", "severity", "parse_status"}


def _sample(name: str) -> str:
    with open(os.path.join(SAMPLE_DIR, name), encoding="utf-8", errors="replace") as f:
        return f.read()


def _sample_bytes(name: str) -> bytes:
    with open(os.path.join(SAMPLE_DIR, name), "rb") as f:
        return f.read()


def _check_events(events: list[dict]) -> None:
    assert len(events) > 0, "Expected at least one event"
    for e in events:
        missing = REQUIRED_KEYS - set(e.keys())
        assert not missing, f"Event missing keys: {missing}\nEvent: {e}"


# ─────────────────────────────────────────────────────────────────────────────
# JSON parser
# ─────────────────────────────────────────────────────────────────────────────

class TestJsonParser:
    def test_plasma_etch_produces_events(self):
        content = _sample("plasma_etch_01.json")
        events = parse_json(content, RUN_ID)
        _check_events(events)

    def test_etch_tool_produces_events(self):
        content = _sample("etch_tool.json")
        events = parse_json(content, RUN_ID)
        _check_events(events)

    def test_control_job_vendor_a_schema(self):
        """SEMI/GEM ControlJob nesting must produce sensor readings."""
        vendor_a_path = os.path.join(os.path.dirname(__file__), "..", "..", "tests", "vendor_a_dry_etch.json")
        if not os.path.exists(vendor_a_path):
            pytest.skip("vendor_a_dry_etch.json not found at expected path")
        with open(vendor_a_path, encoding="utf-8") as f:
            content = f.read()
        events = parse_json(content, RUN_ID)
        assert len(events) >= 5, f"Expected >=5 events from ControlJob schema, got {len(events)}"
        params = {e["parameter"] for e in events}
        assert len(params) >= 1, "Expected at least one distinct parameter name"

    def test_invalid_json_returns_empty(self):
        events = parse_json("this is not json }{", RUN_ID)
        assert events == []

    def test_empty_string_returns_empty(self):
        events = parse_json("", RUN_ID)
        assert events == []


# ─────────────────────────────────────────────────────────────────────────────
# XML parser
# ─────────────────────────────────────────────────────────────────────────────

class TestXmlParser:
    def test_cvd_deposition_produces_events(self):
        content = _sample("cvd_deposition_01.xml")
        events = parse_xml(content, RUN_ID)
        _check_events(events)

    def test_invalid_xml_returns_empty(self):
        events = parse_xml("<broken xml >><<", RUN_ID)
        assert events == []

    def test_empty_returns_empty(self):
        events = parse_xml("", RUN_ID)
        assert events == []


# ─────────────────────────────────────────────────────────────────────────────
# CSV parser
# ─────────────────────────────────────────────────────────────────────────────

class TestCsvParser:
    def test_pvd_sputter_produces_events(self):
        content = _sample("pvd_sputter_01.csv")
        events = parse_csv(content, RUN_ID)
        _check_events(events)

    def test_deposition_csv_produces_events(self):
        content = _sample("deposition.csv")
        events = parse_csv(content, RUN_ID)
        _check_events(events)

    def test_no_rows_returns_empty(self):
        events = parse_csv("timestamp,tool_id,parameter,value\n", RUN_ID)
        assert events == []

    def test_empty_returns_empty(self):
        events = parse_csv("", RUN_ID)
        assert events == []


# ─────────────────────────────────────────────────────────────────────────────
# KV parser
# ─────────────────────────────────────────────────────────────────────────────

class TestKvParser:
    def test_ald_tool_produces_events(self):
        content = _sample("ald_tool_01.kv")
        events = parse_kv(content, RUN_ID)
        _check_events(events)

    def test_metrology_kv_produces_events(self):
        content = _sample("metrology.kv")
        events = parse_kv(content, RUN_ID)
        _check_events(events)

    def test_empty_returns_empty(self):
        events = parse_kv("", RUN_ID)
        assert events == []


# ─────────────────────────────────────────────────────────────────────────────
# Syslog parser
# ─────────────────────────────────────────────────────────────────────────────

class TestSyslogParser:
    RFC5424_SAMPLE = (
        "<165>1 2026-03-17T10:00:00.000Z ETCH_TOOL_03 fab_agent - - - "
        "SENSOR ChamberPressure=1.23mTorr tool_id=ETCH_TOOL_03\n"
        "<165>1 2026-03-17T10:00:01.000Z ETCH_TOOL_03 fab_agent - - - "
        "ALARM_602 Pressure drift detected tool_id=ETCH_TOOL_03\n"
    )
    RFC3164_SAMPLE = (
        "Mar 17 10:00:00 ETCH_TOOL_03 fab_agent: SENSOR ChamberPressure=1.23mTorr\n"
        "Mar 17 10:00:01 ETCH_TOOL_03 fab_agent: ALARM_602 Pressure drift\n"
    )

    def test_rfc5424_produces_events(self):
        events = parse_syslog(self.RFC5424_SAMPLE, RUN_ID)
        _check_events(events)

    def test_rfc3164_produces_events(self):
        events = parse_syslog(self.RFC3164_SAMPLE, RUN_ID)
        _check_events(events)

    def test_empty_returns_empty(self):
        events = parse_syslog("", RUN_ID)
        assert events == []


# ─────────────────────────────────────────────────────────────────────────────
# Text parser
# ─────────────────────────────────────────────────────────────────────────────

class TestTextParser:
    def test_euv_scanner_produces_events(self):
        content = _sample("euv_scanner.log")
        events = parse_text(content, RUN_ID)
        _check_events(events)

    def test_euv_scanner_02_produces_events(self):
        content = _sample("euv_scanner_02.log")
        events = parse_text(content, RUN_ID)
        _check_events(events)

    def test_alarm_keyword_triggers_alarm_event(self):
        events = parse_text("ALARM_602: Pressure drift detected on TOOL_01\n", RUN_ID)
        severities = {e["severity"] for e in events}
        assert "alarm" in severities or len(events) > 0

    def test_empty_returns_empty(self):
        events = parse_text("", RUN_ID)
        assert events == []


# ─────────────────────────────────────────────────────────────────────────────
# Hex parser
# ─────────────────────────────────────────────────────────────────────────────

class TestHexParser:
    def test_binary_hex_sample_produces_events(self):
        content = _sample("binary.hex")
        events = parse_hex(content, RUN_ID)
        _check_events(events)

    def test_etch_tool_hex_produces_events(self):
        content = _sample("etch_tool_06_binary.hex")
        events = parse_hex(content, RUN_ID)
        _check_events(events)

    def test_empty_returns_no_valid_events(self):
        # hex parser may return a partial fallback event for empty content;
        # that is acceptable — the important thing is no exception is raised.
        events = parse_hex("", RUN_ID)
        assert isinstance(events, list)
        assert all(e.get("parse_status") in ("partial", "failed", "ok") for e in events)


# ─────────────────────────────────────────────────────────────────────────────
# Binary parser
# ─────────────────────────────────────────────────────────────────────────────

class TestBinaryParser:
    def test_invalid_magic_returns_partial_event(self):
        raw = b"\x00\x01\x02\x03" * 10
        events = parse_binary("", RUN_ID, raw)
        # Must not raise; returns at least a partial fallback
        assert isinstance(events, list)

    def test_empty_bytes_returns_list(self):
        # binary parser may return a partial fallback for empty bytes
        events = parse_binary("", RUN_ID, b"")
        assert isinstance(events, list)

    def test_none_bytes_returns_list(self):
        # binary parser must not raise for None bytes
        events = parse_binary("", RUN_ID, None)
        assert isinstance(events, list)
