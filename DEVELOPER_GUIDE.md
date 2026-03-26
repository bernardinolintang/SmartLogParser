# Smart Semiconductor Tool Log Parser — Developer Guide

Last updated: 2026-03-25

This guide is for software engineers extending or maintaining this platform. It covers architecture, parsing pipeline, schema contracts, LLM provider strategy, security boundaries, deployment, and extension points.

---

## 1. System Intent

This is an observability pipeline for semiconductor tool logs. It converts heterogeneous raw logs into a canonical event schema for:

- process monitoring and alarm forensics
- drift detection against golden baselines
- BI dashboard analytics (Grafana, Tableau, Power BI)
- industrial ingestion via Elasticsearch and Splunk

The design mirrors real fab data paths where multi-vendor tools emit inconsistent, high-volume telemetry.

---

## 2. Runtime Architecture

```
Frontend (React/Vite, port 8080)
  └─ Upload + dashboard UX
  └─ Calls REST API at :8001

Backend (FastAPI, port 8001)
  └─ Ingestion endpoints
  └─ Format detection (confidence-scored, ambiguity-aware)
  └─ Parser router → deterministic parsers
  └─ LLM fallback (Ollama local or Groq cloud)
  └─ Normalization + physical limits validation
  └─ Deduplication
  └─ Dead letter queue for failed events
  └─ Storage + summary metrics
  └─ Industrial bridge (Elasticsearch pull → Splunk push)

AI (Ollama, port 11434 — Docker only)
  └─ llama3.2 model, runs fully locally

Database
  └─ SQLite (default, zero-config)
  └─ PostgreSQL via Supabase (production — set DATABASE_URL)

Tables:
  runs           — one row per upload/stream session
  events         — parsed and validated events
  failed_events  — dead letter queue for events that could not be parsed
  drift_alerts   — computed drift deviations vs golden baseline
  run_summaries  — precomputed summary metrics per run
```

---

## 3. Deployment

### Docker (recommended)

```sh
docker compose up --build
```

Services: `backend` (8001), `ollama` (11434), `frontend` (8080).

First-time Ollama model pull (run once):

```sh
docker exec smartlogparser-ollama-1 ollama pull llama3.2
```

Or use the automated setup scripts in the project root:

```sh
./setup.sh    # Mac/Linux
setup.bat     # Windows
```

### Manual development

```sh
npm run dev           # starts both frontend (8080) and backend (8001)
npm run dev:backend   # backend only
npm run dev:frontend  # frontend only
```

### Environment

Copy `.env.example` to `.env`. Key variables:

| Variable | Default | Purpose |
|----------|---------|---------|
| `GROQ_API_KEY` | — | Groq cloud LLM (dev-friendly) |
| `OLLAMA_URL` | — | Ollama local LLM (Docker sets this automatically) |
| `LLM_MODEL` | `llama-3.3-70b-versatile` | Model name for either provider |
| `DATABASE_URL` | SQLite | PostgreSQL connection string for production |
| `MAX_UPLOAD_SIZE_MB` | `20` | Upload size cap |
| `SPLUNK_HEC_URL` / `SPLUNK_HEC_TOKEN` | — | Splunk HEC integration |
| `ELASTIC_URL` / `ELASTIC_USERNAME` / `ELASTIC_PASSWORD` / `ELASTIC_INDEX` | — | Elasticsearch integration |
| `PARSER_VERSION` | `1.1.0` | Stamped on every event at creation time |

---

## 4. Parsing Pipeline (Authoritative Flow)

```
upload / stream / elastic pull
  ↓
create run_id
  ↓
detect_format_with_confidence()
  → returns (format, confidence, ambiguous)
  → if confidence < 0.6 or ambiguous: run.needs_review = True
  ↓
deterministic parser for detected format
  ↓
[recovery] if no events: try all other parsers, then LLM format classification
  ↓
normalize_events()   — vendor aliases → canonical names
  ↓
validate_events()    — schema + type + physical plausibility
  ↓
enhance_partial_events()   — LLM re-parses partial rows in batches
  ↓
deduplicate_event_dicts()
  ↓
route: parse_status=="failed" → FailedEvent (dead letter queue)
       all others             → Event (stamped with parser_version)
  ↓
compute_summary()
```

---

## 5. Format Detection

`detect_format_with_confidence()` in [backend/app/services/format_detector.py](backend/app/services/format_detector.py) scores all candidates simultaneously:

| Format | Score signal |
|--------|-------------|
| json | 0.98 valid JSON / 0.4 looks-like-JSON but malformed |
| xml | 0.92 starts with `<?xml` / 0.85 has closing tags |
| csv | 0.5 base + 0.1 per recognized header column (up to 1.0) |
| kv | ratio of lines matching `^\w+=\S+` |
| syslog | 0.82 if RFC5424 or RFC3164 pattern matches |
| hex | 0.9 if >70% of tokens are valid 2-char hex |
| text | 0.5 constant fallback |

Returns `(format, confidence, ambiguous)` — a 3-tuple. `ambiguous=True` when the top two scores are within 0.15 of each other. `parser_service.py` sets `run.needs_review=True` when confidence < 0.6 or ambiguous, and stamps events with `parse_status="low_confidence"` for that run.

---

## 6. LLM Provider Strategy

`_get_provider()` in [backend/app/services/llm_service.py](backend/app/services/llm_service.py):

1. If `settings.ollama_url` is set → use **Ollama** (local, private)
2. Else if `settings.groq_api_key` is set → use **Groq** (cloud)
3. Else → log warning, skip LLM entirely

When running via Docker, `OLLAMA_URL=http://ollama:11434` is injected automatically by `docker-compose.yml`. No manual config needed.

LLM is called in two places:
- `parse_lines_with_llm()` — fallback for unstructured/partial lines
- `classify_log_format_with_llm()` — last-resort format classification

LLM output is treated as untrusted: parsed as JSON, schema-validated, then re-normalized and re-validated before storage.

---

## 7. Physical Limits Validation

`validate_physical_plausibility()` in [backend/app/utils/physical_limits.py](backend/app/utils/physical_limits.py) checks `PARAMETER_READING` events against known physical bounds.

Called inside `validate_events()` for every event. Out-of-range readings append `physically_implausible:{param}={value} outside [{min},{max}]{unit}` to `parse_error` and set `parse_status=partial`.

To add new parameters, extend the `PHYSICAL_LIMITS` dict:

```python
PHYSICAL_LIMITS: dict[str, tuple[float, float, str]] = {
    "temperature": (-273.15, 2000.0, "C"),
    # add new entry here
}
```

---

## 8. Dead Letter Queue

Events with `parse_status=="failed"` are routed to `FailedEvent` instead of `Event`:

```
FailedEvent columns:
  id, run_id, raw_line, raw_line_number,
  error, parser_version, retry_count, created_at, last_retry_at
```

Retry endpoint (`POST /api/runs/{run_id}/retry-failed`):
- Selects records with `retry_count < 3`
- Sends raw lines through LLM fallback
- On success: creates an `Event`, deletes the `FailedEvent`
- On failure: increments `retry_count`, updates `last_retry_at`

---

## 9. Parser Version Tracking

`settings.parser_version` (default `"1.1.0"`) is stamped on every `Event` and every `FailedEvent` at creation time.

To find events created by older parser versions (useful after bug fixes):

```
GET /api/runs/{run_id}/reprocess-needed?min_version=1.1.0
```

Returns `{ count, affected_run_ids }`.

To bump the version, change `PARSER_VERSION` in `.env` (or `parser_version` in `config.py`).

---

## 10. Canonical Event Schema

Every parser emits this contract:

| Field | Type | Notes |
|-------|------|-------|
| `run_id` | str | Links to Run |
| `timestamp` | str | ISO-like |
| `fab_id` | str | Default `FAB_01` |
| `tool_id` | str | Default `UNKNOWN` |
| `tool_type` | str | etch / deposition / lithography / metrology |
| `chamber_id` | str | Default `CH_A` |
| `module_id` | str | nullable |
| `lot_id` | str | nullable |
| `wafer_id` | str | nullable |
| `recipe_name` | str | nullable |
| `recipe_step` | str | nullable |
| `event_type` | str | see §11 |
| `parameter` | str | canonical name |
| `value` | str | raw string |
| `unit` | str | nullable |
| `alarm_code` | str | nullable |
| `severity` | str | info / warning / alarm / critical |
| `message` | text | original message |
| `raw_line` | text | source line for traceability |
| `raw_line_number` | int | nullable |
| `parse_status` | str | ok / partial / low_confidence / failed |
| `parse_error` | str | semicolon-separated error tokens |
| `parser_version` | str | version that created this event |

---

## 11. Event Types and Priority Parameters

**Event types:** `PROCESS_START`, `PROCESS_END`, `STEP_START`, `STEP_END`, `PARAMETER_READING`, `ALARM`, `WARNING`, `STATE_CHANGE`, `PROCESS_ABORT`, `DRIFT_WARNING`

**Parameters with physical limits enforcement:** `temperature`, `pressure`, `rf_power`, `gas_flow`, `humidity`, `voltage`, `current`

**Additional monitored parameters:** `pump_speed`, `flow_rate`, `bias_power`

---

## 12. Backend Module Map

```
backend/app/
  main.py                  FastAPI bootstrap and router registration
  config.py                Settings from .env (pydantic-settings)
  database.py              SQLAlchemy engine/session — SQLite + PostgreSQL pooling
  models.py                ORM: Run, Event, FailedEvent, DriftAlert, RunSummary
  schemas.py               Pydantic I/O schemas
  security.py              Upload allowlist + CSV formula injection mitigation

  parsers/
    json_parser.py         Nested process/step event extraction
    xml_parser.py          Safe tree traversal (defusedxml)
    csv_parser.py          Header-based row extraction
    kv_parser.py           key=value token parsing
    syslog_parser.py       RFC5424 + RFC3164 extraction
    text_parser.py         Pattern-based with partial tagging
    hex_parser.py          Decode then delegate to kv/text
    binary_parser.py       Struct-packed tool log decoding

  services/
    parser_service.py      Main orchestrator (detect → parse → normalize → validate → store)
    format_detector.py     Confidence-scored, ambiguity-aware format detection
    llm_service.py         Ollama + Groq provider, batch parsing, format classification
    normalization.py       Vendor alias → canonical name mapping
    validation.py          Schema, type, and physical limits validation
    deduplication.py       Fingerprint-based duplicate removal
    summary.py             Run summary metric computation
    elastic_ingestor.py    Elasticsearch pull with simulation fallback
    splunk_service.py      Splunk HEC push
    ingestion_bridge.py    Elastic → parser → Splunk orchestration

  routes/
    upload.py              POST /api/upload, POST /api/parse
    runs.py                Run queries, events, alarms, download, failed, retry, reprocess
    stream.py              POST /api/stream/*
    ingestion.py           POST /api/ingest/sync/{tool_id}
    golden.py              Mark golden, compare
    synthetic.py           GET /api/synthetic/{format}
    bi.py                  GET /api/bi/events|timeseries|kpis
    odata.py               GET /odata/ service doc, /odata/events, /odata/runs (OData v4)

  utils/
    mappings.py            PARAMETER_MAP, TOOL_TYPE_MAP, severity mappings
    physical_limits.py     PHYSICAL_LIMITS dict + validate_physical_plausibility()
```

---

## 13. API Surface

### Ingestion

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/upload` | Multipart file upload |
| POST | `/api/parse` | Parse raw content string |
| POST | `/api/stream/start` | Begin streaming session |
| POST | `/api/stream/append` | Append chunk to stream |
| POST | `/api/stream/finish` | Finalize stream |
| POST | `/api/ingest/sync/{tool_id}` | Pull from Elasticsearch and parse |

### Run and analytics

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/runs` | List all runs (includes `needs_review`) |
| GET | `/api/runs/{run_id}` | Run detail |
| GET | `/api/runs/{run_id}/events` | Events with filters (tool, chamber, severity, parameter) |
| GET | `/api/runs/{run_id}/alarms` | Alarm-level events only |
| GET | `/api/runs/{run_id}/summary` | Computed summary metrics |
| GET | `/api/runs/{run_id}/timeseries` | Parameter readings over time |
| GET | `/api/runs/{run_id}/timeline` | All events in timestamp order |
| GET | `/api/runs/{run_id}/health` | Health score + alarm/warning counts |
| GET | `/api/runs/{run_id}/drift` | Drift alerts for this run |

### Quality and error handling

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/runs/{run_id}/failed` | Dead letter queue contents |
| POST | `/api/runs/{run_id}/retry-failed` | Retry failed events via LLM |
| GET | `/api/runs/{run_id}/reprocess-needed?min_version=X` | Count events older than parser version X |

### Baseline and export

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/runs/{run_id}/mark-golden` | Mark run as baseline |
| GET | `/api/golden/compare` | Compare current run against golden |
| GET | `/api/runs/{run_id}/download/csv` | Export events as CSV |
| GET | `/api/runs/{run_id}/download/json` | Export events as JSON |

### BI and synthetic data

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/bi/events` | Flat events for BI connectors |
| GET | `/api/bi/timeseries` | Timeseries for BI connectors |
| GET | `/api/bi/kpis` | KPI aggregates |
| GET | `/api/synthetic/{format}` | Generate sample log (json/xml/csv/kv/syslog/text/binary/hex) |

---

## 14. Database Notes

### SQLite (default)

Zero configuration. Good for development and single-user demos. Not suitable for concurrent production load.

### PostgreSQL via Supabase

Set `DATABASE_URL=postgresql+psycopg://postgres:[password]@db.[project].supabase.co:5432/postgres`

Connection pooling is automatically configured: `pool_size=10`, `max_overflow=20`.

SQLAlchemy handles both backends transparently. `check_same_thread` is only set for SQLite; pool args are only set for PostgreSQL.

### Migrations

The system calls `Base.metadata.create_all()` at startup. This creates missing tables but does not run schema migrations. For production with existing data, use Alembic.

---

## 15. Extending the System

### Add a new vendor format

1. Add `{vendor}_parser.py` under `backend/app/parsers/`.
2. Register it in `_PARSER_MAP` in `parser_service.py`.
3. Add format heuristics (scoring logic) in `format_detector.py`.
4. Add vendor field normalization entries in `utils/mappings.py`.
5. Add sample logs under `backend/sample_logs/`.

### Add a new normalized parameter

Edit `utils/mappings.py`:

```python
PARAMETER_MAP = {
    "your_vendor_name": "canonical_name",
    ...
}
```

Optionally add physical limits in `utils/physical_limits.py`.

### Add a new dashboard tab

1. Add a backend endpoint that queries from stored events or aggregates.
2. Add a React component in `frontend/src/components/`.
3. Filter by the standard run dimensions: `tool_id`, `chamber_id`, `recipe_name`, `recipe_step`, `run_id`.

### Add a new external integration

Follow the pattern in `services/elastic_ingestor.py` + `services/ingestion_bridge.py`:

1. Implement a pull/push service under `services/`.
2. Add a route under `routes/`.
3. Register the router in `main.py`.

---

## 16. Security Requirements

All uploaded/ingested content is treated as untrusted.

| Control | Implementation |
|---------|---------------|
| Extension allowlist | `security.py` — only `.json`, `.xml`, `.csv`, `.log`, `.txt`, `.kv`, `.hex`, `.bin` |
| Upload size cap | `MAX_UPLOAD_SIZE_MB` env var |
| Safe XML parsing | `defusedxml` — entity expansion disabled |
| No code execution | Uploaded content is never `eval`'d or `exec`'d |
| LLM prompt hardening | System prompt explicitly instructs model to ignore log-embedded instructions |
| LLM output validation | Output re-normalized and re-validated before any DB write |
| Secret isolation | All keys/passwords in `.env` — never exposed to frontend |
| CSV injection mitigation | `sanitize_csv_value()` in `security.py` strips leading `=`, `+`, `-`, `@` |
| SQL injection | SQLAlchemy ORM with parameterized queries throughout |

---

## 17. Frontend Integration Notes

- `frontend/src/lib/api.ts` — backend transport layer and response type definitions
- `frontend/src/components/LogUpload.tsx` — handles upload and client-side fallback UX
- Dashboard components consume parsed event collections and run summaries
- The `needs_review` flag from run responses can be surfaced as a warning banner on the Overview tab
- `parser_version` is available per event in the Data tab for audit purposes

---

## 18. Integration Architecture

### Data Flow

```
INPUTS                          SMARTLOGPARSER                    OUTPUTS
------                          --------------                    -------
File Upload ──────────────────> Parser Pipeline ──────────────> SQLite / PostgreSQL
                                      |                               |
Elasticsearch ──(sync API)──────>     |                    ┌─────────┼─────────────┐
  └── Kibana (browse raw logs)        |                    v         v             v
                                      └─> FailedEvent   Grafana  Tableau      Power BI
                                          (dead letter)  (SQL)   (OData)      (OData)
                                               |
                                               └──> Splunk HEC (push)
```

### Elastic Stack Usage

| Component | Included | Purpose |
|-----------|----------|---------|
| **Elasticsearch** | Yes (Docker) | Stores raw fab logs; pulled by ingestion bridge |
| **Kibana** | Yes (Docker, port 5601) | Explore raw logs in Elasticsearch |
| **Logstash** | **No** | Not included — use `seed_data.py` to load logs directly |

This is an **EK** deployment (Elasticsearch + Kibana), not full ELK. To add Logstash, create a `logstash/` pipeline config in `docker-compose.yml` that reads from tool syslog and writes to `fab-logs-2026`.

### OData v4 Endpoint

`routes/odata.py` exposes a standards-compliant OData v4 feed consumed by Tableau and Power BI.

| URL | Returns |
|-----|---------|
| `GET /odata/` | Service document (entity list) |
| `GET /odata/$metadata` | EDMX XML schema |
| `GET /odata/events?$top=100&$filter=severity eq 'alarm'` | Filtered events |
| `GET /odata/runs` | All runs |

The `$metadata` route is handled by `ODataMetadataMiddleware` in `main.py` because FastAPI's router cannot match paths containing literal `$`.

---

## 19. Current Production Readiness Checklist

| Item | Status |
|------|--------|
| PostgreSQL support | Done — Supabase via `DATABASE_URL` |
| Local AI (no cloud dependency) | Done — Ollama via Docker |
| Elasticsearch ingestion | Done — `POST /api/ingest/sync/{tool_id}` |
| Kibana log exploration | Done — `http://localhost:5601` |
| Splunk HEC push | Done — automatic after each sync |
| Grafana dashboards | Done — PostgreSQL datasource |
| Tableau live connection | Done — OData v4 at `/odata/` |
| Power BI live connection | Done — OData v4 at `/odata/` |
| Dead letter queue + retry | Done |
| Parser version tracking | Done |
| Physical limits validation | Done |
| Confidence-scored format detection | Done |
| Docker deployment | Done |
| Logstash pipeline | Not yet |
| Async job queue for high-volume parsing | Not yet |
| Auth/authz and rate limiting | Not yet |
| Alembic migrations | Not yet — uses `create_all` at startup |
| Parser latency metrics | Not yet |
