"""Tests for format detection."""
import pytest
from app.services.format_detector import detect_format, detect_format_with_confidence, looks_binary_bytes

class TestLooksBinaryBytes:
    def test_empty_returns_false(self):
        assert looks_binary_bytes(b"") is False
    def test_plain_text_false(self):
        assert looks_binary_bytes(b"timestamp=2026-01-01 temp=23.5\n") is False
    def test_null_bytes_true(self):
        assert looks_binary_bytes(b"\x00" * 100 + b"hello") is True
    def test_high_non_printable_true(self):
        assert looks_binary_bytes(bytes([0x01]*40 + [0x61]*60)) is True
    def test_normal_ascii_false(self):
        assert looks_binary_bytes(b"Hello World 12345\n" * 50) is False

class TestDetectFormat:
    def test_empty(self):
        assert detect_format("") == "text"
    def test_whitespace(self):
        assert detect_format("   \n\t  ") == "text"
    def test_json_object(self):
        assert detect_format('{"ToolID":"ETCH_01","temp":120}') == "json"
    def test_json_array(self):
        assert detect_format('[{"a":1},{"a":2}]') == "json"
    def test_xml_declaration(self):
        assert detect_format('<?xml version="1.0"?><Root></Root>') == "xml"
    def test_xml_no_declaration(self):
        assert detect_format('<LogData><Step id="1"/></LogData>') == "xml"
    def test_xml_self_closing(self):
        assert detect_format('<Event name="start"/>') == "xml"
    def test_hex(self):
        assert detect_format("4A 6F 68 6E 20 44 6F") == "hex"
    def test_csv(self):
        assert detect_format("timestamp,tool_id,parameter,value\n2026-01-01,ETCH_01,temp,120") == "csv"
    def test_csv_needs_two_lines(self):
        assert detect_format("timestamp,tool_id,parameter") != "csv"
    def test_syslog_rfc5424(self):
        assert detect_format("<34>1 2026-03-05T11:00:08Z ETCH_01 app proc msgid - msg") == "syslog"
    def test_syslog_rfc3164(self):
        assert detect_format("Mar  5 11:00:08 ETCH_01 app: message") == "syslog"
    def test_kv(self):
        lines = "\n".join(["timestamp=2026-01-01 tool_id=ETCH_01 temp=120"]*3)
        assert detect_format(lines) == "kv"
    def test_plain_text(self):
        assert detect_format("Process started\nTemperature rising\nProcess complete") == "text"

class TestDetectFormatWithConfidence:
    def test_json_high_confidence(self):
        fmt, conf, _amb = detect_format_with_confidence('{"key":"val"}')
        assert fmt == "json" and conf >= 0.9
    def test_xml_high_confidence(self):
        fmt, conf, _amb = detect_format_with_confidence('<Root><Item/></Root>')
        assert fmt == "xml" and conf >= 0.8
    def test_binary_via_raw_bytes(self):
        fmt, conf, _amb = detect_format_with_confidence("", raw_bytes=b"\x00"*200 + b"data")
        assert fmt == "binary" and conf >= 0.9
    def test_empty_low_confidence(self):
        fmt, conf, _amb = detect_format_with_confidence("")
        assert fmt == "text" and conf <= 0.6
