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
        es = get_client()
    except Exception as e:
        logging.error(f"Elasticsearch Connection Error: {e}")
        raise ValueError(f"Failed to connect to Elasticsearch: {str(e)}") from e
    
    query = {
        "query": {
            "match": {
                "tool_id": tool_id
            }
        }
    }
    
    try:
        res = es.search(index=settings.elastic_index, body=query, size=50)
        logs = [hit["_source"] for hit in res["hits"]["hits"]]
        logging.info(f"Retrieved {len(logs)} logs for tool_id={tool_id}")
        return logs
    except Exception as e:
        logging.error(f"Elasticsearch Search Error for tool_id={tool_id}: {e}")
        raise ValueError(f"Failed to query Elasticsearch: {str(e)}") from e