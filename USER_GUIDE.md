# Smart Semiconductor Tool Log Parser — User Guide

Version: 1.2
Last updated: 2026-03-25

This guide is written for:

- operators and process engineers using the platform day-to-day
- hackathon judges reviewing practical business value
- new engineers onboarding to tool-log analytics workflows

## Table of Contents

1. [What This Product Is](#what-this-product-is)
2. [Why This Matters in Semiconductor Manufacturing](#why-this-matters-in-semiconductor-manufacturing)
3. [Before You Start](#before-you-start)
4. [Quick Start](#quick-start)
5. [Supported Log Types](#supported-log-types)
6. [Step-by-Step: What Happens After Upload](#step-by-step-what-happens-after-upload)
7. [How to Use Each Dashboard](#how-to-use-each-dashboard)
8. [Golden Run and Drift Detection](#golden-run-and-drift-detection)
9. [Streaming Simulation](#streaming-simulation)
10. [Industrial Ingestion via Elasticsearch](#industrial-ingestion-via-elasticsearch)
11. [Quality Indicators: Confidence, Needs Review, and Parser Version](#quality-indicators)
12. [Failed Events and Retry](#failed-events-and-retry)
13. [Troubleshooting](#troubleshooting)
14. [FAQ](#faq)
15. [Security and Data Handling Notes](#security-and-data-handling-notes)
16. [Glossary](#glossary)

---

## What This Product Is

Semiconductor equipment logs are large, inconsistent, and difficult to read directly.
This product converts raw machine logs into clean, structured events and visual dashboards.

In plain words:

1. You upload a raw machine log (or trigger a pull from Elasticsearch).
2. The system determines its format automatically.
3. It extracts key information: tool, chamber, parameter, alarms, step, time.
4. Physical limits are checked — readings outside plausible ranges are flagged.
5. Results appear in dashboards for faster troubleshooting and decisions.

---

## Why This Matters in Semiconductor Manufacturing

In fab operations, a single incident can involve:

- multiple tools and chambers
- different log formats from different vendors
- missing fields in some lines
- alarms appearing before or after parameter drift

Without structure, engineers spend time manually searching text files.
This platform reduces that manual work and helps teams move from "raw text" to "actionable insights."

---

## Before You Start

### Option A — Docker (recommended, no Node.js or Python required)

Install [Docker](https://www.docker.com) once. Then:

- **Mac/Linux:** run `./setup.sh` in the project root
- **Windows:** double-click `setup.bat` or run it in Command Prompt

First run downloads the AI model (10–20 minutes). Subsequent starts take a few seconds.

After first setup, start with:

```sh
docker compose up
```

Open [http://localhost:8080](http://localhost:8080).

### Option B — Manual setup

Requirements:

- Node.js 18+
- Python 3.11+

Configure environment:

1. Copy `.env.example` to `.env`
2. Set at minimum one of:
   - `GROQ_API_KEY` — cloud AI, good for development
   - `OLLAMA_URL=http://localhost:11434` — local AI, no data leaves your machine
3. Optionally set `DATABASE_URL` to a Supabase PostgreSQL connection string (defaults to local SQLite)
4. Keep `.env` local only — do not commit it

---

## Quick Start

### Docker

```sh
# First time (downloads AI model, takes 10-20 min)
./setup.sh        # Mac/Linux
setup.bat         # Windows

# Every time after that
docker compose up
```

Open [http://localhost:8080](http://localhost:8080).

### Manual

```sh
npm install
npm --prefix frontend install
npm run dev
```

Open:

- Frontend: `http://localhost:8080`
- Backend API docs: `http://localhost:8001/docs`

---

## Supported Log Types

| Format | Description |
|--------|-------------|
| JSON | Structured process/event objects |
| XML | Recipe/step hierarchy from EDA tools |
| CSV | Tabular sensor exports |
| Key-Value | `param=value` line logs |
| Syslog | RFC3164 and RFC5424 patterns |
| Plain Text | Free-form log lines |
| Hex | Hex-encoded binary tool output |
| Binary (`.bin`) | Struct-packed tool logs |

The format is detected automatically from content — you do not need to tell the system what type your file is.

---

## Step-by-Step: What Happens After Upload

### Step 1 — Upload and run creation

A unique `run_id` is created for every upload. All events, alarms, and dashboard data are tied to it.

### Step 2 — Format detection

The backend inspects content patterns and bytes (not file extension).
It scores all possible formats simultaneously and picks the highest confidence match.

Output: `format`, `confidence` (0–1), and an `ambiguous` flag when two formats score similarly.

If confidence is below 0.6 or the result is ambiguous, the run is flagged `needs_review = true`.
Parsing still continues — the flag is a signal to verify results.

### Step 3 — Parser routing and extraction

The file is routed to the correct deterministic parser.
Each parser extracts: timestamp, tool/chamber context, recipe/step, parameter/value, alarms, severity, and the original raw line for traceability.

### Step 4 — Recovery and fallback

If the initial parse produces weak or empty results:

1. All other deterministic parsers are tried automatically.
2. If still uncertain, the AI (Ollama or Groq) classifies the format and re-parses ambiguous lines.

### Step 5 — Normalization

Vendor-specific field names are mapped to canonical names:

- `TEMP_C`, `Temp`, `temperature` → `temperature`
- `PRESSURE_TORR`, `Pressure` → `pressure`
- `RFPOWER`, `rf_power_w` → `rf_power`

This is required for cross-vendor comparison to work.

### Step 6 — Physical limits validation

Every `PARAMETER_READING` event is checked against known physical limits:

| Parameter | Valid range | Unit |
|-----------|-------------|------|
| temperature | −273.15 to 2000 | °C |
| pressure | 0 to 10,000 | Torr |
| rf_power | 0 to 10,000 | W |
| gas_flow | 0 to 50,000 | sccm |
| humidity | 0 to 100 | % |
| voltage | −10,000 to 10,000 | V |
| current | −1,000 to 1,000 | A |

Readings outside range are flagged in `parse_error` as `physically_implausible` and marked partial.

### Step 7 — Validation

Events are validated for:

- timestamp format
- numeric value for `PARAMETER_READING` events
- tool ID presence
- physical plausibility (see Step 6)

Uncertain rows are marked `parse_status=partial` — the run continues, nothing is silently dropped.

### Step 8 — Dead letter queue

Events that fully fail to parse are separated into a dead letter queue (`failed_events` table) rather than stored alongside good data.
They can be retried later via the API (up to 3 attempts per event).

### Step 9 — Deduplication

Duplicate events within the same run are dropped. Counts are reported in the parse result.

### Step 10 — Storage and summary

Events are stored in the database tagged with:

- `parser_version` — which version of the parser created them
- `parse_status` — `ok`, `partial`, `low_confidence`, or `failed`

Summary metrics (alarm count, warning count, stability score, tool/chamber/recipe lists) are computed and stored.

### Step 11 — Dashboard output

The frontend receives parsed events, format label and confidence, needs_review flag, summary cards, and trend/timeline data.

---

## How to Use Each Dashboard

| Tab | Purpose |
|-----|---------|
| Overview | First triage — status, alarm volume, run scope, confidence indicator |
| Data | Detailed event table with parse_status per row |
| Trends / Analytics | Parameter behavior over time |
| Recipe / Timeline | Step-by-step process progression |
| Alarms / Anomaly | Incident-focused investigation |
| Health | Tool and chamber stability snapshot |
| Golden Run | Baseline comparison for drift |
| Raw Log | Source traceability — original lines vs parsed output |
| Report | Shareable summary for handoff and reviews |
| Architecture | Visual explanation of the pipeline |

Use this workflow left to right for a new run: Overview → Alarms → Trends → Raw Log.

---

## Golden Run and Drift Detection

1. Mark a known-stable run as golden via the run detail page.
2. Compare any subsequent run against the golden baseline.
3. Review deviations by parameter, tool, and chamber.
4. Investigate high-deviation items in Trends and Raw Log.

Drift often appears before hard alarm thresholds — catching it early reduces downtime.

---

## Streaming Simulation

For near-real-time ingestion behavior:

1. Start a stream session via `POST /api/stream/start`
2. Append log chunks with `POST /api/stream/append`
3. Parse and merge continuously
4. Finish with `POST /api/stream/finish`

This simulates continuous fab telemetry ingestion without requiring a live tool connection.

---

## Industrial Ingestion via Elasticsearch

The platform can pull logs directly from an Elasticsearch cluster.

### With a real Elasticsearch

Set in `.env`:

```
ELASTIC_URL=https://your-cluster.es.io:9200
ELASTIC_USERNAME=elastic
ELASTIC_PASSWORD=your-password
ELASTIC_INDEX=fab-logs-2026
```

Then trigger a pull:

```sh
curl -X POST http://localhost:8001/api/ingest/sync/TOOL_001
```

### Without Elasticsearch (simulation mode)

No configuration needed. If Elasticsearch is unreachable, the system automatically switches to mock log data and processes it through the full pipeline. This produces real runs in the dashboard.

---

## Quality Indicators

Three signals help you assess result reliability:

| Indicator | Location | Meaning |
|-----------|----------|---------|
| `format_confidence` | Run overview | 0–1 score for format detection certainty |
| `needs_review` | Run list and detail | True when confidence < 0.6 or two formats scored similarly |
| `parser_version` | Per event in Data tab | Which parser version created this event |

When `needs_review` is true, verify results in the Raw Log tab before relying on them for engineering decisions.

### Finding runs that need reprocessing after a parser update

If a bug is fixed in a new parser version, you can find affected events:

```sh
GET /api/runs/{run_id}/reprocess-needed?min_version=1.1.0
```

Returns the count and list of run IDs with events created by older parser versions.

---

## Failed Events and Retry

Events that could not be parsed at all are stored in a dead letter queue instead of being mixed with good data.

View them:

```sh
GET /api/runs/{run_id}/failed
```

Retry them (AI fallback, up to 3 attempts per event):

```sh
POST /api/runs/{run_id}/retry-failed
```

Returns `{ "succeeded": N, "still_failing": M }`. Successfully recovered events are moved to the main events table.

---

## Troubleshooting

| Problem | What to check |
|---------|---------------|
| UI cannot load data | Confirm backend is running — check `http://localhost:8001/docs` |
| Upload rejected | Verify file extension is in the allowed list and size is within limit |
| Blank or empty charts | Check if the run has `PARAMETER_READING` events; loosen filters |
| Values look wrong | Compare Raw Log against Data table — look for unit/naming differences |
| Run marked `needs_review` | Low format confidence — verify in Raw Log tab |
| Run has partial rows | Expected for missing/ambiguous lines — check `parse_error` column |
| Docker: `setup.sh` hangs | Confirm Docker is running; try `docker compose logs ollama` to check |
| Elasticsearch not connecting | System falls back to simulation — check logs for `Switching to Simulation Mode` |

---

## FAQ

**Q: What if my file has missing fields?**
The system does not fail the run. Rows with missing fields are marked `partial` and kept. The run completes with available data.

**Q: Does the system use AI for every line?**
No. Deterministic parsing is primary. AI is only used for lines that the deterministic parsers could not handle.

**Q: Which AI provider is used?**
When running via Docker, Ollama runs locally — no data leaves your machine. When configured manually, Groq cloud API is used if `GROQ_API_KEY` is set. Ollama takes priority if `OLLAMA_URL` is also set.

**Q: Can I compare two runs?**
Yes. Use the Golden Run comparison and drift views.

**Q: How do I verify parser correctness?**
Use the Raw Log and Data tabs side by side. Check exact mapped values against source lines.

**Q: Can I test without real fab logs?**
Yes. Use the synthetic log endpoints: `GET /api/synthetic/{format}` where format is `json`, `xml`, `csv`, `kv`, `syslog`, `text`, `binary`, or `hex`.

**Q: What database does this use?**
SQLite by default (no setup needed). For production, set `DATABASE_URL` to a Supabase PostgreSQL connection string.

---

## Security and Data Handling Notes

- Uploads are treated as untrusted input at all stages.
- Only approved file extensions are accepted (allowlist enforced).
- File size limits are enforced server-side.
- XML parsing uses a safe configuration (`defusedxml`) — no entity expansion.
- LLM prompts explicitly instruct the model to ignore instructions in log content.
- API keys and database credentials stay in `.env` on the backend — never exposed to the frontend.
- Raw lines are preserved in the database for full audit traceability.
- CSV exports are sanitized against formula injection.

---

## Glossary

| Term | Definition |
|------|------------|
| Run | One upload/processing session with its own `run_id` |
| Event | One structured record extracted from a raw log line |
| Normalization | Mapping vendor-specific field names to canonical names |
| Partial row | A row with missing or uncertain fields, kept for context |
| Golden run | A known-good baseline used for drift comparison |
| Drift | Measurable deviation of a parameter from baseline behavior |
| Dead letter queue | Storage for events that fully failed to parse, pending retry |
| Parser version | Version tag stamped on each event indicating which parser created it |
| Needs review | Flag on a run when format detection confidence was low or ambiguous |
| Physically implausible | A reading outside the known valid range for that parameter type |
