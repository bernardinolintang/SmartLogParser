# Smart Semiconductor Tool Log Parser

A full-stack observability platform that transforms heterogeneous semiconductor equipment logs into structured machine events for analytics, process monitoring, and engineering investigation.

```
raw logs → format detection → parsing → normalization → validation → structured events → dashboards
```

**Live demo:** [https://smart-log-parser.vercel.app](https://smart-log-parser.vercel.app)

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

### Services

| Service | Port | Description |
|---------|------|-------------|
| Frontend | 8080 | React dashboard |
| Backend | 8001 | FastAPI — parse, store, query |
| Elasticsearch | 9200 | Fab log storage and upstream indexing |
| Kibana | 5601 | Log search & visualisation UI |
| Grafana | 3030 | Metrics dashboards (PostgreSQL / BI API) |
| Ollama | 11434 | Local AI — no data leaves your machine |
| Logstash | — | Optional fab-to-backend forwarding pipeline |

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

- **Multi-format ingestion:** JSON, XML, CSV, key-value, syslog, text, hex, binary, **Parquet** — 9 formats, 1 unified schema, 0 events silently discarded
- **Multi-vendor schema adapters** — SEMI/GEM ControlJob nesting, Parquet/data-lake, flat-row, step-structured, and generic KV formats
- **Confidence-scored format detection** with ambiguity flag — runs marked `needs_review` when uncertain
- **Deterministic parsing** for structured formats, LLM fallback for partial/ambiguous lines
- **Dual LLM support:** Ollama (local, Docker) or Groq (cloud) — auto-selected
- **Physical limits validation** — readings outside known physical ranges flagged automatically
- **Statistical anomaly detection** — Z-score (|z| > 2.5), rolling-mean drift (window=10), alarm cascade, timestamp gaps/reversals, corrupt and missing fields — 7 types total
- **Parser version tracking** — every event stamped with the parser version that created it
- **Dead letter queue** — fully failed events stored separately with `failed_event_count` reported on every parse
- **Vendor normalization** (`TEMP_C` → `temperature`, etc.)
- **Deduplication** within runs
- **Golden-run baseline** and parameter drift detection
- **Background streaming** — simulation or live backend session that keeps running while you navigate other pages; live event count always visible in the top bar
- **Elasticsearch upload indexing** — optionally index parsed events on upload for Kibana/Grafana workflows
- **Industrial bridge** — pull from Elasticsearch, push to Splunk HEC, Kafka consumer/producer
- **BI connectors** — Grafana (PostgreSQL direct or `/api/bi/*`), Tableau & Power BI (OData v4), Kibana

---

## Dashboard Views

The frontend has 17 views accessible from the sidebar:

| Tab | Group | Description |
|-----|-------|-------------|
| Upload | Ingest | Drop or click to upload; auto-detect format; client or backend parse |
| History | Ingest | Previous uploads stored in localStorage |
| Streaming | Ingest | Background real-time ingestion simulation; LIVE indicator in top bar |
| Overview | Monitor | Summary cards + equipment tree view |
| Health | Monitor | Tool health scores, alarm rates, maintenance indicators |
| Data | Analyze | Full event table with column filters |
| Analytics | Analyze | Event distribution, severity breakdown, parameter statistics |
| Trends | Analyze | Time-series sensor readings per tool/chamber |
| Recipe | Analyze | Step-by-step recipe execution timeline |
| Alarms | Investigate | Alarm investigation — context, parameter before trigger, timeline |
| Anomaly | Investigate | 7-type anomaly detection (Z-score, drift, cascade, gaps, reversals, corrupt, missing) |
| Golden Run | Investigate | Save a known-good baseline and compare any run against it |
| Raw Log | Tools | Original log content with event alignment markers |
| Report | Tools | Exportable engineer narrative report |
| Compare | Tools | Cross-vendor side-by-side log comparison |
| Architecture | Tools | System architecture diagram |
| Profile | — | User profile (name, avatar, colour) stored in localStorage |

### Built-in sample logs

13 sample scenarios available directly in the Upload tab — no file needed:

| Sample | Format | Scenario |
|--------|--------|----------|
| `etch_tool_json.json` | JSON | Etch tool with nested ProcessSteps |
| `deposition_csv.csv` | CSV | CVD deposition sensor trace |
| `euv_scanner_syslog.log` | Syslog | EUV scanner with alarms |
| `metrology_kv.log` | Key-Value | CD/overlay metrology readings |
| `binary_hex.log` | Hex | Binary packed ETCH_TOOL_06 payload |
| `plasma_etch_01.json` | JSON | Flat-row plasma etch with SECS/GEM event types |
| `pvd_sputter_01.csv` | CSV | PVD sputter deposition with temperature alarm |
| `euv_scanner_02.log` | Key-Value | EUV scanner with reticle align and exposure steps |
| `ald_tool_01.kv` | Key-Value | ALD tool precursor dose cycles |
| `etch_tool_06_binary.hex` | Hex | HEX_PACKED_V2 binary event stream |
| `secs_gem_drift.log` | Text | SECS/GEM — gradual thermal drift + duplicate block IDs *(ANOMALY)* |
| `pvd_alarm_flapping.csv` | CSV | PVD alarm flapping, stuck alarms, severity downgrade *(ANOMALY)* |
| `multi_chamber_etch.json` | JSON | Multi-chamber etch — CH_A and CH_B simultaneously |

---

## Project Layout

```
SmartLogParser/
  backend/
    app/
      parsers/       json, xml, csv, kv, syslog, text, hex, binary, parquet
      services/      parser_service, format_detector, normalization, validation,
                     llm_service, deduplication, summary, anomaly_service,
                     golden_run, elastic_ingestor, splunk_service,
                     ingestion_bridge, kafka_service
      routes/        upload, runs, dashboards, stream, synthetic, bi, ingestion, odata, kafka
      utils/         field mappings, physical limits
      models.py      ORM: Run, Event, FailedEvent, DriftAlert, RunSummary
      schemas.py     Pydantic I/O schemas
      config.py      Settings from .env
      security.py    Upload policy + CSV hardening
    Dockerfile
    requirements.txt
    sample_logs/
  frontend/
    src/
      components/    17 feature components + 48 shadcn/ui primitives
      contexts/      StreamingContext (background streaming provider)
      pages/         Index (main app), NotFound
      lib/
        api.ts       Backend API client
        logParser.ts Client-side parser (7 formats) + streaming event generator
    Dockerfile
  e2e/
    ux-audit.spec.ts  Playwright UX audit suite
  logstash/
    pipeline/        fab-forwarder.conf — Logstash → SmartLogParser pipeline
  docker-compose.yml
  setup.sh / setup.bat
  seed_data.py       Seed Elasticsearch with sample fab events
  .env.example
  playwright.config.ts
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
| POST | `/api/parse` | Parse file and return normalized events (`?store_to_elastic=true\|false`) |
| POST | `/api/stream/start` | Begin streaming session |
| POST | `/api/stream/append` | Append CSV chunk |
| POST | `/api/stream/finish` | Finalize stream, compute summary |
| POST | `/api/ingest/sync/{tool_id}` | Pull from Elasticsearch and parse |
| POST | `/api/ingest/splunk-webhook` | Receive Splunk webhook payload |
| POST | `/api/ingest/logstash` | Receive single Logstash event |
| POST | `/api/ingest/logstash/batch` | Receive Logstash batch |
| POST | `/api/ingest/webhook` | Generic webhook ingestion |

### Run and analytics

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/runs` | List all runs |
| GET | `/api/runs/{run_id}` | Run detail (includes `needs_review`) |
| GET | `/api/runs/{run_id}/events` | Events with filters |
| GET | `/api/runs/{run_id}/alarms` | Alarm-severity events |
| GET | `/api/runs/{run_id}/summary` | Summary metrics |
| GET | `/api/runs/{run_id}/anomalies` | 7-type anomaly detection results |
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
| GET | `/api/synthetic/{format}` | Generate synthetic sample log (json, xml, csv, kv, syslog, text, hex, binary) |

### OData v4 (Tableau & Power BI live feed)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/odata/` | OData service document |
| GET | `/odata/$metadata` | OData schema (EDMX XML) |
| GET | `/odata/events` | Live events feed (supports `$top`, `$skip`, `$filter`) |
| GET | `/odata/runs` | Live runs feed |

### Kafka

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/kafka/status` | Broker connection status |
| POST | `/api/kafka/consume` | Consume messages from topic and parse |
| POST | `/api/kafka/produce` | Produce test events to topic |

---

## External Integrations

### Inputs (data flows INTO SmartLogParser)

| System | Role | How to Activate |
|--------|------|-----------------|
| File Upload | Primary input | Upload via `http://localhost:8080` |
| Elasticsearch | Pull source | Set `ELASTIC_URL` in `.env` → `POST /api/ingest/sync/{tool_id}` |
| Kafka | Stream source | Set `KAFKA_BOOTSTRAP_SERVERS` in `.env` → `POST /api/kafka/consume` |
| Splunk Webhook | Push receiver | Send HEC-formatted data to `POST /api/ingest/splunk-webhook` |
| Logstash | Pipeline forwarder | Configure `logstash/pipeline/fab-forwarder.conf` to point at backend |

### Outputs (data flows OUT of SmartLogParser)

| System | Role | How to Activate |
|--------|------|-----------------|
| Elasticsearch | Upload indexing | Toggle "Store to Elasticsearch" in Upload or `?store_to_elastic=true` |
| Splunk HEC | Push target | Set `SPLUNK_HEC_URL` + `SPLUNK_HEC_TOKEN` in `.env` |
| Grafana | Dashboard | Connect to Supabase PostgreSQL → `docs/grafana_starter_queries.sql`, or use `/api/bi/*` |
| Tableau | Live dashboard | OData → `http://localhost:8001/odata/` |
| Power BI | Live dashboard | OData → `http://localhost:8001/odata/` |
| Kibana | Log search UI | Browse index at `http://localhost:5601` |
| CSV / JSON | File export | `GET /api/runs/{run_id}/download/csv` or `/download/json` |

### Elastic Stack

| Component | Role |
|-----------|------|
| **Elasticsearch** | Stores fab logs; receives parsed upload events (optional) |
| **Kibana** | Web UI to search and visualise Elasticsearch data |
| **Logstash** | Optional — `logstash/pipeline/fab-forwarder.conf` bridges external logs into the backend |

---

## Testing

```sh
# Frontend unit tests
cd frontend
npm test

# E2E UX audit (Playwright)
npx playwright test e2e/ux-audit.spec.ts
```

---

## Security Controls

- Extension allowlist (`.json`, `.xml`, `.csv`, `.log`, `.txt`, `.kv`, `.hex`, `.bin`, `.parquet`)
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
