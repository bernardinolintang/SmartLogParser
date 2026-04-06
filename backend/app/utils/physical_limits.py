"""Physical plausibility checks for semiconductor process parameters."""

PHYSICAL_LIMITS: dict[str, tuple[float, float, str]] = {
    "temperature": (-273.15, 2000.0, "C"),
    "pressure": (0.0, 10000.0, "Torr"),
    "rf_power": (0.0, 10000.0, "W"),
    "gas_flow": (0.0, 50000.0, "sccm"),
    "humidity": (0.0, 100.0, "%"),
    "voltage": (-10000.0, 10000.0, "V"),
    "current": (-1000.0, 1000.0, "A"),
    "pedestal_power": (0.0, 10000.0, "W"),
    "power": (0.0, 50000.0, "W"),
    "laser_power": (0.0, 5000.0, "W"),
    "vibration": (0.0, 1000.0, "mm/s"),
    "wavelength": (1.0, 100000.0, "nm"),
}


def validate_physical_plausibility(event: dict) -> list[str]:
    """Return a list of error strings for any out-of-range parameter values."""
    errors: list[str] = []
    parameter = (event.get("parameter") or "").lower()
    value = event.get("value")

    if parameter not in PHYSICAL_LIMITS or value is None:
        return errors

    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return errors

    lo, hi, unit = PHYSICAL_LIMITS[parameter]
    if not (lo <= numeric <= hi):
        errors.append(
            f"physically_implausible:{parameter}={numeric} outside [{lo},{hi}]{unit}"
        )

    return errors
