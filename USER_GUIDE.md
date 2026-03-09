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

The system runs:

- format detection
- parser routing
- deterministic extraction
- LLM fallback (only when needed)
- normalization and validation
- event storage and summary computation

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

## Alarm Investigation Workflow

Recommended workflow for incident analysis:

1. Open `Alarms` and select the alarm event.
2. Inspect surrounding events in timeline order.
3. Check `Trends` for pre-alarm parameter shifts.
4. Compare against a stable baseline in `Golden Run`.
5. Use `Raw Log` to validate parser interpretation.

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
