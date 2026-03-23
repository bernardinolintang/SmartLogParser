import pytest
RUN_ID = "run_test_001"

class TestUnitParser:
    def _p(self, s):
        from app.utils.unit_parser import parse_value_unit
        return parse_value_unit(s)
    def test_value_and_unit(self): assert self._p("120C") == ("120", "C")
    def test_float_and_unit(self): assert self._p("0.8Torr") == ("0.8", "Torr")
    def test_value_only(self): assert self._p("500") == ("500", None)
    def test_non_numeric(self):
        val, unit = self._p("abc")
        assert val == "abc" and unit is None
    def test_empty(self):
        val, unit = self._p("")
        assert val == "" and unit is None
    def test_negative(self): assert self._p("-50") == ("-50", None)
    def test_positive_sign(self): assert self._p("+5.2V") == ("+5.2", "V")
    def test_percent(self): assert self._p("95%") == ("95", "%")
    def test_whitespace(self):
        val, unit = self._p("  120 C  ")
        assert val == "120" and unit == "C"
