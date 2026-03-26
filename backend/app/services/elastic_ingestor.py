from elasticsearch import Elasticsearch
from app.config import settings
import logging

def get_client():
    """Returns an authenticated Elasticsearch client using app settings."""
    if not settings.elastic_url:
        raise ValueError("ELASTIC_URL is missing from configuration!")

    auth = (settings.elastic_username, settings.elastic_password)
    kwargs = {"verify_certs": False}
    if settings.elastic_username and settings.elastic_password:
        kwargs["basic_auth"] = auth

    return Elasticsearch(settings.elastic_url, **kwargs)


def pull_logs_from_elastic(tool_id: str, since_minutes: int = 60):
    """
    Pull logs from Elasticsearch for a given tool_id.
    Only fetches logs newer than `since_minutes` to avoid re-processing.
    Falls back to mock data if Elasticsearch is unreachable or index is empty.
    """
    try:
        es = get_client()

        query = {
            "query": {
                "bool": {
                    "must": {"match": {"tool_id": tool_id}},
                    "filter": {
                        "range": {
                            "@timestamp": {"gte": f"now-{since_minutes}m"}
                        }
                    },
                }
            },
            "sort": [{"@timestamp": {"order": "asc"}}],
        }

        res = es.search(index=settings.elastic_index, body=query, size=100)
        logs = [hit["_source"] for hit in res["hits"]["hits"]]

        if not logs:
            logging.info(f"Elastic connected but no recent logs for {tool_id} (last {since_minutes}m). Using mock logs.")
            return get_mock_logs(tool_id)

        logging.info(f"Retrieved {len(logs)} logs for tool_id={tool_id} from last {since_minutes}m")
        return logs

    except Exception as e:
        logging.warning(f"Elasticsearch unavailable ({e}). Switching to Simulation Mode.")
        return get_mock_logs(tool_id)


def get_mock_logs(tool_id: str):
    """Simulation data used when Elasticsearch is unreachable or empty."""
    return [
        {"message": f"2026-03-17 10:00:05 | {tool_id} | TEMP_NORMAL | 25.2C", "tool_id": tool_id},
        {"message": f"2026-03-17 10:05:12 | {tool_id} | ALARM_602 | Pressure Drift Detected", "tool_id": tool_id},
        {"message": f"2026-03-17 10:10:00 | {tool_id} | STATUS_OK | Recipe 'Etch_Step_1' Complete", "tool_id": tool_id},
        {"message": f"2026-03-17 10:15:45 | {tool_id} | FLOW_LOW | Check Gas Line 2", "tool_id": tool_id},
    ]
