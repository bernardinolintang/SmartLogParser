import logging
from app.services.elastic_ingestor import pull_logs_from_elastic
from app.services.splunk_service import push_event_to_splunk
from app.services.parser_service import parse_file 
from app.database import SessionLocal # Needed to talk to the DB

def bridge_elastic_to_parser(tool_id: str):
    raw_logs = pull_logs_from_elastic(tool_id) 
    if not raw_logs:
        return {"status": "No new logs to bridge"}

    processed_count = 0
    db = SessionLocal()
    
    try:
        for log in raw_logs:
            # 1. Extract the messy content
            # Most seed data uses 'message' or 'raw_line'
            content = log.get("message") or log.get("raw_line") or str(log)
            
            # 2. Clean the string so the parser doesn't get confused by Python dict braces
            clean_content = str(content).replace("{", "").replace("}", "").replace("'", "")
            
            filename = f"elastic_{tool_id}_{processed_count}.log"
            
            try:
                # 3. Use the parser directly
                result = parse_file(clean_content, filename, db)
                
                # Check if we actually got events, not just an 'ok' status
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