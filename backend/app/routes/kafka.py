"""Kafka ingestion endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.kafka_service import consume_and_parse, produce_events, check_broker
from app.models import Event

router = APIRouter(prefix="/api/kafka", tags=["kafka"])


class ConsumeRequest(BaseModel):
    topic: str
    bootstrap_servers: str = "localhost:9092"
    max_messages: int = 100


class ProduceRequest(BaseModel):
    run_id: str
    topic: str
    bootstrap_servers: str = "localhost:9092"


@router.get("/status")
def kafka_status(bootstrap_servers: str = "localhost:9092"):
    """Check broker reachability and return configured topics."""
    return check_broker(bootstrap_servers)


@router.post("/consume")
def kafka_consume(req: ConsumeRequest, db: Session = Depends(get_db)):
    """Pull raw log messages from a Kafka topic and parse them into the pipeline."""
    return consume_and_parse(
        topic=req.topic,
        bootstrap_servers=req.bootstrap_servers,
        db=db,
        max_messages=req.max_messages,
    )


@router.post("/produce")
def kafka_produce(req: ProduceRequest, db: Session = Depends(get_db)):
    """Publish all normalized events for a run to a Kafka output topic."""
    events = (
        db.query(Event)
        .filter(Event.run_id == req.run_id)
        .all()
    )
    event_dicts = [
        {
            "run_id": e.run_id,
            "timestamp": e.timestamp,
            "tool_id": e.tool_id,
            "chamber_id": e.chamber_id,
            "parameter": e.parameter,
            "value": e.value,
            "unit": e.unit,
            "severity": e.severity,
            "event_type": e.event_type,
            "alarm_code": e.alarm_code,
            "parse_status": e.parse_status,
        }
        for e in events
    ]
    return produce_events(
        events=event_dicts,
        topic=req.topic,
        bootstrap_servers=req.bootstrap_servers,
    )
