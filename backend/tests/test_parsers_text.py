"""Tests for plain-text parser."""
RUN_ID = "run_test_001"


class TestTextParser:
    def _p(self, content):
        from app.parsers.text_parser import parse_text
        return parse_text(content, RUN_ID)

    def test_colon_pattern(self):
        events = self._p("Temperature: 120 C")
        assert len(events) == 1 and events[0]["parameter"] == "temperature"
        assert events[0]["value"] == "120" and events[0]["unit"] == "C"
        assert events[0]["parse_status"] == "ok"

    def test_set_to_pattern(self):
        events = self._p("Pressure set to 0.8 Torr")
        assert len(events) == 1 and events[0]["parameter"] == "pressure"
        assert events[0]["value"] == "0.8" and events[0]["unit"] == "Torr"
        assert events[0]["parse_status"] == "ok"

    def test_alarm_line(self):
        events = self._p("ALARM: vacuum failure detected")
        assert events[0]["event_type"] == "ALARM" and events[0]["severity"] == "alarm"
        assert events[0]["parse_status"] == "partial"

    def test_warning_line(self):
        events = self._p("WARNING: temperature is unstable")
        assert events[0]["event_type"] == "WARNING" and events[0]["severity"] == "warning"

    def test_drift_line(self):
        events = self._p("Temperature drift detected in chamber")
        assert events[0]["event_type"] == "DRIFT_WARNING"

    def test_process_abort_line(self):
        events = self._p("Process aborted due to vacuum failure")
        assert events[0]["event_type"] == "PROCESS_ABORT" and events[0]["severity"] == "alarm"

    def test_empty_lines_skipped(self):
        events = self._p("Temperature: 120 C\n\n\nPressure: 0.8 Torr")
        assert len(events) == 2

    def test_unknown_line_partial(self):
        events = self._p("Completely unstructured line of text here")
        assert len(events) == 1 and events[0]["parse_status"] == "partial"

    def test_empty_returns_empty(self):
        assert self._p("") == []

    def test_line_numbers_correct(self):
        events = self._p("Temperature: 120 C\nPressure: 0.8 Torr")
        assert events[0]["raw_line_number"] == 1 and events[1]["raw_line_number"] == 2

    def test_mixed_lines(self):
        events = self._p("Temperature: 120 C\nALARM: vacuum failure\nPressure set to 0.8 Torr")
        assert len(events) == 3
        assert events[0]["parse_status"] == "ok"
        assert events[1]["parse_status"] == "partial"
        assert events[2]["parse_status"] == "ok"

    def test_fault_keyword_alarm(self):
        events = self._p("fault in module A")
        assert events[0]["event_type"] == "ALARM"

    def test_error_keyword_alarm(self):
        events = self._p("error reading sensor value")
        assert events[0]["event_type"] == "ALARM"

    def test_caution_keyword_warning(self):
        events = self._p("caution: high temperature zone")
        assert events[0]["severity"] == "warning"

    def test_whitespace_only_skipped(self):
        assert self._p("   \n   \n  ") == []
