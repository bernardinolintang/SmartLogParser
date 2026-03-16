-- SmartLogParser Grafana starter queries (PostgreSQL)
-- Assumes DATABASE_URL points to PostgreSQL and table names are runs/events/drift_alerts.

-- 1) KPI: Total events by run
SELECT
  run_id,
  total_events,
  alarm_count,
  warning_count,
  uploaded_at
FROM runs
ORDER BY uploaded_at DESC
LIMIT 200;

-- 2) Time series: parameter trends
-- Use Grafana template variables for run_id and parameter if desired.
SELECT
  NULLIF(e.timestamp, '')::timestamptz AS "time",
  e.tool_id,
  e.chamber_id,
  e.parameter,
  NULLIF(regexp_replace(COALESCE(e.value, ''), '[^0-9eE+\.-]', '', 'g'), '')::double precision AS value
FROM events e
WHERE e.event_type = 'PARAMETER_READING'
  AND e.parse_status IN ('ok', 'llm')
  AND e.parameter = 'temperature'
  AND $__timeFilter(NULLIF(e.timestamp, '')::timestamptz)
ORDER BY 1;

-- 3) Alarm timeline
SELECT
  NULLIF(e.timestamp, '')::timestamptz AS "time",
  e.tool_id,
  e.chamber_id,
  e.alarm_code,
  e.severity,
  e.message
FROM events e
WHERE e.severity IN ('alarm', 'critical')
  AND $__timeFilter(NULLIF(e.timestamp, '')::timestamptz)
ORDER BY 1;

-- 4) Alarm distribution by tool
SELECT
  e.tool_id,
  COUNT(*) AS alarm_events
FROM events e
WHERE e.severity IN ('alarm', 'critical')
GROUP BY e.tool_id
ORDER BY alarm_events DESC;

-- 5) Drift panel
SELECT
  d.run_id,
  d.tool_id,
  d.chamber_id,
  d.recipe_name,
  d.recipe_step,
  d.parameter,
  d.baseline_value,
  d.current_value,
  d.pct_deviation,
  d.severity
FROM drift_alerts d
ORDER BY ABS(d.pct_deviation) DESC NULLS LAST
LIMIT 500;
