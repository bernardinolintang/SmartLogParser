# Smart Semiconductor Tool Log Parser

A full-stack observability platform that transforms heterogeneous semiconductor equipment logs into structured machine events for analytics, process monitoring, and engineering investigation.

```
raw logs → format detection → parsing → normalization → validation → structured events → dashboards
```

---

## Quick Start (Recommended — Docker)

**Prerequisites:** Install [Docker](https://www.docker.com) — one time only, works on Windows, Mac, and Linux.

### First time

```sh
./setup.sh      # Mac/Linux
setup.bat       # Windows
```

Downloads the AI model (~10–20 min on first run, cached after that).

### Every time after

```sh
docker compose up
```

Open [http://localhost:8080](http://localhost:8080).

```sh
docker compose down    # to stop
```

### What runs

| Service | Port | Description |
|---------|------|-------------|
| Frontend | 8080 | React dashboard |
| Backend | 8001 | FastAPI — parse, store, query |
| Ollama | 11434 | Local AI — no data leaves your machine |

### Production vs Development

| | Development | Production |
|--|-------------|------------|
| Database | SQLite (default, zero-config) | Set `DATABASE_URL` to Supabase PostgreSQL |
| AI | Set `GROQ_API_KEY` for Groq cloud | Ollama runs automatically via Docker |

Copy `.env.example` to `.env` to configure.

---

## Manual Setup (no Docker)

Requirements: Node.js 18+, Python 3.11+

```sh
cp .env.example .env       # then edit — set GROQ_API_KEY at minimum
npm install
npm --prefix frontend install
cd backend && pip install -r requirements.txt && cd ..
npm run dev
```

- Frontend: `http://localhost:8080`
- Backend + Swagger UI: `http://localhost:8001/docs`

Aliases: `npm run dev:frontend`, `npm run dev:backend`

---

## Manufacturing Context

Semiconductor tools (plasma etch, CVD/PVD, lithography, metrology) produce high-volume vendor-specific logs that differ in syntax, field naming, and structure. Engineers cannot manually read these at scale. This platform automates the conversion so teams can monitor health, investigate alarms, and detect drift.

---

## Core Capabilities

- **Multi-format ingestion:** JSON, XML, CSV, key-value, syslog, text, hex, binary
- **Confidence-scored format detection** with ambiguity flag — runs marked `needs_review` when uncertain
- **Deterministic parsing** for structured formats, LLM fallback for partial/ambiguous lines
- **Dual LLM support:** Ollama (local, Docker) or Groq (cloud) — auto-selected
- **Physical limits validation** — readings outside known physical ranges flagged automatically
- **Parser version tracking** — every event stamped with the parser version that created it
- **Dead letter queue** — fully failed events stored separately, retryable up to 3 times
- **Vendor normalization** (`TEMP_C` → `temperature`, etc.)
- **Deduplication** within runs
- **Golden-run baseline** and drift detection
- **Streaming ingestion** simulation
- **Industrial bridge** — pull from Elasticsearch, push to Splunk HEC
- **BI connectors** — Grafana, Tableau, Power BI via PostgreSQL or REST

---

## Project Layout

```
SmartLogParser/
  backend/
    app/
      parsers/           Format-specific parsers (json, xml, csv, kv, syslog, text, hex, binary)
      services/          Pipeline orchestration, LLM, normalization, validation, Elastic, Splunk
      routes/            API endpoints
      utils/             Field mappings, physical limits
      models.py          ORM: Run, Event, FailedEvent, DriftAlert, RunSummary
      schemas.py         Pydantic I/O schemas
      config.py          Settings from .env
      security.py        Upload policy + CSV hardening
    Dockerfile
    requirements.txt
    sample_logs/
  frontend/
    src/
      components/
      pages/
      lib/api.ts
    Dockerfile
  docker-compose.yml
  setup.sh / setup.bat
  .env.example
  README.md
  USER_GUIDE.md
  DEVELOPER_GUIDE.md
```

---

## Canonical Event Schema

Every parser emits the same contract:

| Field | Notes |
|-------|-------|
| `run_id` | Upload session identifier |
| `timestamp` | ISO-like string |
| `fab_id`, `tool_id`, `chamber_id` | Equipment context |
| `tool_type` | etch / deposition / lithography / metrology |
| `lot_id`, `wafer_id` | Wafer tracking |
| `recipe_name`, `recipe_step` | Process context |
| `event_type` | See event types below |
| `parameter`, `value`, `unit` | Sensor reading |
| `alarm_code`, `severity` | info / warning / alarm / critical |
| `message` | Original message text |
| `raw_line`, `raw_line_number` | Source traceability |
| `parse_status` | ok / partial / low_confidence / failed |
| `parse_error` | Semicolon-separated error tokens |
| `parser_version` | Parser version that created this event |

**Event types:** `PROCESS_START`, `PROCESS_END`, `STEP_START`, `STEP_END`, `PARAMETER_READING`, `ALARM`, `WARNING`, `STATE_CHANGE`, `PROCESS_ABORT`, `DRIFT_WARNING`

---

## API Surface

### Ingestion

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/upload` | File upload (multipart) |
| POST | `/api/parse` | Parse raw content string |
| POST | `/api/stream/start` | Begin streaming session |
| POST | `/api/stream/append` | Append chunk |
| POST | `/api/stream/finish` | Finalize stream |
| POST | `/api/ingest/sync/{tool_id}` | Pull from Elasticsearch and parse |

### Run and analytics

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/runs` | List all runs |
| GET | `/api/runs/{run_id}` | Run detail (includes `needs_review`) |
| GET | `/api/runs/{run_id}/events` | Events with filters |
| GET | `/api/runs/{run_id}/alarms` | Alarm-severity events |
| GET | `/api/runs/{run_id}/summary` | Summary metrics |
| GET | `/api/runs/{run_id}/timeseries` | Parameter readings over time |
| GET | `/api/runs/{run_id}/timeline` | All events in order |
| GET | `/api/runs/{run_id}/health` | Health score |
| GET | `/api/runs/{run_id}/drift` | Drift alerts |

### Data quality

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/runs/{run_id}/failed` | Dead letter queue contents |
| POST | `/api/runs/{run_id}/retry-failed` | Retry failed events via LLM |
| GET | `/api/runs/{run_id}/reprocess-needed?min_version=X` | Find events older than parser version X |

### Baseline, export, BI

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/runs/{run_id}/mark-golden` | Mark as baseline |
| GET | `/api/golden/compare` | Compare against golden |
| GET | `/api/runs/{run_id}/download/csv` | Export as CSV |
| GET | `/api/runs/{run_id}/download/json` | Export as JSON |
| GET | `/api/bi/events` | BI flat events |
| GET | `/api/bi/timeseries` | BI timeseries |
| GET | `/api/bi/kpis` | BI KPIs |
| GET | `/api/synthetic/{format}` | Generate sample log for testing |

---

## External Integrations

| System | Status | How |
|--------|--------|-----|
| Supabase PostgreSQL | Production DB | Set `DATABASE_URL` in `.env` |
| Elasticsearch | Pull source | `POST /api/ingest/sync/{tool_id}` |
| Splunk HEC | Push target | Automatic after each Elasticsearch sync |
| Grafana | Dashboard | PostgreSQL datasource — see `docs/grafana_starter_queries.sql` |
| Tableau / Power BI | Dashboard | PostgreSQL connector or `/api/bi/*` REST |

---

## Security Controls

- Extension allowlist (`.json`, `.xml`, `.csv`, `.log`, `.txt`, `.kv`, `.hex`, `.bin`)
- Upload size limit enforced server-side
- Safe XML parsing via `defusedxml`
- LLM prompts instruct model to ignore instructions embedded in log content
- LLM output schema-validated before storage
- API keys and credentials in `.env` — never in frontend bundle
- CSV formula injection mitigation on all exports
- No `eval`/`exec` of uploaded content

---

## Additional Documentation

- [USER_GUIDE.md](USER_GUIDE.md) — usage guide for operators, judges, and non-specialists
- [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md) — architecture, extension points, API contracts, deployment
