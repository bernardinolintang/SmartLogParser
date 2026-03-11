"""Event deduplication helpers.

Deduplication is run-scoped and based on stable event fingerprints so that
replayed log chunks or repeated lines do not inflate analytics.
"""

from __future__ import annotations

import hashlib
import json
from typing import Iterable


_DEDUP_KEYS = (
    "timestamp",
    "tool_id",
    "chamber_id",
    "recipe_name",
    "recipe_step",
    "event_type",
    "parameter",
    "value",
    "unit",
    "alarm_code",
    "severity",
    "message",
    "raw_line",
    "raw_line_number",
)


def event_fingerprint_from_dict(event: dict, run_id: str | None = None) -> str:
    payload = {"run_id": run_id or event.get("run_id", "")}
    for key in _DEDUP_KEYS:
        payload[key] = _normalize(event.get(key))
    return _hash_payload(payload)


def event_fingerprint_from_model(event_obj) -> str:
    payload = {"run_id": _normalize(getattr(event_obj, "run_id", ""))}
    for key in _DEDUP_KEYS:
        payload[key] = _normalize(getattr(event_obj, key, ""))
    return _hash_payload(payload)


def deduplicate_event_dicts(
    events: list[dict],
    existing_hashes: set[str] | None = None,
) -> tuple[list[dict], int, set[str]]:
    seen = set(existing_hashes or set())
    unique_events: list[dict] = []
    dropped = 0

    for event in events:
        fp = event_fingerprint_from_dict(event)
        if fp in seen:
            dropped += 1
            continue
        seen.add(fp)
        unique_events.append(event)

    return unique_events, dropped, seen


def existing_hashes_from_models(events: Iterable[object]) -> set[str]:
    return {event_fingerprint_from_model(e) for e in events}


def _normalize(value) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _hash_payload(payload: dict) -> str:
    material = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(material.encode("utf-8")).hexdigest()
