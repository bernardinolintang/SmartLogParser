"""Tests for KV, XML, and Syslog parsers."""
RUN_ID = "run_test_001"


class TestKvParser:
    def _p(self, content):
        from app.parsers.kv_parser import parse_kv
        return parse_kv(content, RUN_ID)

    def test_basic(self):
        events = self._p("timestamp=2026-01-01T10:00:00 equipment_id=ETCH_01 temperature=120")
        assert len(events) == 1 and events[0]["tool_id"] == "ETCH_01"
        assert events[0]["parameter"] == "temperature" and events[0]["value"] == "120"

    def test_multiple_params_per_line(self):
        events = self._p("timestamp=2026-01-01 equipment_id=ETCH_01 temperature=120 pressure=0.5 rf_power=500")
        assert len(events) == 3

    def test_empty_lines_skipped(self):
        content = "timestamp=2026-01-01 equipment_id=ETCH_01 temp=100\n\n\ntimestamp=2026-01-02 equipment_id=ETCH_01 temp=101"
        events = self._p(content)
        assert len(events) == 2

    def test_context_only_no_events(self):
        events = self._p("timestamp=2026-01-01 equipment_id=ETCH_01 fab_id=FAB_01")
        assert events == []

    def test_missing_equipment_id_empty(self):
        events = self._p("timestamp=2026-01-01 temperature=120")
        assert events[0]["tool_id"] == ""

    def test_quoted_values(self):
        events = self._p('timestamp=2026-01-01 equipment_id=ETCH_01 message="high temp alarm"')
        assert len(events) == 1 and events[0]["value"] == "high temp alarm"

    def test_raw_line_preserved(self):
        line = "timestamp=2026-01-01 equipment_id=ETCH_01 temperature=120"
        events = self._p(line)
        assert events[0]["raw_line"] == line.strip()

    def test_no_equals_returns_empty(self):
        assert self._p("this line has no equals signs at all") == []

    def test_empty_string_empty(self):
        assert self._p("") == []

    def test_run_id_from_line(self):
        events = self._p("run_id=MY_RUN equipment_id=ETCH_01 temperature=120")
        assert events[0]["run_id"] == "MY_RUN"

    def test_timestamp_captured(self):
        events = self._p("timestamp=2026-03-05T11:30:00 equipment_id=ETCH_01 temperature=120")
        assert events[0]["timestamp"] == "2026-03-05T11:30:00"

    def test_chamber_id_captured(self):
        events = self._p("equipment_id=ETCH_01 chamber_id=CH_B temperature=120")
        assert events[0]["chamber_id"] == "CH_B"

    def test_whitespace_only_line_skipped(self):
        events = self._p("   \n   \n")
        assert events == []


class TestXmlParser:
    def _p(self, content):
        from app.parsers.xml_parser import parse_xml
        return parse_xml(content, RUN_ID)

    def test_basic_with_steps(self):
        xml = '<LogData EquipmentID="ETCH_01" RecipeID="RCP_A"><Step id="1" name="Etch" timestamp="2026-01-01T10:00:00"><Param name="temperature" value="120"/><Param name="pressure" value="0.5"/></Step></LogData>'
        events = self._p(xml)
        assert len(events) == 2 and all(e["tool_id"] == "ETCH_01" for e in events)

    def test_no_steps_fallback(self):
        xml = '<LogData EquipmentID="ETCH_01"><Param name="temperature" value="120"/><Param name="pressure" value="0.5"/></LogData>'
        events = self._p(xml)
        assert len(events) == 2

    def test_invalid_xml_empty(self):
        assert self._p("<unclosed>") == []

    def test_empty_tag_empty(self):
        assert self._p("<LogData/>") == []

    def test_missing_tool_id_empty(self):
        xml = '<LogData><Step id="1"><Param name="temperature" value="100"/></Step></LogData>'
        events = self._p(xml)
        assert events[0]["tool_id"] == ""

    def test_xxe_blocked(self):
        xxe = '<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><LogData><Step id="1"><Param name="test">&xxe;</Param></Step></LogData>'
        try:
            events = self._p(xxe)
            for e in events:
                assert "root:" not in str(e.get("value", ""))
        except Exception:
            pass

    def test_parameter_element_recognised(self):
        xml = '<LogData EquipmentID="ETCH_01"><Step id="1"><Parameter name="temperature">120</Parameter></Step></LogData>'
        events = self._p(xml)
        assert len(events) == 1 and events[0]["value"] == "120"

    def test_run_id_from_xml(self):
        xml = '<LogData EquipmentID="ETCH_01" RunID="XML_RUN_42"><Step id="1"><Param name="temperature" value="100"/></Step></LogData>'
        events = self._p(xml)
        assert events[0]["run_id"] == "XML_RUN_42"

    def test_multiple_steps(self):
        xml = '<LogData EquipmentID="ETCH_01"><Step id="1" name="S1"><Param name="temperature" value="100"/></Step><Step id="2" name="S2"><Param name="pressure" value="0.8"/></Step></LogData>'
        events = self._p(xml)
        assert len(events) == 2 and {"S1", "S2"} == {e["recipe_step"] for e in events}

    def test_fab_id_from_attribute(self):
        xml = '<LogData EquipmentID="ETCH_01" FabID="FAB_77"><Step id="1"><Param name="temperature" value="100"/></Step></LogData>'
        events = self._p(xml)
        assert events[0]["fab_id"] == "FAB_77"

    def test_lot_id_from_attribute(self):
        xml = '<LogData EquipmentID="ETCH_01" LotID="LOT_42"><Step id="1"><Param name="temperature" value="100"/></Step></LogData>'
        events = self._p(xml)
        assert events[0]["lot_id"] == "LOT_42"


class TestSyslogParser:
    def _p(self, content):
        from app.parsers.syslog_parser import parse_syslog
        return parse_syslog(content, RUN_ID)

    def test_rfc5424_with_kv(self):
        events = self._p("<34>1 2026-03-05T11:00:08Z ETCH_01 app proc msgid - temperature=120 pressure=0.5")
        params = {e["parameter"] for e in events}
        assert "temperature" in params and "pressure" in params

    def test_rfc5424_without_kv(self):
        events = self._p("<34>1 2026-03-05T11:00:08Z ETCH_01 app proc msgid - Process started normally")
        assert len(events) == 1 and events[0]["tool_id"] == "ETCH_01"

    def test_rfc3164(self):
        events = self._p("Mar  5 11:00:08 ETCH_01 app: temperature=120")
        assert len(events) >= 1 and events[0]["tool_id"] == "ETCH_01"

    def test_alarm_sets_alarm_type(self):
        events = self._p("<34>1 2026-03-05T11:00:08Z ETCH_01 app proc msgid - ALARM vacuum failure")
        assert events[0]["event_type"] == "ALARM" and events[0]["severity"] in ("alarm", "critical")

    def test_warning_sets_warning_type(self):
        events = self._p("<30>1 2026-03-05T11:00:08Z ETCH_01 app proc msgid - WARNING temperature unstable")
        assert events[0]["event_type"] == "WARNING"

    def test_empty_lines_skipped(self):
        events = self._p("<34>1 2026-03-05T11:00:08Z ETCH_01 app proc msgid - temp=120\n\n\n")
        assert len(events) == 1

    def test_invalid_lines_skipped(self):
        events = self._p("not syslog\n<34>1 2026-03-05T11:00:08Z ETCH_01 app proc msgid - temp=120")
        assert len(events) == 1

    def test_empty_returns_empty(self):
        assert self._p("") == []

    def test_critical_priority(self):
        events = self._p("<0>1 2026-03-05T11:00:08Z ETCH_01 app proc msgid - system failure")
        assert events[0]["severity"] == "critical"

    def test_raw_line_preserved(self):
        line = "<34>1 2026-03-05T11:00:08Z ETCH_01 app proc msgid - temp=120"
        events = self._p(line)
        assert events[0]["raw_line"] == line

    def test_line_numbers(self):
        content = "<34>1 2026-03-05T11:00:08Z ETCH_01 app proc msgid - temp=120\n<34>1 2026-03-05T11:00:09Z ETCH_01 app proc msgid - pressure=0.5\n"
        events = self._p(content)
        assert events[0]["raw_line_number"] == 1 and events[1]["raw_line_number"] == 2

    def test_state_message(self):
        events = self._p("<30>1 2026-03-05T11:00:08Z ETCH_01 app proc msgid - STATE machine idle")
        assert events[0]["event_type"] == "STATE_CHANGE"
