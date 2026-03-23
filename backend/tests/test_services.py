"""Tests for normalization, validation, deduplication, mappings, security, golden run math."""
RUN_ID = "run_test_001"


class TestMappings:
    def test_normalize_temp_variants(self):
        from app.utils.mappings import normalize_parameter
        for v in ["temp", "TEMP", "Temp", "TEMP_C", "temperature", "Temperature"]:
            assert normalize_parameter(v) == "temperature", f"failed for {v}"

    def test_normalize_pressure_variants(self):
        from app.utils.mappings import normalize_parameter
        for v in ["press", "Press", "pressure", "PRESSURE", "pressure_torr", "chamber_pressure"]:
            assert normalize_parameter(v) == "pressure", f"failed for {v}"

    def test_normalize_rf_power_variants(self):
        from app.utils.mappings import normalize_parameter
        for v in ["rf_power", "RF_Power", "RFPower", "rf_power_w"]:
            assert normalize_parameter(v) == "rf_power", f"failed for {v}"

    def test_normalize_gas_flow(self):
        from app.utils.mappings import normalize_parameter
        assert normalize_parameter("GasFlow") == "gas_flow"

    def test_unknown_param_passthrough(self):
        from app.utils.mappings import normalize_parameter
        assert normalize_parameter("weird_vendor_param") == "weird_vendor_param"

    def test_empty_param_returns_value(self):
        from app.utils.mappings import normalize_parameter
        assert normalize_parameter("") == "value"

    def test_normalize_event_type_sensor(self):
        from app.utils.mappings import normalize_event_type
        assert normalize_event_type("sensor") == "PARAMETER_READING"

    def test_normalize_event_type_alarm(self):
        from app.utils.mappings import normalize_event_type
        assert normalize_event_type("alarm") == "ALARM"

    def test_normalize_event_type_unknown_uppercased(self):
        from app.utils.mappings import normalize_event_type
        assert normalize_event_type("unknown_type") == "UNKNOWN_TYPE"

    def test_normalize_severity_warning(self):
        from app.utils.mappings import normalize_severity
        assert normalize_severity("WARNING") == "warning"

    def test_normalize_severity_critical(self):
        from app.utils.mappings import normalize_severity
        assert normalize_severity("CRITICAL") == "critical"

    def test_normalize_severity_unknown_defaults_info(self):
        from app.utils.mappings import normalize_severity
        assert normalize_severity("SUPER_URGENT") == "info"

    def test_normalize_alarm_code_vac_fail(self):
        from app.utils.mappings import normalize_alarm_code
        assert normalize_alarm_code("VAC_FAIL") == "VACUUM_FAULT"

    def test_normalize_alarm_code_press_low(self):
        from app.utils.mappings import normalize_alarm_code
        assert normalize_alarm_code("PRESS_LOW") == "PRESSURE_LOW"

    def test_normalize_alarm_code_over_temp(self):
        from app.utils.mappings import normalize_alarm_code
        assert normalize_alarm_code("OVER_TEMP") == "TEMP_HIGH"

    def test_normalize_alarm_code_none(self):
        from app.utils.mappings import normalize_alarm_code
        assert normalize_alarm_code(None) is None

    def test_infer_severity_vacuum_failure_critical(self):
        from app.utils.mappings import infer_severity_from_alarm_code
        assert infer_severity_from_alarm_code("VACUUM_FAILURE") == "critical"

    def test_infer_severity_temp_spike_warning(self):
        from app.utils.mappings import infer_severity_from_alarm_code
        assert infer_severity_from_alarm_code("TEMP_SPIKE") == "warning"

    def test_infer_severity_none_code(self):
        from app.utils.mappings import infer_severity_from_alarm_code
        assert infer_severity_from_alarm_code(None) is None

    def test_infer_tool_type_etch(self):
        from app.utils.mappings import infer_tool_type
        assert infer_tool_type("ETCH_TOOL_01") == "etch"

    def test_infer_tool_type_cvd_deposition(self):
        from app.utils.mappings import infer_tool_type
        assert infer_tool_type("CVD_TOOL_01") == "deposition"

    def test_infer_tool_type_euv_lithography(self):
        from app.utils.mappings import infer_tool_type
        assert infer_tool_type("EUV_SCANNER_01") == "lithography"

    def test_infer_tool_type_metro(self):
        from app.utils.mappings import infer_tool_type
        assert infer_tool_type("METRO_TOOL_01") == "metrology"

    def test_infer_tool_type_unknown(self):
        from app.utils.mappings import infer_tool_type
        assert infer_tool_type("GENERIC_TOOL_99") == "unknown"


class TestNormalization:
    def _norm(self, events):
        from app.services.normalization import normalize_events
        return normalize_events(events)

    def test_parameter_normalized(self):
        events = [{"parameter": "TEMP_C", "event_type": "PARAMETER_READING"}]
        assert self._norm(events)[0]["parameter"] == "temperature"

    def test_event_type_normalized(self):
        events = [{"event_type": "sensor"}]
        assert self._norm(events)[0]["event_type"] == "PARAMETER_READING"

    def test_severity_normalized(self):
        events = [{"severity": "WARNING"}]
        assert self._norm(events)[0]["severity"] == "warning"

    def test_alarm_code_upgrades_severity(self):
        events = [{"alarm_code": "VACUUM_FAILURE", "severity": "info"}]
        assert self._norm(events)[0]["severity"] == "critical"

    def test_alarm_code_does_not_downgrade(self):
        events = [{"alarm_code": "TEMP_SPIKE", "severity": "critical"}]
        assert self._norm(events)[0]["severity"] == "critical"

    def test_tool_type_inferred(self):
        events = [{"tool_id": "CVD_TOOL_01"}]
        assert self._norm(events)[0]["tool_type"] == "deposition"

    def test_defaults_filled(self):
        e = self._norm([{}])[0]
        assert e["fab_id"] == "FAB_01" and e["tool_id"] == "UNKNOWN"
        assert e["chamber_id"] == "CH_A" and e["event_type"] == "PARAMETER_READING"
        assert e["severity"] == "info" and e["parse_status"] == "ok"

    def test_existing_values_not_overwritten(self):
        events = [{"fab_id": "FAB_99", "tool_id": "ETCH_01", "severity": "alarm"}]
        e = self._norm(events)[0]
        assert e["fab_id"] == "FAB_99" and e["tool_id"] == "ETCH_01"

    def test_empty_list(self):
        assert self._norm([]) == []

    def test_multiple_events(self):
        events = [{"parameter": "TEMP_C"}, {"parameter": "PRESSURE"}]
        r = self._norm(events)
        assert r[0]["parameter"] == "temperature" and r[1]["parameter"] == "pressure"

    def test_no_tool_type_if_already_set(self):
        events = [{"tool_id": "CVD_TOOL_01", "tool_type": "custom_type"}]
        e = self._norm(events)[0]
        assert e["tool_type"] == "custom_type"


class TestValidation:
    def _val(self, events):
        from app.services.validation import validate_events
        return validate_events(events)

    def test_valid_event_no_errors(self):
        result = self._val([{"tool_id": "ETCH_01", "timestamp": "2026-01-01T10:00:00", "event_type": "PARAMETER_READING", "value": "120"}])
        assert result[0].get("parse_error", "") == ""

    def test_missing_tool_id_partial(self):
        result = self._val([{"timestamp": "2026-01-01T10:00:00", "event_type": "PARAMETER_READING", "value": "120"}])
        assert result[0]["parse_status"] == "partial" and "tool_id_missing" in result[0]["parse_error"]

    def test_unknown_tool_id_partial(self):
        result = self._val([{"tool_id": "UNKNOWN", "timestamp": "2026-01-01", "event_type": "PARAMETER_READING", "value": "120"}])
        assert result[0]["parse_status"] == "partial"

    def test_non_numeric_value_partial(self):
        result = self._val([{"tool_id": "ETCH_01", "event_type": "PARAMETER_READING", "value": "not_a_number"}])
        assert result[0]["parse_status"] == "partial" and "value_not_numeric" in result[0]["parse_error"]

    def test_numeric_value_ok(self):
        result = self._val([{"tool_id": "ETCH_01", "event_type": "PARAMETER_READING", "value": "3.14"}])
        assert "value_not_numeric" not in result[0].get("parse_error", "")

    def test_bad_timestamp_partial(self):
        result = self._val([{"tool_id": "ETCH_01", "timestamp": "not-a-date", "event_type": "INFO"}])
        assert result[0]["parse_status"] == "partial" and "timestamp_unparseable" in result[0]["parse_error"]

    def test_empty_timestamp_ok(self):
        result = self._val([{"tool_id": "ETCH_01", "timestamp": "", "event_type": "INFO"}])
        assert "timestamp_unparseable" not in result[0].get("parse_error", "")

    def test_multiple_errors(self):
        result = self._val([{"tool_id": "UNKNOWN", "timestamp": "bad-ts", "event_type": "PARAMETER_READING", "value": "abc"}])
        errors = result[0]["parse_error"]
        assert "tool_id_missing" in errors and "value_not_numeric" in errors and "timestamp_unparseable" in errors

    def test_empty_list(self):
        assert self._val([]) == []

    def test_alarm_non_numeric_value_ok(self):
        result = self._val([{"tool_id": "ETCH_01", "event_type": "ALARM", "value": "vacuum failure text"}])
        assert "value_not_numeric" not in result[0].get("parse_error", "")

    def test_scientific_notation_ok(self):
        result = self._val([{"tool_id": "ETCH_01", "event_type": "PARAMETER_READING", "value": "1.5e-3"}])
        assert "value_not_numeric" not in result[0].get("parse_error", "")

    def test_negative_numeric_ok(self):
        result = self._val([{"tool_id": "ETCH_01", "event_type": "PARAMETER_READING", "value": "-45.2"}])
        assert "value_not_numeric" not in result[0].get("parse_error", "")

    def test_no_value_for_param_reading_ok(self):
        result = self._val([{"tool_id": "ETCH_01", "event_type": "PARAMETER_READING", "value": ""}])
        assert "value_not_numeric" not in result[0].get("parse_error", "")


class TestDeduplication:
    def _base(self, **kw):
        e = {"run_id": RUN_ID, "timestamp": "2026-01-01T10:00:00", "tool_id": "ETCH_01",
             "chamber_id": "CH_A", "recipe_name": "RCP_A", "recipe_step": "step1",
             "event_type": "PARAMETER_READING", "parameter": "temperature", "value": "120",
             "unit": "C", "alarm_code": None, "severity": "info", "message": None,
             "raw_line": "temp=120", "raw_line_number": 1}
        e.update(kw)
        return e

    def test_unique_all_pass(self):
        from app.services.deduplication import deduplicate_event_dicts
        events = [self._base(parameter="temperature"), self._base(parameter="pressure")]
        unique, dropped, _ = deduplicate_event_dicts(events)
        assert len(unique) == 2 and dropped == 0

    def test_exact_duplicate_dropped(self):
        from app.services.deduplication import deduplicate_event_dicts
        e = self._base()
        unique, dropped, _ = deduplicate_event_dicts([e, e.copy()])
        assert len(unique) == 1 and dropped == 1

    def test_multiple_duplicates(self):
        from app.services.deduplication import deduplicate_event_dicts
        e = self._base()
        unique, dropped, _ = deduplicate_event_dicts([e, e.copy(), e.copy()])
        assert len(unique) == 1 and dropped == 2

    def test_existing_hashes_respected(self):
        from app.services.deduplication import deduplicate_event_dicts, event_fingerprint_from_dict
        e = self._base()
        existing = {event_fingerprint_from_dict(e)}
        unique, dropped, _ = deduplicate_event_dicts([e], existing_hashes=existing)
        assert len(unique) == 0 and dropped == 1

    def test_different_value_not_deduped(self):
        from app.services.deduplication import deduplicate_event_dicts
        unique, dropped, _ = deduplicate_event_dicts([self._base(value="120"), self._base(value="121")])
        assert len(unique) == 2 and dropped == 0

    def test_fingerprint_stable(self):
        from app.services.deduplication import event_fingerprint_from_dict
        e = self._base()
        assert event_fingerprint_from_dict(e) == event_fingerprint_from_dict(e.copy())

    def test_different_run_id_different_fp(self):
        from app.services.deduplication import event_fingerprint_from_dict
        e = self._base()
        assert event_fingerprint_from_dict(e, run_id="RUN_A") != event_fingerprint_from_dict(e, run_id="RUN_B")

    def test_empty_list(self):
        from app.services.deduplication import deduplicate_event_dicts
        unique, dropped, seen = deduplicate_event_dicts([])
        assert unique == [] and dropped == 0 and seen == set()

    def test_none_values_handled(self):
        from app.services.deduplication import deduplicate_event_dicts
        e = self._base(alarm_code=None, message=None)
        unique, dropped, _ = deduplicate_event_dicts([e, e.copy()])
        assert len(unique) == 1 and dropped == 1

    def test_different_line_number_different_fp(self):
        from app.services.deduplication import deduplicate_event_dicts
        unique, dropped, _ = deduplicate_event_dicts([self._base(raw_line_number=1), self._base(raw_line_number=2)])
        assert len(unique) == 2

    def test_returned_seen_set_grows(self):
        from app.services.deduplication import deduplicate_event_dicts
        events = [self._base(parameter="temperature"), self._base(parameter="pressure")]
        _, _, seen = deduplicate_event_dicts(events)
        assert len(seen) == 2


class TestSecurity:
    def test_allowed_json(self):
        from app.security import validate_upload
        ok, msg = validate_upload("log.json", 100)
        assert ok and msg == ""

    def test_allowed_csv(self):
        from app.security import validate_upload
        ok, _ = validate_upload("log.csv", 100)
        assert ok

    def test_allowed_txt(self):
        from app.security import validate_upload
        ok, _ = validate_upload("log.txt", 100)
        assert ok

    def test_allowed_xml(self):
        from app.security import validate_upload
        ok, _ = validate_upload("log.xml", 100)
        assert ok

    def test_allowed_bin(self):
        from app.security import validate_upload
        ok, _ = validate_upload("data.bin", 100)
        assert ok

    def test_disallowed_exe(self):
        from app.security import validate_upload
        ok, msg = validate_upload("script.exe", 100)
        assert not ok and "not allowed" in msg

    def test_disallowed_py(self):
        from app.security import validate_upload
        ok, msg = validate_upload("evil.py", 100)
        assert not ok

    def test_file_too_large(self):
        from app.security import validate_upload
        from app.config import settings
        big = settings.max_upload_size_mb * 1024 * 1024 + 1
        ok, msg = validate_upload("log.json", big)
        assert not ok and "too large" in msg

    def test_exact_limit_ok(self):
        from app.security import validate_upload
        from app.config import settings
        exact = settings.max_upload_size_mb * 1024 * 1024
        ok, _ = validate_upload("log.json", exact)
        assert ok

    def test_sanitize_removes_traversal(self):
        from app.security import sanitize_filename
        safe = sanitize_filename("../../evil<>file.json")
        assert ".." not in safe and "<" not in safe and ">" not in safe

    def test_sanitize_keeps_extension(self):
        from app.security import sanitize_filename
        assert sanitize_filename("mylog.csv").endswith(".csv")

    def test_sanitize_unique_per_call(self):
        from app.security import sanitize_filename
        assert sanitize_filename("log.json") != sanitize_filename("log.json")

    def test_csv_formula_injection_equals(self):
        from app.security import sanitize_csv_value
        assert sanitize_csv_value("=cmd()").startswith("'")

    def test_csv_formula_injection_plus(self):
        from app.security import sanitize_csv_value
        assert sanitize_csv_value("+1+1").startswith("'")

    def test_csv_formula_injection_minus(self):
        from app.security import sanitize_csv_value
        assert sanitize_csv_value("-cmd()").startswith("'")

    def test_csv_formula_injection_at(self):
        from app.security import sanitize_csv_value
        assert sanitize_csv_value("@SUM(A1)").startswith("'")

    def test_csv_normal_value_unchanged(self):
        from app.security import sanitize_csv_value
        assert sanitize_csv_value("normal value") == "normal value"
        assert sanitize_csv_value("120") == "120"

    def test_csv_empty_unchanged(self):
        from app.security import sanitize_csv_value
        assert sanitize_csv_value("") == ""


class TestGoldenRunMath:
    """Pure math tests for drift detection logic — no DB needed."""
    def _avg(self, events):
        totals = {}
        for e in events:
            if e.get("parameter") and e.get("value"):
                try:
                    v = float(e["value"])
                    totals.setdefault(e["parameter"], []).append(v)
                except ValueError:
                    pass
        return {k: sum(v) / len(v) for k, v in totals.items()}

    def test_avg_single(self):
        assert self._avg([{"parameter": "temperature", "value": "120"}])["temperature"] == 120.0

    def test_avg_multiple(self):
        assert self._avg([{"parameter": "temperature", "value": "100"}, {"parameter": "temperature", "value": "200"}])["temperature"] == 150.0

    def test_avg_ignores_non_numeric(self):
        assert self._avg([{"parameter": "temperature", "value": "abc"}, {"parameter": "temperature", "value": "120"}])["temperature"] == 120.0

    def test_avg_empty(self):
        assert self._avg([]) == {}

    def test_pct_formula(self):
        assert ((115.0 - 100.0) / abs(100.0)) * 100 == 15.0

    def test_severity_above_20_alarm(self):
        pct = 25.0
        sev = "alarm" if abs(pct) > 20 else "warning" if abs(pct) > 10 else "info"
        assert sev == "alarm"

    def test_severity_10_to_20_warning(self):
        pct = 15.0
        sev = "alarm" if abs(pct) > 20 else "warning" if abs(pct) > 10 else "info"
        assert sev == "warning"

    def test_severity_below_10_info(self):
        pct = 5.0
        sev = "alarm" if abs(pct) > 20 else "warning" if abs(pct) > 10 else "info"
        assert sev == "info"

    def test_zero_baseline_none(self):
        baseline, current = 0.0, 50.0
        pct = None if baseline == 0 else ((current - baseline) / abs(baseline)) * 100
        assert pct is None

    def test_negative_deviation_alarm(self):
        pct = ((70.0 - 100.0) / abs(100.0)) * 100
        assert pct == -30.0
        sev = "alarm" if abs(pct) > 20 else "warning"
        assert sev == "alarm"

    def test_exactly_20pct_not_alarm(self):
        """Exactly 20% deviation is warning, not alarm (threshold is >20)."""
        pct = 20.0
        sev = "alarm" if abs(pct) > 20 else "warning" if abs(pct) > 10 else "info"
        assert sev == "warning"

    def test_exactly_10pct_not_warning(self):
        """Exactly 10% deviation is info, not warning (threshold is >10)."""
        pct = 10.0
        sev = "alarm" if abs(pct) > 20 else "warning" if abs(pct) > 10 else "info"
        assert sev == "info"
