"""Tests for JSON and CSV parsers."""
import json as jsonlib
RUN_ID = "run_test_001"


class TestJsonParser:
    def _p(self, content):
        from app.parsers.json_parser import parse_json
        return parse_json(content, RUN_ID)

    def test_flat_object(self):
        events = self._p(jsonlib.dumps({"ToolID": "ETCH_01", "temperature": "120", "pressure": "0.5"}))
        params = {e["parameter"] for e in events}
        assert "temperature" in params and "pressure" in params

    def test_array_of_objects(self):
        events = self._p(jsonlib.dumps([{"ToolID": "ETCH_01", "temperature": "120"}, {"ToolID": "ETCH_02", "pressure": "0.5"}]))
        assert len(events) >= 2

    def test_process_steps(self):
        data = {"EquipmentID": "ETCH_01", "RecipeID": "RCP_A", "ProcessSteps": [
            {"StepID": "1", "StepName": "Etch", "Timestamp": "2026-01-01T10:00:00",
             "Parameters": {"temperature": "120", "pressure": "0.5"}}]}
        events = self._p(jsonlib.dumps(data))
        assert len(events) == 2
        assert all(e["tool_id"] == "ETCH_01" and e["recipe_step"] == "Etch" for e in events)

    def test_process_steps_dict_value(self):
        data = {"EquipmentID": "ETCH_01", "ProcessSteps": [
            {"StepID": "1", "Parameters": {"temperature": {"value": 120, "unit": "C"}}}]}
        events = self._p(jsonlib.dumps(data))
        assert events[0]["unit"] == "C" and events[0]["value"] == "120"

    def test_missing_tool_id_defaults_unknown(self):
        events = self._p(jsonlib.dumps({"temperature": "120"}))
        assert all(e["tool_id"] == "UNKNOWN" for e in events)

    def test_invalid_json_returns_empty(self):
        assert self._p("{ not valid json }") == []

    def test_empty_object_returns_empty(self):
        assert self._p("{}") == []

    def test_empty_array_returns_empty(self):
        assert self._p("[]") == []

    def test_run_id_from_content(self):
        events = self._p(jsonlib.dumps({"RunID": "content_run_999", "temperature": "50"}))
        assert all(e["run_id"] == "content_run_999" for e in events)

    def test_fab_id_default(self):
        events = self._p(jsonlib.dumps({"ToolID": "ETCH_01", "temp": "100"}))
        assert events[0]["fab_id"] == "FAB_01"

    def test_custom_fab_id(self):
        events = self._p(jsonlib.dumps({"ToolID": "ETCH_01", "FabID": "FAB_99", "temp": "100"}))
        assert events[0]["fab_id"] == "FAB_99"

    def test_tool_type_inferred(self):
        events = self._p(jsonlib.dumps({"ToolID": "ETCH_01", "temp": "100"}))
        assert events[0]["tool_type"] == "etch"

    def test_skip_keys_not_params(self):
        events = self._p(jsonlib.dumps({"ToolID": "ETCH_01", "RecipeID": "R1", "LotID": "LOT_001", "temperature": "100"}))
        params = {e["parameter"] for e in events}
        assert "tool_id" not in params and "recipe_id" not in params and "lot_id" not in params

    def test_null_value_no_crash(self):
        events = self._p(jsonlib.dumps({"ToolID": "ETCH_01", "temperature": None}))
        assert isinstance(events, list)

    def test_steps_alias(self):
        data = {"EquipmentID": "ETCH_01", "steps": [
            {"step_id": "1", "timestamp": "2026-01-01T10:00:00",
             "params": {"temperature": "120"}}]}
        events = self._p(jsonlib.dumps(data))
        assert len(events) == 1

    def test_equipment_id_alias(self):
        events = self._p(jsonlib.dumps({"equipment_id": "CVD_01", "temperature": "100"}))
        assert events[0]["tool_id"] == "CVD_01"


class TestCsvParser:
    def _p(self, content):
        from app.parsers.csv_parser import parse_csv
        return parse_csv(content, RUN_ID)

    def test_basic(self):
        events = self._p("timestamp,equipment_id,parameter,value,unit\n2026-01-01T10:00:00,ETCH_01,temperature,120,C")
        assert len(events) == 1 and events[0]["tool_id"] == "ETCH_01"
        assert events[0]["value"] == "120" and events[0]["unit"] == "C"

    def test_header_only_empty(self):
        assert self._p("timestamp,equipment_id,parameter,value") == []

    def test_missing_tool_id_unknown(self):
        events = self._p("timestamp,parameter,value\n2026-01-01,temperature,120")
        assert events[0]["tool_id"] == "UNKNOWN"

    def test_multiple_rows(self):
        content = "timestamp,equipment_id,parameter,value\n2026-01-01,ETCH_01,temperature,120\n2026-01-02,ETCH_01,pressure,0.5\n2026-01-03,ETCH_01,rf_power,500"
        assert len(self._p(content)) == 3

    def test_duplicates_both_parsed(self):
        content = "timestamp,equipment_id,parameter,value\n2026-01-01,ETCH_01,temperature,120\n2026-01-01,ETCH_01,temperature,120"
        assert len(self._p(content)) == 2

    def test_alarm_event_type(self):
        events = self._p("timestamp,equipment_id,event_type,parameter,value,severity\n2026-01-01,ETCH_01,alarm,temperature,999,alarm")
        assert events[0]["event_type"] == "ALARM" and events[0]["severity"] == "alarm"

    def test_line_numbers_start_at_2(self):
        events = self._p("timestamp,equipment_id,parameter,value\n2026-01-01,ETCH_01,temperature,120")
        assert events[0]["raw_line_number"] == 2

    def test_embedded_unit_in_value(self):
        events = self._p("timestamp,equipment_id,parameter,value\n2026-01-01,ETCH_01,temperature,120C")
        assert events[0]["value"] == "120" and events[0]["unit"] == "C"

    def test_tool_id_column_alias(self):
        events = self._p("timestamp,tool_id,parameter,value\n2026-01-01,ETCH_01,temperature,120")
        assert events[0]["tool_id"] == "ETCH_01"

    def test_empty_string_empty(self):
        assert self._p("") == []

    def test_recipe_and_step(self):
        events = self._p("timestamp,equipment_id,recipe_name,step_id,parameter,value\n2026-01-01,ETCH_01,RCP_A,step1,temperature,120")
        assert events[0]["recipe_name"] == "RCP_A" and events[0]["recipe_step"] == "step1"

    def test_missing_value_empty_string(self):
        events = self._p("timestamp,equipment_id,parameter,value\n2026-01-01,ETCH_01,temperature,")
        assert len(events) == 1 and events[0]["value"] == ""

    def test_lot_id_and_wafer_id(self):
        events = self._p("timestamp,equipment_id,lot_id,wafer_id,parameter,value\n2026-01-01,ETCH_01,LOT_01,W01,temperature,120")
        assert events[0]["lot_id"] == "LOT_01" and events[0]["wafer_id"] == "W01"
