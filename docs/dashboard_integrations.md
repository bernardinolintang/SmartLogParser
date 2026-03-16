# Dashboard Integrations (Grafana, Tableau, Power BI)

This project now supports a BI integration flow:

`Parser -> database -> dashboard tool`

## 1) Configure database for BI

Use PostgreSQL in `.env`:

```env
DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/smartlogparser
```

Install backend dependencies (includes psycopg v3):

```powershell
pip install -r backend/requirements.txt
```

## 2) Available BI endpoints

- `GET /api/bi/events`
- `GET /api/bi/timeseries`
- `GET /api/bi/kpis`

Example:

```http
GET /api/bi/timeseries?parameter=temperature&run_id=RUN_ABC123&limit=5000
```

## 3) Grafana setup

1. Add PostgreSQL datasource in Grafana.
2. Point to your SmartLogParser PostgreSQL database.
3. Use starter SQL queries from `docs/grafana_starter_queries.sql`.
4. Build panels for trends, alarms, and drift.

## 4) Tableau setup

Option A (recommended): connect Tableau directly to PostgreSQL and model visualizations from `events`, `runs`, and `drift_alerts`.

Option B: use a Web Data Connector (or custom connector) to fetch from `/api/bi/events` and `/api/bi/kpis`.

## 5) Power BI setup

Option A (recommended): connect Power BI Desktop to PostgreSQL and publish with scheduled refresh.

Option B: call `/api/bi/*` from Power Query (Web connector), transform shape, and publish.

## 6) Notes

- `events.value` is stored as text; BI endpoints include `numeric_value` when parseable.
- For robust production dashboards, add authentication and rate limits before exposing `/api/bi/*` publicly.
