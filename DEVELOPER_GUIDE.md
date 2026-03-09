# Smart Semiconductor Tool Log Parser - Developer Guide

This guide is written for software engineers extending semiconductor manufacturing analytics systems. It explains architecture, parser orchestration, schema contracts, security boundaries, and extension points.

## 1) System Intent

This platform is an observability pipeline for semiconductor tool logs. It turns heterogeneous raw logs into canonical machine events suitable for:

- process monitoring
- alarm forensics
- drift detection
- dashboard analytics

The design intentionally mirrors industrial data paths in fabs where multi-vendor tools emit inconsistent, high-volume telemetry.

## 2) Runtime Architecture

```
Frontend (React/Vite)
  -> Upload + Dashboard UX
  -> Calls REST API

Backend (FastAPI)
  -> Ingestion
  -> Format Detection
  -> Parser Router
  -> Deterministic Parsers
  -> LLM Fallback Parser (Groq, constrained)
  -> Normalization + Validation
  -> Storage + Metrics

Database (SQLite for MVP)
  -> runs
  -> events
  -> drift_alerts
  -> run_summaries
```

## 3) Parsing Pipeline (Authoritative Flow)

Each upload/stream batch follows this sequence:

1. **Create run context** (`run_id`)
2. **Detect format** (`json|xml|csv|kv|syslog|text|hex`)
3. **Route to parser**
4. **Deterministic extraction** where feasible
5. **LLM fallback** only for partial/ambiguous records
6. **Normalize vendor fields** to canonical names
7. **Validate schema and types**
8. **Persist events**
9. **Compute run summary metrics**

## 4) Deterministic vs LLM Strategy

### Deterministic-first policy

- JSON, XML, CSV, key-value, syslog are parsed via explicit logic.
- Text/unknown content first passes rule-based extraction.
- Any row with low confidence is marked `parse_status=partial`.

### LLM fallback policy

- Only `partial` rows are sent to LLM in bounded batches.
- LLM is prompted for strict JSON schema output.
- Log content is treated as untrusted data.
- Output is normalized and revalidated before persistence.

This hybrid model optimizes cost, reliability, and interpretability.

## 5) Canonical Event Contract

Core schema (logical contract):

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

Operationally implemented fields additionally include trace/metadata such as `tool_type`, `module_id`, `raw_line_number`, and `parse_error`.

## 6) Event Types and Parameter Priority

### Event types

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

### Parameters prioritized in dashboards

- `temperature`
- `pressure`
- `rf_power`
- `gas_flow`
- `voltage`
- `current`
- `pump_speed`

## 7) Backend Module Map

```
backend/app/
  main.py                 FastAPI bootstrap and router registration
  config.py               Runtime settings from .env
  database.py             SQLAlchemy engine/session/init
  models.py               ORM models for runs/events/drift/summaries
  schemas.py              Pydantic schemas
  security.py             Upload policy + CSV export hardening
  parsers/                Format parsers
  services/               Pipeline orchestration and business logic
  routes/                 API endpoints
  utils/                  Mappings, unit parsing, helpers
```

## 8) Parser Responsibilities

- `json_parser.py`: nested process/step extraction
- `xml_parser.py`: safe XML tree traversal (`defusedxml`)
- `csv_parser.py`: header-based event row extraction
- `kv_parser.py`: `key=value` token parsing with context separation
- `syslog_parser.py`: timestamp/category/payload extraction
- `text_parser.py`: pattern-based extraction with partial tagging
- `hex_parser.py`: decode then delegate to KV/text logic

## 9) API Surface

### Ingestion

- `POST /api/upload`
- `POST /api/parse`
- `POST /api/stream/start`
- `POST /api/stream/append`
- `POST /api/stream/finish`

### Run and analytics retrieval

- `GET /api/runs`
- `GET /api/runs/{run_id}`
- `GET /api/runs/{run_id}/events`
- `GET /api/runs/{run_id}/alarms`
- `GET /api/runs/{run_id}/summary`
- `GET /api/runs/{run_id}/timeseries`
- `GET /api/runs/{run_id}/timeline`
- `GET /api/runs/{run_id}/health`
- `GET /api/runs/{run_id}/drift`

### Baseline and export

- `POST /api/runs/{run_id}/mark-golden`
- `GET /api/golden/compare`
- `GET /api/runs/{run_id}/download/csv`
- `GET /api/runs/{run_id}/download/json`

## 10) Frontend Integration Notes

Frontend entry points:

- `frontend/src/lib/api.ts`: backend transport layer
- `frontend/src/components/LogUpload.tsx`: backend/client fallback logic
- dashboard components consume parsed event collections and summaries

The UI is intentionally observability-first: overview, alarms, trends, health, raw traceability, and architecture narrative.

## 11) One-Command Development

From project root:

```sh
npm run dev
```

This runs:

- FastAPI backend on `:8000`
- Vite frontend on `:8080`

Auxiliary scripts:

- `npm run dev:backend`
- `npm run dev:frontend`

## 12) Extending the System

### Add a new vendor format

1. Add parser under `backend/app/parsers/`.
2. Register parser in parser map(s).
3. Add format heuristics in `format_detector`.
4. Add normalization mappings for vendor field variants.
5. Add sample logs + tests.

### Add new normalized parameters

Update `backend/app/utils/mappings.py`:

- `PARAMETER_MAP`
- event mapping tables if required
- severity/alert mappings when relevant

### Add new dashboard features

1. Add API endpoint from stored events/aggregates.
2. Add component in `frontend/src/components/`.
3. Reuse run filtering dimensions (`tool/chamber/recipe/step/run_id`).

## 13) Security Requirements

Treat all logs as untrusted payloads.

Mandatory controls:

- extension allowlist and upload size limits
- safe XML parser configuration
- no dynamic execution of uploaded content
- strict LLM schema constraints and output validation
- API validation for request bodies and query params
- backend-only secret handling (`.env`, never frontend)
- CSV formula-injection mitigation

## 14) Environment Variables

- `GROQ_API_KEY`: enables LLM fallback parsing
- `DATABASE_URL`: optional SQLAlchemy override
- `MAX_UPLOAD_SIZE_MB`: upload guardrail

## 15) Roadmap for Productionization

- replace SQLite with PostgreSQL
- add async job queue for high-volume parsing
- add authz/authn and rate-limits
- add metrics/observability for parser latency and fallback usage
- add integration adapters (Splunk, Elastic, Kafka, Grafana)
