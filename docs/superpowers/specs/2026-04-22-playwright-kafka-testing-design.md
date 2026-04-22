# SmartLogParser — Playwright E2E Testing + Kafka Integration Design

**Date:** 2026-04-22  
**Author:** Bernard / SmartLogParser team  
**Status:** Approved — ready for implementation

---

## 1. Goals

1. **Demo reliability** — a single `npx playwright test` run proves the full demo story works end-to-end before presenting to judges.
2. **Quotable number** — "16 automated test scenarios pass" is a concrete engineering signal for the hackathon.
3. **Kafka integration** — adds a real streaming input path that William and Micron judges will recognise as production-relevant.
4. **CORS + Vercel wiring** — fix the localhost:8080 CORS gap and ensure the live Vercel deployment hits the real backend.

---

## 2. Files Created / Modified

### New files

```
playwright.config.ts                          ← project root
e2e/
  home.spec.ts
  upload-csv.spec.ts
  upload-json.spec.ts
  upload-parquet.spec.ts
  deduplication.spec.ts
  anomaly.spec.ts
  export.spec.ts
  api-health.spec.ts
  streaming.spec.ts
  ingestion.spec.ts
  bi-grafana.spec.ts
  odata.spec.ts
  kafka.spec.ts
frontend/src/test/
  format-detector.test.ts                     ← Vitest unit: detectFormat()
  normalization.test.ts                       ← Vitest unit: normalizeParam()
  api-client.test.ts                          ← Vitest unit: fetchRunAnomalies()
backend/app/services/kafka_service.py         ← Kafka consumer + producer adapter
backend/app/routes/kafka.py                   ← POST /api/kafka/consume, GET /api/kafka/status
docs/superpowers/specs/
  2026-04-22-playwright-kafka-testing-design.md  ← this file
```

### Modified files

```
backend/app/main.py                           ← add http://localhost:8080 to CORS origins
                                              ← register kafka router
backend/requirements.txt                      ← add kafka-python
frontend/package.json                         ← add test:e2e and test:e2e:ui scripts
                                              ← add @playwright/test devDependency
```

---

## 3. playwright.config.ts

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:8080',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: [
    {
      command: 'cd backend && python -m uvicorn app.main:app --port 8001',
      url: 'http://localhost:8001/health',
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: 'npm run dev',
      cwd: './frontend',
      url: 'http://localhost:8080',
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
});
```

**Notes:**
- `reuseExistingServer: true` — if you already have both services running, Playwright skips the startup step. Safe for both dev and CI.
- `retries: 1` — one retry on flaky test, keeps the suite green without masking real failures.
- `trace: 'on-first-retry'` — captures a trace file only when a test fails and retries, not on every run.

---

## 4. Test Scenarios (16 total)

### Group 1 — Upload & Parse (8 tests)

| File | Input | Key assertions |
|---|---|---|
| `home.spec.ts` | None | Page title contains "SmartLogParser"; upload dropzone visible; sidebar renders |
| `upload-csv.spec.ts` | `tests/metrology_etch_sensor.csv` | Format badge shows "csv"; Data tab table has ≥1 row; stability score > 0 visible |
| `upload-json.spec.ts` | `tests/vendor_a_dry_etch.json` | Format badge shows "json"; Overview event count > 0 |
| `upload-parquet.spec.ts` | `tests/vendor_b_parquet_sensor.parquet` | Format badge shows "parquet"; no error state; event count > 0 |
| `deduplication.spec.ts` | `tests/metrology_etch_sensor.csv` twice | API response on second upload: `duplicates_dropped > 0` (intercepted via `page.route()`) |
| `anomaly.spec.ts` | `tests/metrology_etch_sensor.csv` | Anomaly tab clickable; renders either "No anomalies" banner or anomaly table — no crash |
| `export.spec.ts` | `tests/metrology_etch_sensor.csv` | CSV download triggered (Playwright `download` event fires within 5 s) |
| `api-health.spec.ts` | None | `GET /health` → 200; body contains `{"status":"ok"}` |

### Group 2 — Streaming (1 test)

| File | Flow | Key assertions |
|---|---|---|
| `streaming.spec.ts` | `POST /api/stream/start` → `POST /api/stream/append` (3 CSV lines) → `POST /api/stream/finish` | Each step returns 200; finish response has `total_events > 0`; `run_id` consistent across all three calls |

### Group 3 — Ingestion inputs (1 test, 3 sub-scenarios)

| File | Endpoints tested | Key assertions |
|---|---|---|
| `ingestion.spec.ts` | `POST /api/ingest/sync/{tool_id}` | Returns 200 (mock fallback fires, no real ES required) |
| | `POST /api/ingest/logstash` with `{"message": "TEMP=120C PRESS=0.8Torr"}` | Returns 200; body has `run_id` |
| | `POST /api/ingest/webhook` with raw log string | Returns 200; body has `events` or `run_id` |

### Group 4 — BI & OData outputs (2 tests)

| File | Endpoints tested | Key assertions |
|---|---|---|
| `bi-grafana.spec.ts` | `GET /api/bi/events` | Returns 200; body has `events` array |
| | `GET /api/bi/timeseries` | Returns 200; body has `series` or `data` key |
| | `GET /api/bi/kpis` | Returns 200; body has `health_score` or `stability_score` |
| `odata.spec.ts` | `GET /odata/` | Returns 200; body contains `@odata.context` |
| | `GET /odata/$metadata` | Returns 200; Content-Type is `application/xml` |
| | `GET /odata/events?$top=5` | Returns 200; `value` array has ≤5 items |

### Group 5 — Kafka (1 test)

| File | Endpoints tested | Key assertions |
|---|---|---|
| `kafka.spec.ts` | `GET /api/kafka/status` | Returns 200; body has `status` key (either `"connected"` or `"kafka_unavailable"`) |
| | `POST /api/kafka/consume` with dummy broker config | Returns 200 or 503 — never a 500 crash; body has structured error message |

### Group 6 — Frontend unit tests / Vitest (3 tests)

| File | What it tests |
|---|---|
| `format-detector.test.ts` | `detectFormat()` returns correct type for JSON, CSV, XML, syslog, hex strings |
| `normalization.test.ts` | `normalizeParam()` maps `TEMP_C` → `temperature`, `Pressure` → `pressure`, unknown → lowercase |
| `api-client.test.ts` | `fetchRunAnomalies()` calls the correct URL and returns typed `AnomalyResponse` (mocked fetch) |

---

## 5. Kafka Integration

### `backend/app/services/kafka_service.py`

```python
# Two public functions:

def consume_and_parse(topic: str, bootstrap_servers: str, db: Session, max_messages: int = 100) -> dict:
    """
    Consume up to max_messages from a Kafka topic.
    Each message value is treated as a raw log string and passed through parse_file().
    Returns summary: {consumed, parsed, failed, run_ids}.
    Gracefully returns {status: "kafka_unavailable"} if broker is unreachable.
    """

def produce_events(events: list[dict], topic: str, bootstrap_servers: str) -> dict:
    """
    Publish a list of normalized event dicts to a Kafka topic as JSON messages.
    Returns {published, failed, status}.
    Gracefully returns {status: "kafka_unavailable"} if broker is unreachable.
    """
```

**Dependency:** `kafka-python` — pure Python, no JVM, free tier on Confluent Cloud.

**Graceful degradation:** Both functions catch `NoBrokersAvailable` and `KafkaError` and return a structured dict instead of raising. The endpoints never return 500 for a missing broker.

### `backend/app/routes/kafka.py`

```
GET  /api/kafka/status          → broker reachability check + configured topics
POST /api/kafka/consume         → body: {topic, bootstrap_servers, max_messages?}
                                → triggers consume_and_parse(), returns summary
POST /api/kafka/produce         → body: {run_id, topic, bootstrap_servers}
                                → publishes all events for run_id to output topic
```

### Slide 6 addition (Export-Compatible Integrations section)

> **Kafka** — consumer adapter (`kafka_service.py`) subscribes to a raw-log topic → existing parse pipeline. Producer publishes normalized events to a structured-events topic. Requires broker config (`KAFKA_BOOTSTRAP_SERVERS`) at deploy time.

---

## 6. CORS Fix

**File:** `backend/app/main.py`

Add `http://localhost:8080` to `_ALLOWED_ORIGINS`:

```python
_ALLOWED_ORIGINS = [
    "http://localhost:8080",   # ← add this (Vite dev server port)
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:3000",
    "http://127.0.0.1:8080",   # ← add this too
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    "http://127.0.0.1:3000",
]
```

**Why this was broken:** `vite.config.ts` runs the dev server on port 8080, but the CORS allowlist only included 5173/5174/3000. In local dev, every API call from the frontend was CORS-blocked.

---

## 7. Vercel Backend Wiring

The `vercel.json` already deploys the backend at `/_/backend`. To make the frontend point at it:

**Option A (recommended):** Add a rewrite rule in `vercel.json`:
```json
{
  "rewrites": [{ "source": "/api/:path*", "destination": "/_/backend/api/:path*" }]
}
```
Then set `VITE_API_URL=""` (empty string = relative URL) as a Vercel environment variable. No code change needed in `api.ts`.

**Option B (fallback):** Set `VITE_API_URL` in the Vercel dashboard to the full backend URL (`https://<your-deployment>.vercel.app/_/backend`). Requires knowing the deployment URL first.

---

## 8. package.json Scripts

Add to `frontend/package.json`:
```json
"test:e2e": "playwright test",
"test:e2e:ui": "playwright test --ui",
"test:e2e:report": "playwright show-report"
```

Add to devDependencies:
```json
"@playwright/test": "^1.44.0"
```

---

## 9. Slide Corrections (update in Canva)

| Slide | Current (wrong) | Fix |
|---|---|---|
| Slide 4 | "7 synthetic log files" | "8 synthetic log files" |
| Slide 8 (Sources) | No Parquet listed | Add "Parquet Files" to the sources grid |
| Slide 22 title | "STEP 8 — COMPUTE SUMMARY" | "STEP 8 — COMPUTE SUMMARY + ANOMALY DETECTION" |
| Slide 23 API example | `GET /api/summary/{run_id}` | `GET /api/runs/{run_id}/summary` |
| Slide 24 headline | *(new)* | Add large text: "8 format types. 1 unified schema. 0 lines silently discarded." |
| Slide 6 (Tech Stack) | Grafana/ES/Kibana/Splunk listed as built | Split into "Built & Demo-Ready" vs "Export-Compatible Integrations" (add Kafka to integrations) |

---

## 10. Out of Scope

- Alarm correlation clustering (60-second window grouping) — noted as roadmap on Slide 22, not implemented
- GitHub Actions CI badge — nice to have, not required for the hackathon deadline
- Kafka test container (real broker in tests) — mock/graceful-error approach is sufficient for demo
