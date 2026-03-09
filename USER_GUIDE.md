# Smart Semiconductor Tool Log Parser - User Guide

This guide is designed for:

- hackathon judges reviewing the workflow quickly
- engineers new to semiconductor equipment logs
- non-software users who need to understand what happened in a run

## What This Product Does

Semiconductor machines generate raw technical logs that are difficult to interpret directly. Smart Semiconductor Tool Log Parser ingests those logs and converts them into structured events that can be explored through dashboards.

In practical terms:

- You upload a messy machine log
- The system identifies format and extracts events
- You inspect health, alarms, trends, and drift from one UI

## Why It Matters in Manufacturing

In fab operations, logs commonly include:

- timestamps
- tool and chamber IDs
- recipe and process step context
- sensor readings (temperature, pressure, RF power, gas flow)
- alarm and state transition records

Without structured processing, root-cause analysis is slow. This platform simulates a modern observability pipeline that reduces manual log reading and accelerates engineering decisions.

## Quick Start

1. Open a terminal in the project root.
2. Run:

```sh
npm install
npm --prefix frontend install
npm run dev
```

3. Open `http://localhost:8080`.

`npm run dev` launches both frontend and backend together.

## Supported Inputs

- JSON
- XML
- CSV
- key-value text logs
- syslog-style logs
- plain text logs
- hex/binary-like logs

## Typical User Flow

### 1) Upload or Stream

In the `Upload` tab, drag-and-drop a log file or select a sample log. You can also use streaming mode to simulate live telemetry.

### 2) Processing Pipeline

This is what the platform is doing under the hood, stage-by-stage:

1. **Run Creation**
   - Every upload creates a unique `run_id`.
   - This keeps all events, summaries, and comparisons grouped by one processing session.

2. **Format Detection**
   - The backend inspects content patterns (not filename alone).
   - It classifies logs as JSON, XML, CSV, key-value, syslog, text, or hex.
   - Why this matters: each format has a dedicated parser for better accuracy.

3. **Parser Routing**
   - The file is sent to the matching parser path.
   - Structured formats use deterministic extraction rules first.
   - Why this matters: deterministic parsing is fast, cheap, and predictable.

4. **Deterministic Parsing**
   - The parser extracts fields like timestamp, tool/chamber, recipe step, parameter, value, and alarms.
   - For example, `TEMP_C`, `Temperature`, and `temp` are all detected as sensor readings.
   - Why this matters: core fab data is converted from raw text into machine-readable events.

5. **LLM Fallback (Only If Needed)**
   - If a row is ambiguous or partially parsed, only those rows are sent to Groq.
   - The LLM is constrained to output strict JSON schema fields.
   - Why this matters: you get flexibility for messy logs without using LLM on every line.

6. **Normalization**
   - Vendor-specific names are mapped to canonical names:
     - `TEMP_C -> temperature`
     - `PRESSURE_TORR -> pressure`
     - `RFPOWER -> rf_power`
   - Event labels and severity are also standardized.
   - Why this matters: cross-vendor comparison becomes possible.

7. **Validation**
   - The system validates timestamp shape, numeric parameter rows, and schema consistency.
   - Invalid/uncertain rows are marked `parse_status=partial` instead of crashing the run.
   - Why this matters: robust processing even with imperfect logs.

8. **Storage and Summary**
   - Structured events are stored by `run_id` in the backend database.
   - Summary metrics (alarm count, warnings, ranges, time windows) are computed.
   - Why this matters: dashboards load quickly and stay consistent.

### 3) Review Dashboards

Use the left navigation to explore insights:

- `Overview` - run-level status snapshot
- `Health` - tool condition and chamber-level behavior
- `Data` - structured event table with searchable fields
- `Analytics` / `Trends` - time series and distributions
- `Recipe` - process timeline and step sequence
- `Alarms` / `Anomaly` - issue-focused investigation
- `Golden Run` - baseline comparison for drift
- `Raw Log` - side-by-side traceability
- `Report` - shareable engineering summary
- `Architecture` - end-to-end data flow explanation

## What Each Dashboard Is For (Fab Workflow View)

From an equipment/process engineering perspective:

- **Overview**
  - First triage screen.
  - Confirms run volume, active alarms, tool/chamber scope, and time coverage.

- **Health**
  - Operational stability snapshot.
  - Useful when determining if issue is isolated to one chamber or systemic.

- **Data**
  - Truth table for parsed events.
  - Use this when you need exact event rows for RCA notes or handoff.

- **Analytics / Trends**
  - Parameter behavior through time.
  - Best for identifying drift, oscillation, sudden jumps, and pre-alarm signatures.

- **Recipe**
  - Sequence-level visibility (`STEP_START`, `STEP_END`, transitions).
  - Helps verify whether excursions align with specific process steps.

- **Alarms / Anomaly**
  - Incident-focused exploration.
  - Helps isolate root events and surrounding machine state changes.

- **Golden Run**
  - Baseline-vs-current comparison.
  - Useful for detecting subtle drift before hard alarm thresholds are crossed.

- **Raw Log**
  - Source traceability.
  - Critical for auditability: verify what parser interpreted vs original text.

- **Report**
  - Compact output for shift handoff, review meetings, or judge demos.

## Alarm Investigation Workflow

Recommended workflow for incident analysis:

1. Open `Alarms` and select the alarm event.
2. Inspect surrounding events in timeline order.
3. Check `Trends` for pre-alarm parameter shifts.
4. Compare against a stable baseline in `Golden Run`.
5. Use `Raw Log` to validate parser interpretation.

## Recommended Engineering Investigation Sequence

If you are debugging a process incident:

1. Start in `Overview` to scope blast radius (how many alarms, which tool/chamber).
2. Move to `Alarms` and pick the first critical or earliest alarm.
3. Use `Timeline`/`Recipe` to locate the exact process step around alarm onset.
4. Open `Trends` for key parameters (`temperature`, `pressure`, `rf_power`, `gas_flow`).
5. Compare with `Golden Run` to quantify deviation.
6. Validate suspicious lines in `Raw Log`.
7. Export structured data for downstream reporting if needed.

## Golden Run Comparison

Use a known stable run as baseline:

- mark baseline as golden
- compare current run to baseline
- inspect parameter deviation and severity

This is useful for early detection of process drift before full yield impact.

## Real-Time Streaming Simulation

The system supports incremental log ingestion:

- start stream session
- append new lines in batches
- parse and update run state continuously
- finish stream and lock summary

This models real fab telemetry ingestion behavior.

## Security Notes (User-Facing)

- Uploads are treated as untrusted input.
- Only allowed file types are accepted.
- Large files are rejected by size policy.
- Parsed outputs are schema-validated before visualization.
- Secrets (API keys) remain backend-only.

## Troubleshooting

- **No backend connection:** run `npm run dev` from project root.
- **Upload rejected:** verify file extension/size constraints.
- **Empty charts:** check if the run contains parameter-reading events.
- **Unexpected values:** inspect `Raw Log` for source traceability.

## Practical Takeaway

Smart Semiconductor Tool Log Parser converts heterogeneous, vendor-specific tool logs into structured operational intelligence for faster and safer process decisions.
