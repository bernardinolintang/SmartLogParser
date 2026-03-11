"""Canonical name mappings for cross-vendor normalization."""

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
    if name in PARAMETER_MAP:
        return PARAMETER_MAP[name]
    return name.lower().replace(" ", "_")


def normalize_event_type(raw: str) -> str:
    if raw in EVENT_TYPE_MAP:
        return EVENT_TYPE_MAP[raw]
    return raw.upper()


def normalize_severity(raw: str) -> str:
    return SEVERITY_MAP.get(raw, "info")


def infer_tool_type(tool_id: str) -> str:
    upper = tool_id.upper()
    for keyword, tool_type in TOOL_TYPE_KEYWORDS.items():
        if keyword.upper() in upper:
            return tool_type
    return "unknown"
