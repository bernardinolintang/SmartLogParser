import os
import json
import time
from datetime import datetime
from elasticsearch import Elasticsearch
from dotenv import load_dotenv

# Load credentials from your root .env
load_dotenv()

ELASTIC_URL = os.getenv("ELASTIC_URL", "http://localhost:9200")
ELASTIC_USER = os.getenv("ELASTIC_USERNAME") or os.getenv("ELASTIC_USER", "")
ELASTIC_PASSWORD = (os.getenv("ELASTIC_PASSWORD") or "").strip()
ELASTIC_INDEX = os.getenv("ELASTIC_INDEX", "fab-logs-2026")

# Connect to Elastic — skip auth if no password configured (local Docker)
_es_kwargs = {"verify_certs": False}
if ELASTIC_USER and ELASTIC_PASSWORD:
    _es_kwargs["basic_auth"] = (ELASTIC_USER, ELASTIC_PASSWORD)

es = Elasticsearch(ELASTIC_URL, **_es_kwargs)

def seed_logs():
    # 1. Create the Index if it doesn't exist
    if not es.indices.exists(index=ELASTIC_INDEX):
        es.indices.create(index=ELASTIC_INDEX)
        print(f"✅ Created index: {ELASTIC_INDEX}")

    # 2. Realistic Semiconductor Log Templates
    tools = ["ETCH_01", "CVD_02", "PVD_01"]
    parameters = ["temperature", "pressure", "rf_power", "gas_flow"]

    print(f"🚀 Injecting 10 logs into {ELASTIC_INDEX}...")
    
    for i in range(10):
        log_entry = {
            "timestamp": datetime.utcnow().isoformat(),
            "tool_id": tools[i % len(tools)],
            "chamber_id": "CH_A",
            "recipe_name": "POLY_ETCH_V2",
            "recipe_step": f"STEP_{i+1}",
            "parameter": parameters[i % len(parameters)],
            "value": str(20 + (i * 5.5)), # Simulated drift
            "unit": "C" if i % 4 == 0 else "Torr",
            "message": f"Normal operation at step {i+1}",
            "parse_status": "ok"
        }
        
        # Add an alarm to the 5th log for testing
        if i == 4:
            log_entry["event_type"] = "ALARM"
            log_entry["alarm_code"] = "ALM_602"
            log_entry["severity"] = "critical"
            log_entry["message"] = "High Pressure Deviation detected"

        es.index(index=ELASTIC_INDEX, document=log_entry)
        print(f"   Logged {log_entry['tool_id']} - {log_entry['parameter']}")
        time.sleep(0.1)

    print("\nDone! You can now check http://localhost:8001/api/bi/events")

if __name__ == "__main__":
    seed_logs()