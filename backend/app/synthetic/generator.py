"""Synthetic semiconductor log generator for demo and testing."""

from __future__ import annotations

import json
import random
import struct
import time
from datetime import datetime, timedelta, timezone


TOOLS = ["DRY_ETCH_001", "DRY_ETCH_002", "EUV_SCANNER_001", "CVD_TOOL_001", "CMP_TOOL_001"]
CHAMBERS = ["C1", "C2", "C3", "C4"]
RECIPES = ["ETCH_RECIPE_A", "OXIDE_DEP_001", "PHOTO_STEP_3", "CMP_STD_FLOW"]
PARAMS = {
    "temperature": (85.0, 3.0, "C"),
    "pressure": (0.9, 0.05, "Pa"),
    "rf_power": (150.0, 10.0, "W"),
    "gas_flow": (50.0, 2.0, "sccm"),
}
ALARMS = ["VACUUM_FAULT", "TEMP_HIGH", "PRESSURE_LOW", "RF_INTERLOCK", "DOOR_OPEN"]

MAGIC = 0xDEADBEEF
PARAM_ID = {"temperature": 1, "pressure": 2, "rf_power": 3, "gas_flow": 4}
TOOL_ID = {t: i + 1 for i, t in enumerate(TOOLS)}
CH_ID = {c: i + 1 for i, c in enumerate(CHAMBERS)}
ALARM_ID = {a: i + 1 for i, a in enumerate(ALARMS)}


def _records(n: int = 80) -> list[dict]:
    now = datetime.now(tz=timezone.utc) - timedelta(minutes=20)
    recs: list[dict] = []
    ts_cursor = now
    for i in range(n):
        # Mixed cadence to emulate real fab behavior: mostly sampled with occasional event-driven bursts.
        step_seconds = random.choice([1, 1, 2, 5, 15, 30])
        ts_cursor = ts_cursor + timedelta(seconds=step_seconds)
        ts = ts_cursor
        tool = random.choice(TOOLS)
        chamber = random.choice(CHAMBERS)
        recipe = random.choice(RECIPES)
        param = random.choice(list(PARAMS.keys()))
        base, delta, unit = PARAMS[param]
        value = round(random.gauss(base, delta / 2), 3)
        alarm = random.choice(ALARMS) if random.random() < 0.05 else None
        recs.append(
            {
                "timestamp": ts.isoformat(),
                "tool_id": tool,
                "chamber_id": chamber,
                "lot_id": f"LOT_{random.randint(100, 999)}",
                "wafer_id": f"WAFER_{random.randint(1, 25):02d}",
                "recipe_name": recipe,
                "recipe_step": random.choice(["PumpDown", "Stabilize", "Process", "CoolDown"]),
                "event_type": "ALARM" if alarm else "PARAMETER_READING",
                "parameter": param,
                "value": value,
                "unit": unit,
                "alarm_code": alarm,
                "severity": "CRITICAL" if alarm and random.random() < 0.4 else ("WARNING" if alarm else "INFO"),
            }
        )
    return recs


def generate_json() -> str:
    out = []
    for r in _records(60):
        out.append(
            {
                "ToolID": r["tool_id"],
                "ChamberID": r["chamber_id"],
                "LotID": r["lot_id"],
                "WaferID": r["wafer_id"],
                "RecipeName": r["recipe_name"],
                "Timestamp": r["timestamp"],
                "event_type": r["event_type"],
                "parameter": r["parameter"],
                "value": r["value"],
                "unit": r["unit"],
                "alarm_code": r["alarm_code"],
            }
        )
    return json.dumps(out, indent=2)


def generate_xml() -> str:
    rows = _records(50)
    head = '<Log EquipmentID="EUV_SCANNER_001" RecipeID="PHOTO_STEP_3" ChamberID="C1">\n'
    body = ""
    for idx, r in enumerate(rows, 1):
        body += (
            f'  <Step id="{idx}" timestamp="{r["timestamp"]}">\n'
            f'    <Param name="{r["parameter"]}" unit="{r["unit"]}">{r["value"]}</Param>\n'
            f'  </Step>\n'
        )
    return head + body + "</Log>\n"


def generate_csv() -> str:
    rows = _records(80)
    lines = ["timestamp,equipment_id,chamber_id,lot_id,wafer_id,parameter,value,unit,step_id,recipe_name,run_id,event_type,severity,alarm_code"]
    for r in rows:
        lines.append(
            f'{r["timestamp"]},{r["tool_id"]},{r["chamber_id"]},{r["lot_id"]},{r["wafer_id"]},{r["parameter"]},{r["value"]},{r["unit"]},{r["recipe_step"]},{r["recipe_name"]},RUN_SYNTH_001,{r["event_type"]},{r["severity"]},{r["alarm_code"] or ""}'
        )
    return "\n".join(lines)


def generate_kv() -> str:
    rows = _records(70)
    lines = []
    for r in rows:
        lines.append(
            f'timestamp={r["timestamp"]} tool_id={r["tool_id"]} chamber_id={r["chamber_id"]} lot_id={r["lot_id"]} wafer_id={r["wafer_id"]} recipe_name={r["recipe_name"]} step={r["recipe_step"]} {r["parameter"]}={r["value"]}{r["unit"]} alarm={r["alarm_code"] or "none"}'
        )
    return "\n".join(lines)


def generate_syslog() -> str:
    rows = _records(70)
    lines = []
    for r in rows:
        dt = datetime.fromisoformat(r["timestamp"])
        ts = dt.strftime("%b %d %H:%M:%S")
        category = "ALARM" if r["event_type"] == "ALARM" else ("WARNING" if r["severity"] == "WARNING" else "SENSOR")
        msg = f'{r["parameter"]}={r["value"]}{r["unit"]}'
        if r["alarm_code"]:
            msg += f' alarm_code={r["alarm_code"]}'
        lines.append(f"{ts} {r['tool_id']} {category} {msg}")
    return "\n".join(lines)


def generate_text() -> str:
    rows = _records(60)
    lines = []
    for r in rows:
        lines.append(f'[{r["timestamp"]}] {r["tool_id"]} {r["recipe_step"]} {r["parameter"]}: {r["value"]} {r["unit"]}')
        if r["alarm_code"]:
            lines.append(f'[{r["timestamp"]}] Alarm triggered {r["alarm_code"]} on {r["tool_id"]} chamber {r["chamber_id"]}')
    return "\n".join(lines)


def generate_binary() -> bytes:
    rows = _records(60)
    parts = [struct.pack("<I", MAGIC)]
    for r in rows:
        ts = int(datetime.fromisoformat(r["timestamp"]).timestamp())
        tool_idx = TOOL_ID.get(r["tool_id"], 1)
        chamber_idx = CH_ID.get(r["chamber_id"], 1)
        p_id = PARAM_ID.get(r["parameter"], 1)
        alarm_code = ALARM_ID.get(r["alarm_code"], 0) if r["alarm_code"] else 0
        parts.append(struct.pack("<IHHHHfI", ts, tool_idx, chamber_idx, p_id, 0, float(r["value"]), alarm_code))
    return b"".join(parts)


def generate_hex() -> str:
    return generate_binary().hex(" ")
