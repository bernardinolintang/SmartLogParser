"""Ingestion endpoints: Elasticsearch pull, Splunk webhook, Logstash push, generic webhook."""
from fastapi import APIRouter, Depends, Header
from sqlalchemy.orm import Session
from typing import List, Optional
import logging

from app.database import get_db
from app.services.ingestion_bridge import bridge_elastic_to_parser
from app.services.parser_service import parse_file

router = APIRouter(prefix="/api/ingest", tags=["ingestion"])


@router.post("/sync/{tool_id}")
async def sync_from_elastic(tool_id: str, db: Session = Depends(get_db)):
    """
    Pull → Parse → Store pipeline.
    Pulls logs from Elasticsearch for the given tool_id,
    runs them through the parser, and stores structured events.
    Falls back to mock data if Elasticsearch is unreachable.
    """
    result = bridge_elastic_to_parser(tool_id)
    return result


@router.post("/splunk-webhook")
async def receive_splunk_webhook(payload: dict, db: Session = Depends(get_db)):
    """
    Splunk → SmartLogParser push endpoint.

    Configure in Splunk:
      Settings → Searches, Reports, and Alerts → (your alert) →
      Edit Alert Actions → Webhook → URL: http://<host>:8001/api/ingest/splunk-webhook

    Splunk sends a JSON payload with a 'result' key containing the matching event.
    """
    result_data = payload.get("result", {})
    # Splunk stores the raw log line in _raw
    raw_log = result_data.get("_raw") or result_data.get("message") or str(result_data)
    search_name = payload.get("search_name", "splunk_alert")
    sid = payload.get("sid", "unknown")
    filename = f"splunk_{search_name}_{sid}.log"

    logging.info(f"Splunk webhook received: search='{search_name}', sid='{sid}'")

    result = parse_file(raw_log, filename, db)
    return {
        "status": "parsed",
        "source": "splunk_webhook",
        "run_id": result.get("run_id"),
        "total_events": result.get("total_events", 0),
    }


@router.post("/logstash")
async def receive_from_logstash(payload: dict, db: Session = Depends(get_db)):
    """
    Logstash → SmartLogParser push endpoint.

    Configure in Logstash pipeline (output block):
      output {
        http {
          url         => "http://backend:8001/api/ingest/logstash"
          http_method => "post"
          format      => "json"
        }
      }

    Accepts a single Logstash JSON event. The 'message' field is the raw log line.
    """
    message = (
        payload.get("message")
        or payload.get("log")
        or payload.get("raw_log_line")
        or str(payload)
    )
    tool_id = payload.get("tool_id", "UNKNOWN")
    timestamp = str(payload.get("@timestamp", ""))
    filename = f"logstash_{tool_id}_{timestamp[:10] or 'now'}.log"

    logging.info(f"Logstash event received: tool_id='{tool_id}'")

    result = parse_file(message, filename, db)
    return {
        "status": "parsed",
        "source": "logstash",
        "run_id": result.get("run_id"),
        "total_events": result.get("total_events", 0),
    }


@router.post("/logstash/batch")
async def receive_batch_from_logstash(payload: List[dict], db: Session = Depends(get_db)):
    """
    Logstash batch endpoint — receives multiple events at once.
    Use with Logstash's aggregate filter or batch_size setting.
    """
    results = []
    for event in payload:
        message = event.get("message") or event.get("log") or str(event)
        tool_id = event.get("tool_id", "UNKNOWN")
        filename = f"logstash_batch_{tool_id}.log"
        result = parse_file(message, filename, db)
        results.append({"run_id": result.get("run_id"), "tool_id": tool_id})

    return {"status": "parsed", "source": "logstash_batch", "count": len(results), "runs": results}


@router.post("/webhook")
async def generic_webhook(
    payload: dict,
    db: Session = Depends(get_db),
    x_source: Optional[str] = Header(None),
):
    """
    Generic webhook — accepts raw log text from any system.

    POST /api/ingest/webhook
    Content-Type: application/json
    X-Source: my-system

    { "log": "2026-03-17 10:05:12 TOOL_01 ALARM_602 Pressure Drift" }

    Accepts 'log', 'message', 'raw', or 'content' as the log text field.
    """
    raw = (
        payload.get("log")
        or payload.get("message")
        or payload.get("raw")
        or payload.get("content")
        or str(payload)
    )
    source = x_source or payload.get("source", "webhook")
    filename = f"{source}_{payload.get('tool_id', 'unknown')}.log"

    logging.info(f"Generic webhook received from source='{source}'")

    result = parse_file(raw, filename, db)
    return {
        "status": "parsed",
        "source": source,
        "run_id": result.get("run_id"),
        "total_events": result.get("total_events", 0),
    }
