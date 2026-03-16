# Smart Semiconductor Tool Log Parser

Smart Semiconductor Tool Log Parser is a full-stack observability platform that transforms heterogeneous semiconductor equipment logs into structured machine events for analytics, process monitoring, and engineering investigation.

This project simulates a real fab-style data pipeline:

`raw logs -> parsing + normalization -> structured events -> dashboards + diagnostics`

## Manufacturing Context

Semiconductor tools such as plasma etch systems, CVD/PVD deposition tools, lithography scanners, metrology stations, and wafer inspection systems produce high-volume, vendor-specific logs. These logs differ in syntax, metadata shape, and naming conventions, but often describe the same underlying machine behavior.

In production fabs, process and equipment engineers do not manually read raw logs line-by-line at scale. Instead, data pipelines ingest and standardize logs so teams can monitor health, investigate alarms, and detect drift.

This project demonstrates exactly that workflow.

## Core Capabilities

- Multi-format ingestion: JSON, XML, CSV, key-value, syslog, text, hex, binary (`.bin`)
- Automatic format detection and parser routing
- Deterministic parsing for structured formats
- LLM-assisted fallback parsing for ambiguous or unstructured lines
- Vendor-to-canonical normalization (`TEMP_C -> temperature`, etc.)
- Event validation with partial-row handling (no full-run failure)
- Run-based storage and summary metrics
- Dashboard workflows for alarms, trends, health, and comparisons
- Golden-run baseline comparison and drift detection
- Simulated real-time streaming ingestion

## Operational Assumptions (Hackathon Baseline)

- Logs may be tool-level only, or include chamber and recipe-step context.
- `lot_id` and `wafer_id` are treated as first-class fields when present.
- Cadence varies by source; summary infers an approximate median sampling interval.
- Alarm codes are vendor-specific at input and normalized to canonical internal codes.
- Teams can run batch processing after runs, with optional stream simulation for live monitoring.

## End-to-End Architecture

```
Semiconductor Equipment Tools
        ->
Log Ingestion Layer (upload / streaming)
        ->
Format Detection
        ->
Parser Router
        ->
Specialized Parsers (JSON/XML/CSV/KV/Syslog/Text/Hex/Binary)
        ->
LLM Fallback (only when deterministic confidence is low)
        ->
Normalization Engine
        ->
Structured Event Schema
        ->
Database Storage
        ->
Analytics and Investigation Dashboards
```

## One-Command Local Run

### Prerequisites

- Node.js 18+
- Python 3.11+

### Environment Setup

Create your root `.env` from `.env.example`:

```sh
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Set at minimum:

- `GROQ_API_KEY` (required for LLM fallback parsing)
- `MAX_UPLOAD_SIZE_MB` (optional upload limit override)
- `DATABASE_URL` (optional, defaults to local SQLite when omitted)

### Install

```sh
npm install
npm --prefix frontend install
cd backend
pip install -r requirements.txt
```

### Start Everything

```sh
npm run dev
```

This now starts both:

- Frontend (Vite): `http://localhost:8080`
- Backend (FastAPI): `http://localhost:8000`

Backend interactive API docs:

- Swagger UI: `http://localhost:8000/docs`
- OpenAPI JSON: `http://localhost:8000/openapi.json`

Useful alternatives:

- `npm run dev:frontend` - frontend only
- `npm run dev:backend` - backend only

## Project Layout

Current implementation:

```
SmartLogParser/
  frontend/
    src/
      components/
      pages/
      lib/
    public/
    package.json
  backend/
    app/
      parsers/
      services/
      routes/
      models.py
      schemas.py
      security.py
      main.py
    sample_logs/
    requirements.txt
  README.md
  USER_GUIDE.md
  DEVELOPER_GUIDE.md
```

Reference split-layout for larger teams:

```
project-root/
  frontend/
  backend/
```

## Canonical Event Model

Every parser emits the same logical schema:

- `run_id`
- `timestamp`
- `fab_id`
- `tool_id`
- `chamber_id`
- `recipe_name`
- `recipe_step`
- `event_type`
- `parameter`
- `value`
- `unit`
- `alarm_code`
- `severity`
- `message`
- `raw_line`
- `source_format`
- `parse_status`

Missing values are represented as `null`/empty based on parser context, then normalized.

## Supported Event Types

- `PROCESS_START`
- `PROCESS_END`
- `STEP_START`
- `STEP_END`
- `PARAMETER_READING`
- `ALARM`
- `WARNING`
- `STATE_CHANGE`
- `PROCESS_ABORT`
- `DRIFT_WARNING`

## Parameter Focus for Monitoring

- `temperature`
- `pressure`
- `rf_power`
- `gas_flow`
- `voltage`
- `current`
- `pump_speed`

## API Surface (MVP)

- `POST /api/upload`
- `POST /api/parse`
- `GET /api/runs`
- `GET /api/runs/{run_id}`
- `GET /api/runs/{run_id}/events`
- `GET /api/runs/{run_id}/summary`
- `GET /api/runs/{run_id}/timeseries`
- `GET /api/runs/{run_id}/timeline`
- `GET /api/runs/{run_id}/health`
- `GET /api/runs/{run_id}/drift`
- `POST /api/runs/{run_id}/mark-golden`
- `GET /api/golden/compare`
- `GET /api/runs/{run_id}/download/csv`
- `GET /api/runs/{run_id}/download/json`
- `POST /api/stream/start`
- `POST /api/stream/append`
- `POST /api/stream/finish`
- `GET /api/synthetic/{format_type}` (`json|xml|csv|kv|syslog|text|binary|hex`)

Notable parser updates:

- Confidence-scored format detection (`format + confidence`)
- RFC-aware syslog parsing (RFC5424 + RFC3164 patterns)
- Dedicated binary parser for struct-packed tool logs (with hex fallback)
- Synthetic log generator endpoints for all supported formats

## Security Controls

- Extension allowlist and upload size limits
- Sanitized server-side filenames and non-public upload storage
- Safe XML parsing (`defusedxml`)
- Strict schema-constrained LLM output handling
- Prompt-injection-aware LLM system prompts
- API key isolation via environment variables
- CSV formula injection mitigation on exports
- No dynamic code execution of uploaded payloads

## Additional Documentation

- `USER_GUIDE.md` - product usage guide for operators, judges, and non-specialists
- `DEVELOPER_GUIDE.md` - implementation guide for engineers extending parsers, services, and dashboards
