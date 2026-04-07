import json
import logging
from app.services.elastic_ingestor import pull_logs_from_elastic
from app.services.splunk_service import push_event_to_splunk
from app.services.parser_service import parse_file
from app.database import SessionLocal


def _extract_content(log: dict) -> str:
    """Extract parseable text from an ES document without destroying structure."""
    message = log.get("message") or log.get("raw_line")
    if isinstance(message, str):
        return message
    if isinstance(message, dict):
        return json.dumps(message)
    return json.dumps(log)


def bridge_elastic_to_parser(tool_id: str):
    raw_logs = pull_logs_from_elastic(tool_id)
    if not raw_logs:
        return {"status": "No new logs to bridge"}

    processed_count = 0
    db = SessionLocal()

    try:
        for log in raw_logs:
            content = _extract_content(log)
            filename = f"elastic_{tool_id}_{processed_count}.log"

            try:
                result = parse_file(content, filename, db)

                if result and len(result.get("events", [])) > 0:
                    push_event_to_splunk(result)
                    processed_count += 1
                else:
                    logging.warning(f"Log {processed_count} had no recognizable events.")
            except Exception as e:
                logging.error(f"Bridge failed on log: {e}")

        db.commit()
    finally:
        db.close()

    return {"status": f"Bridged {processed_count} logs successfully"}