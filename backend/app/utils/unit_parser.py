"""Extract numeric values and units from strings like '120C' or '0.8Torr'."""

import re

_UNIT_PATTERN = re.compile(r"^([+-]?\d+\.?\d*)\s*([A-Za-z/%°]+)?$")


def parse_value_unit(raw: str) -> tuple[str, str | None]:
    raw = raw.strip()
    m = _UNIT_PATTERN.match(raw)
    if m:
        return m.group(1), m.group(2) or None
    return raw, None
