"""Canonical name mappings for cross-vendor normalization."""

from __future__ import annotations

import re

PARAMETER_MAP: dict[str, str] = {
    "temp": "temperature",
    "Temp": "temperature",
    "Temperature": "temperature",
    "temperature": "temperature",
    "temp_c": "temperature",
    "TEMP": "temperature",
    "TEMP_C": "temperature",

    "press": "pressure",
    "Press": "pressure",
    "Pressure": "pressure",
    "pressure": "pressure",
    "PRESSURE": "pressure",
    "pressure_torr": "pressure",
    "chamber_pressure": "pressure",

    "rf_power": "rf_power",
    "RF_Power": "rf_power",
    "RFPower": "rf_power",
    "RF Power": "rf_power",
    "rf_power_w": "rf_power",
    "power_rf": "rf_power",

    "gas_flow": "gas_flow",
    "GasFlow": "gas_flow",
    "Gas_Flow": "gas_flow",
    "gas_flow_cf4": "gas_flow",

    "power": "power",
    "Power": "power",
    "laser_power": "laser_power",

    "humidity": "humidity",
    "vibration": "vibration",
    "wavelength": "wavelength",
}

_NORMALIZED_PARAMETER_MAP: dict[str, str] = {
    re.sub(r"[^a-z0-9]+", "_", k.strip().lower()).strip("_"): v for k, v in PARAMETER_MAP.items()
}


EVENT_TYPE_MAP: dict[str, str] = {
    "sensor": "PARAMETER_READING",
    "SENSOR": "PARAMETER_READING",
    "alarm": "ALARM",
    "ALARM": "ALARM",
    "warning": "WARNING",
    "WARNING": "WARNING",
    "info": "INFO",
    "INFO": "INFO",
    "step_start": "STEP_START",
    "step_end": "STEP_END",
    "process_start": "PROCESS_START",
    "process_end": "PROCESS_END",
    "process_abort": "PROCESS_ABORT",
    "state_change": "STATE_CHANGE",
    "drift_warning": "DRIFT_WARNING",

    "Start process": "PROCESS_START",
    "Process started": "PROCESS_START",
    "Process aborted": "PROCESS_ABORT",
    "Alarm triggered": "ALARM",
    "Temperature drift detected": "DRIFT_WARNING",
}


SEVERITY_MAP: dict[str, str] = {
    "info": "info",
    "INFO": "info",
    "warning": "warning",
    "WARNING": "warning",
    "alarm": "alarm",
    "ALARM": "alarm",
    "critical": "critical",
    "CRITICAL": "critical",
}


ALARM_SEVERITY: dict[str, str] = {
    "VACUUM_FAILURE": "critical",
    "TEMP_SPIKE": "warning",
    "LOW_PRESSURE": "warning",
    "RF_POWER_FAULT": "critical",
    "GAS_LEAK": "critical",
    "OVER_TEMP": "alarm",
}

ALARM_CODE_MAP: dict[str, str] = {
    "VACUUM_FAILURE": "VACUUM_FAULT",
    "VAC_FAIL": "VACUUM_FAULT",
    "VAC_FAULT": "VACUUM_FAULT",
    "LOW_PRESSURE": "PRESSURE_LOW",
    "PRESS_LOW": "PRESSURE_LOW",
    "TEMP_SPIKE": "TEMP_HIGH",
    "OVER_TEMP": "TEMP_HIGH",
    "RF_POWER_FAULT": "RF_INTERLOCK",
    "RF_FAULT": "RF_INTERLOCK",
}


TOOL_TYPE_KEYWORDS: dict[str, str] = {
    "etch": "etch",
    "ETCH": "etch",
    "dep": "deposition",
    "DEP": "deposition",
    "CVD": "deposition",
    "PVD": "deposition",
    "litho": "lithography",
    "EUV": "lithography",
    "SCAN": "lithography",
    "metro": "metrology",
    "METRO": "metrology",
}


def normalize_parameter(name: str) -> str:
    raw = (name or "").strip()
    if not raw:
        return "value"

    if raw in PARAMETER_MAP:
        return PARAMETER_MAP[raw]

    norm = re.sub(r"[^a-z0-9]+", "_", raw.lower()).strip("_")
    if norm in _NORMALIZED_PARAMETER_MAP:
        return _NORMALIZED_PARAMETER_MAP[norm]

    # Handle indexed and vendor-varied names, e.g. temp1/temp_2/t_sensor/p_chamber.
    if re.match(r"^t(emp(erature)?)?(_?sensor)?_?\d*$", norm) or "chamber_temp" in norm:
        return "temperature"
    if (
        norm.startswith("press")
        or "pressure" in norm
        or re.match(r"^p(_?chamber)?_?\d*$", norm)
    ):
        return "pressure"
    if ("rf" in norm and "power" in norm) or norm.startswith("rfp"):
        return "rf_power"
    if "gas" in norm and "flow" in norm:
        return "gas_flow"
    if norm.startswith("pedestal_power") or norm == "ped_power":
        return "pedestal_power"

    return norm


def normalize_event_type(raw: str) -> str:
    if raw in EVENT_TYPE_MAP:
        return EVENT_TYPE_MAP[raw]
    return raw.upper()


def normalize_severity(raw: str) -> str:
    return SEVERITY_MAP.get(raw, "info")


def normalize_alarm_code(code: str | None) -> str | None:
    if not code:
        return None
    norm = re.sub(r"[^A-Z0-9]+", "_", code.upper()).strip("_")
    return ALARM_CODE_MAP.get(norm, norm)


def infer_severity_from_alarm_code(code: str | None) -> str | None:
    normalized = normalize_alarm_code(code)
    if not normalized:
        return None
    return ALARM_SEVERITY.get(normalized)


def infer_tool_type(tool_id: str) -> str:
    upper = tool_id.upper()
    for keyword, tool_type in TOOL_TYPE_KEYWORDS.items():
        if keyword.upper() in upper:
            return tool_type
    return "unknown"
