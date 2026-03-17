from elasticsearch import Elasticsearch
from app.config import settings
import logging

def get_client():
    """Returns an authenticated Elasticsearch client using app settings."""
    if not settings.elastic_url:
        raise ValueError("ELASTIC_URL is missing from configuration!")
        
    return Elasticsearch(
        settings.elastic_url, # This is the 'hosts' parameter it was complaining about
        basic_auth=(settings.elastic_username, settings.elastic_password),
        verify_certs=False
    )

def pull_logs_from_elastic(tool_id: str):
    try:
        # 1. Try to connect to the real Elasticsearch
        es = get_client()
        
        query = {
            "query": {
                "match": {
                    "tool_id": tool_id
                }
            }
        }
        
        # 2. Try the actual search
        res = es.search(index=settings.elastic_index, body=query, size=50)
        logs = [hit["_source"] for hit in res["hits"]["hits"]]
        
        # If real Elastic is empty, it's better to show mock data than nothing!
        if not logs:
            logging.info(f"Elastic connected but empty for {tool_id}. Using mock logs.")
            return get_mock_logs(tool_id)
            
        logging.info(f"Retrieved {len(logs)} real logs for tool_id={tool_id}")
        return logs

    except Exception as e:
        # 3. FALLBACK: If Elastic is down or connection fails, return Mock Data
        logging.warning(f"⚠️ Elasticsearch unavailable ({e}). Switching to Simulation Mode.")
        return get_mock_logs(tool_id)

def get_mock_logs(tool_id: str):
    """Helper to provide consistent sample data for teammates."""
    return [
        {"message": f"2026-03-17 10:00:05 | {tool_id} | TEMP_NORMAL | 25.2C", "tool_id": tool_id},
        {"message": f"2026-03-17 10:05:12 | {tool_id} | ALARM_602 | Pressure Drift Detected", "tool_id": tool_id},
        {"message": f"2026-03-17 10:10:00 | {tool_id} | STATUS_OK | Recipe 'Etch_Step_1' Complete", "tool_id": tool_id},
        {"message": f"2026-03-17 10:15:45 | {tool_id} | FLOW_LOW | Check Gas Line 2", "tool_id": tool_id}
    ]