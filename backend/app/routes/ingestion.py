from fastapi import APIRouter
from app.services.ingestion_bridge import bridge_elastic_to_parser

router = APIRouter(prefix="/api/ingest", tags=["ingestion"])

@router.post("/sync/{tool_id}")
async def sync_from_fab_storage(tool_id: str):
    """
    Triggers the Industrial Bridge to pull logs from 
    Elasticsearch and push them through the parser.
    """
    result = bridge_elastic_to_parser(tool_id)
    return result