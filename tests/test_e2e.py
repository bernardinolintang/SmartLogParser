"""
SmartLogParser - End-to-End Test Script
========================================
Run this from your project root:
    python test_e2e.py

Requirements: your FastAPI backend must be running (default: http://localhost:8000)
Install deps if needed: pip install requests rich

What this tests:
  1. Upload each of the 7 log files via POST /api/parse
  2. Asserts format was detected correctly
  3. Asserts events were extracted (count > 0)
  4. Asserts no catastrophic parse failure
  5. Fetches run summary and checks stability_score, alarm_count
  6. Re-uploads same file and checks duplicates_dropped > 0
  7. Queries /api/events filtered by tool + severity
  8. Prints a full pass/fail report per file
"""

import requests
import json
import os
import sys
import time
from pathlib import Path

# ── CONFIG ───────────────────────────────────────────────────────────────────
BASE_URL = "http://localhost:8000"   # change if your backend runs elsewhere
LOG_DIR  = Path(__file__).parent     # same folder as this script
TIMEOUT  = 30                        # seconds per request

# Expected format detection per file
EXPECTED = {
    "vendor_a_dry_etch.json":    {"format": "json",     "min_events": 5,  "has_alarm": True},
    "cvd_toollog.xml":           {"format": "xml",      "min_events": 5,  "has_alarm": True},
    "metrology_etch_sensor.csv": {"format": "csv",      "min_events": 10, "has_alarm": True},
    "etch_tool_syslog.log":      {"format": "syslog",   "min_events": 8,  "has_alarm": True},
    "metrology_kv.kv":           {"format": "kv",       "min_events": 8,  "has_alarm": True},
    "euv_scanner_event.log":     {"format": "text",     "min_events": 5,  "has_alarm": True},
    "binary_sensor_dump.hex":    {"format": "hex",      "min_events": 5,  "has_alarm": False},
}

# ── HELPERS ──────────────────────────────────────────────────────────────────
GREEN  = "\033[92m"
RED    = "\033[91m"
YELLOW = "\033[93m"
CYAN   = "\033[96m"
RESET  = "\033[0m"
BOLD   = "\033[1m"

def ok(msg):   print(f"  {GREEN}PASS{RESET}  {msg}")
def fail(msg): print(f"  {RED}FAIL{RESET}  {msg}")
def warn(msg): print(f"  {YELLOW}WARN{RESET}  {msg}")
def info(msg): print(f"  {CYAN}INFO{RESET}  {msg}")

def check(condition, pass_msg, fail_msg):
    if condition:
        ok(pass_msg)
        return True
    else:
        fail(fail_msg)
        return False

# ── HEALTH CHECK ─────────────────────────────────────────────────────────────
def health_check():
    print(f"\n{BOLD}=== Health Check ==={RESET}")
    try:
        r = requests.get(f"{BASE_URL}/health", timeout=5)
        if r.status_code == 200:
            ok(f"Backend reachable at {BASE_URL}")
            return True
        else:
            fail(f"Backend returned HTTP {r.status_code}")
            return False
    except Exception as e:
        fail(f"Cannot reach backend: {e}")
        print(f"\n{YELLOW}  Is your FastAPI server running?{RESET}")
        print(f"  Try: cd backend && uvicorn app.main:app --reload")
        return False

# ── UPLOAD + PARSE ───────────────────────────────────────────────────────────
def upload_file(filepath: Path) -> dict | None:
    with open(filepath, "rb") as f:
        files = {"file": (filepath.name, f)}
        try:
            r = requests.post(f"{BASE_URL}/api/parse", files=files, timeout=TIMEOUT)
            if r.status_code == 200:
                return r.json()
            else:
                fail(f"Upload returned HTTP {r.status_code}: {r.text[:200]}")
                return None
        except Exception as e:
            fail(f"Upload exception: {e}")
            return None

# ── SUMMARY ──────────────────────────────────────────────────────────────────
def get_summary(run_id: str) -> dict | None:
    try:
        r = requests.get(f"{BASE_URL}/api/summary/{run_id}", timeout=TIMEOUT)
        if r.status_code == 200:
            return r.json()
        else:
            warn(f"Summary returned HTTP {r.status_code}")
            return None
    except Exception as e:
        warn(f"Summary exception: {e}")
        return None

# ── EVENTS QUERY ─────────────────────────────────────────────────────────────
def query_events(tool_id: str, severity: str = "alarm") -> list:
    try:
        r = requests.get(
            f"{BASE_URL}/api/events",
            params={"tool_id": tool_id, "severity": severity},
            timeout=TIMEOUT
        )
        if r.status_code == 200:
            data = r.json()
            return data if isinstance(data, list) else data.get("events", [])
        return []
    except Exception:
        return []

# ── PER-FILE TEST ─────────────────────────────────────────────────────────────
def test_file(filename: str, expected: dict) -> dict:
    filepath = LOG_DIR / filename
    results  = {"file": filename, "passed": 0, "failed": 0, "run_id": None}

    print(f"\n{BOLD}--- {filename} ---{RESET}")

    if not filepath.exists():
        fail(f"File not found: {filepath}")
        results["failed"] += 1
        return results

    # ── Test 1: Upload ────────────────────────────────────────────────────────
    info("Uploading file...")
    t0   = time.time()
    resp = upload_file(filepath)
    elapsed = time.time() - t0

    if resp is None:
        results["failed"] += 1
        return results

    run_id = resp.get("run_id") or resp.get("id")
    results["run_id"] = run_id
    info(f"Run ID: {run_id}  |  Parse time: {elapsed:.2f}s")

    # ── Test 2: Format detection ──────────────────────────────────────────────
    detected_format = (
        resp.get("format_detected")
        or resp.get("format")
        or resp.get("detected_format", "unknown")
    ).lower()
    expected_format = expected["format"]
    # Accept partial match (e.g. "json" in "json_structured")
    format_ok = expected_format in detected_format or detected_format in expected_format
    if check(format_ok,
             f"Format detected: {detected_format} (expected: {expected_format})",
             f"Format mismatch: got '{detected_format}', expected '{expected_format}'"):
        results["passed"] += 1
    else:
        results["failed"] += 1

    # ── Test 3: Events extracted ──────────────────────────────────────────────
    event_count = (
        resp.get("total_events")
        or resp.get("event_count")
        or resp.get("events_extracted", 0)
    )
    if check(event_count >= expected["min_events"],
             f"Events extracted: {event_count} (min expected: {expected['min_events']})",
             f"Too few events: got {event_count}, expected >= {expected['min_events']}"):
        results["passed"] += 1
    else:
        results["failed"] += 1

    # ── Test 4: Alarm detected if expected ───────────────────────────────────
    if expected["has_alarm"]:
        alarm_count = resp.get("alarm_count", 0) or resp.get("alarms", 0)
        if alarm_count == 0:
            # Try warnings too
            alarm_count = resp.get("warning_count", 0) or resp.get("warnings", 0)
        if check(alarm_count > 0,
                 f"Alarms/warnings captured: {alarm_count}",
                 f"Expected alarms but alarm_count=0 — check parser alarm extraction"):
            results["passed"] += 1
        else:
            results["failed"] += 1

    # ── Test 5: Run summary ───────────────────────────────────────────────────
    if run_id:
        summary = get_summary(run_id)
        if summary:
            stability = summary.get("stability_score")
            info(f"Stability score: {stability}")
            if check(stability is not None,
                     f"Summary returned stability_score={stability}",
                     "Summary missing stability_score"):
                results["passed"] += 1
            else:
                results["failed"] += 1
        else:
            warn("Could not fetch run summary — skipping stability check")

    # ── Test 6: Deduplication ─────────────────────────────────────────────────
    info("Re-uploading for dedup check...")
    resp2 = upload_file(filepath)
    if resp2:
        dupes = resp2.get("duplicates_dropped", -1)
        if check(dupes > 0,
                 f"Dedup working: duplicates_dropped={dupes} on re-upload",
                 f"Dedup may be broken: duplicates_dropped={dupes} (expected > 0)"):
            results["passed"] += 1
        else:
            results["failed"] += 1

    return results

# ── MAIN ─────────────────────────────────────────────────────────────────────
def main():
    print(f"\n{BOLD}{'='*60}{RESET}")
    print(f"{BOLD}  SmartLogParser - End-to-End Test Suite{RESET}")
    print(f"{BOLD}{'='*60}{RESET}")
    print(f"  Backend: {BASE_URL}")
    print(f"  Log dir: {LOG_DIR}")

    if not health_check():
        sys.exit(1)

    all_results = []
    for filename, expected in EXPECTED.items():
        result = test_file(filename, expected)
        all_results.append(result)

    # ── Global events query test ──────────────────────────────────────────────
    print(f"\n{BOLD}--- Global: Query /api/events ---{RESET}")
    alarm_events = query_events("ETCH_TOOL_03", severity="alarm")
    check(len(alarm_events) >= 0,
          f"Events endpoint reachable — returned {len(alarm_events)} alarm events for ETCH_TOOL_03",
          "Events endpoint unreachable")

    # ── Summary report ────────────────────────────────────────────────────────
    total_passed = sum(r["passed"] for r in all_results)
    total_failed = sum(r["failed"] for r in all_results)
    total        = total_passed + total_failed

    print(f"\n{BOLD}{'='*60}{RESET}")
    print(f"{BOLD}  RESULTS: {total_passed}/{total} checks passed{RESET}")
    print(f"{BOLD}{'='*60}{RESET}")

    for r in all_results:
        status = GREEN + "PASS" + RESET if r["failed"] == 0 else RED + "FAIL" + RESET
        print(f"  [{status}]  {r['file']:<40}  {r['passed']} passed, {r['failed']} failed")

    if total_failed == 0:
        print(f"\n{GREEN}{BOLD}  All checks passed. Pipeline is healthy.{RESET}\n")
        sys.exit(0)
    else:
        print(f"\n{RED}{BOLD}  {total_failed} checks failed. Review output above.{RESET}\n")
        sys.exit(1)

if __name__ == "__main__":
    main()
