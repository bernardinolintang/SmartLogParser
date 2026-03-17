import requests
import os
import json
from app.schemas import EventOut
from app.config import settings
import logging

SPLUNK_HEC_URL = os.getenv("SPLUNK_HEC_URL")
SPLUNK_HEC_TOKEN = os.getenv("SPLUNK_HEC_TOKEN")


def push_event_to_splunk(event_data: dict):
    """
    Pushes parsed events to Splunk HEC. 
    If no token is found, it runs in 'Simulation Mode' for teammates.
    """
    # 1. Check if Splunk is configured in .env
    if not settings.splunk_hec_token or settings.splunk_hec_token.strip() == "":
        # Simulation Mode: Teammates will see this in their terminal
        print("\n" + "="*50)
        print("✨ [SPLUNK SIMULATION MODE]")
        print(f"Event Routed: {event_data.get('tool_id', 'Unknown Tool')}")
        print(f"Message: {event_data.get('summary', {}).get('status', 'Processed')}")
        print(f" Events Found: {len(event_data.get('events', []))}")
        print("="*50 + "\n")
        return True

    # 2. Real Splunk Integration Logic
    headers = {"Authorization": f"Splunk {settings.splunk_hec_token}"}
    
    # Wrap the event in the Splunk HEC JSON format
    payload = {
        "event": event_data,
        "sourcetype": "_json",
        "index": "main"
    }

    try:
        response = requests.post(
            settings.splunk_hec_url,
            json=payload,
            headers=headers,
            timeout=2, # Prevents hanging if port is blocked
            verify=False # Bypasses local SSL certificate issues
        )
        return response.status_code == 200
    except Exception as e:
        logging.error(f"Splunk Push Failed: {e}")
        return False