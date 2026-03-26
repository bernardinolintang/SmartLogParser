"""OData v4 endpoint for Tableau and Power BI live connections."""
from fastapi import APIRouter, Depends, Request, Query
from fastapi.responses import JSONResponse, Response
from sqlalchemy.orm import Session
from typing import Optional

from app.database import get_db
from app.models import Run, Event

router = APIRouter(prefix="/odata", tags=["odata"])

ODATA_HEADERS = {
    "OData-Version": "4.0",
    "Content-Type": "application/json;odata.metadata=minimal;odata.streaming=true;charset=utf-8",
}

METADATA_XML = """<?xml version="1.0" encoding="utf-8"?>
<edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx">
  <edmx:DataServices>
    <Schema Namespace="SmartLogParser" xmlns="http://docs.oasis-open.org/odata/ns/edm">
      <EntityType Name="Event">
        <Key><PropertyRef Name="id"/></Key>
        <Property Name="id" Type="Edm.Int32" Nullable="false"/>
        <Property Name="run_id" Type="Edm.String"/>
        <Property Name="timestamp" Type="Edm.String"/>
        <Property Name="fab_id" Type="Edm.String"/>
        <Property Name="tool_id" Type="Edm.String"/>
        <Property Name="tool_type" Type="Edm.String"/>
        <Property Name="chamber_id" Type="Edm.String"/>
        <Property Name="lot_id" Type="Edm.String"/>
        <Property Name="wafer_id" Type="Edm.String"/>
        <Property Name="recipe_name" Type="Edm.String"/>
        <Property Name="recipe_step" Type="Edm.String"/>
        <Property Name="event_type" Type="Edm.String"/>
        <Property Name="parameter" Type="Edm.String"/>
        <Property Name="value" Type="Edm.String"/>
        <Property Name="unit" Type="Edm.String"/>
        <Property Name="alarm_code" Type="Edm.String"/>
        <Property Name="severity" Type="Edm.String"/>
        <Property Name="message" Type="Edm.String"/>
        <Property Name="parse_status" Type="Edm.String"/>
        <Property Name="parser_version" Type="Edm.String"/>
      </EntityType>
      <EntityType Name="Run">
        <Key><PropertyRef Name="run_id"/></Key>
        <Property Name="run_id" Type="Edm.String" Nullable="false"/>
        <Property Name="filename" Type="Edm.String"/>
        <Property Name="source_format" Type="Edm.String"/>
        <Property Name="source_vendor" Type="Edm.String"/>
        <Property Name="uploaded_at" Type="Edm.String"/>
        <Property Name="status" Type="Edm.String"/>
        <Property Name="total_events" Type="Edm.Int32"/>
        <Property Name="alarm_count" Type="Edm.Int32"/>
        <Property Name="warning_count" Type="Edm.Int32"/>
        <Property Name="needs_review" Type="Edm.Boolean"/>
      </EntityType>
      <EntityContainer Name="Container">
        <EntitySet Name="events" EntityType="SmartLogParser.Event"/>
        <EntitySet Name="runs" EntityType="SmartLogParser.Run"/>
      </EntityContainer>
    </Schema>
  </edmx:DataServices>
</edmx:Edmx>"""


@router.get("/metadata")
@router.get("/%24metadata")
def metadata():
    """OData $metadata endpoint — required by Tableau and Power BI."""
    return Response(
        content=METADATA_XML,
        media_type="application/xml",
        headers={"OData-Version": "4.0"},
    )


@router.get("/")
def service_document(request: Request):
    """OData service document."""
    base_url = str(request.base_url).rstrip("/")
    return JSONResponse(
        content={
            "@odata.context": f"{base_url}/odata/$metadata",
            "value": [
                {"name": "events", "kind": "EntitySet", "url": "events"},
                {"name": "runs", "kind": "EntitySet", "url": "runs"},
            ],
        },
        headers=ODATA_HEADERS,
    )


@router.get("/events")
def odata_events(
    request: Request,
    db: Session = Depends(get_db),
    top: Optional[int] = Query(None, alias="$top"),
    skip: int = Query(0, alias="$skip"),
    filter: Optional[str] = Query(None, alias="$filter"),
):
    """OData events feed."""
    query = db.query(Event)

    if filter:
        if "tool_id eq" in filter:
            val = filter.split("'")[1] if "'" in filter else filter.split()[-1]
            query = query.filter(Event.tool_id == val)
        elif "severity eq" in filter:
            val = filter.split("'")[1] if "'" in filter else filter.split()[-1]
            query = query.filter(Event.severity == val)
        elif "run_id eq" in filter:
            val = filter.split("'")[1] if "'" in filter else filter.split()[-1]
            query = query.filter(Event.run_id == val)

    query = query.offset(skip)
    if top:
        query = query.limit(top)

    events = query.all()
    base_url = str(request.base_url).rstrip("/")

    data = [
        {
            "id": e.id,
            "run_id": e.run_id,
            "timestamp": e.timestamp,
            "fab_id": e.fab_id,
            "tool_id": e.tool_id,
            "tool_type": e.tool_type,
            "chamber_id": e.chamber_id,
            "lot_id": e.lot_id,
            "wafer_id": e.wafer_id,
            "recipe_name": e.recipe_name,
            "recipe_step": e.recipe_step,
            "event_type": e.event_type,
            "parameter": e.parameter,
            "value": e.value,
            "unit": e.unit,
            "alarm_code": e.alarm_code,
            "severity": e.severity,
            "message": e.message,
            "parse_status": e.parse_status,
            "parser_version": e.parser_version,
        }
        for e in events
    ]

    return JSONResponse(
        content={
            "@odata.context": f"{base_url}/odata/$metadata#events",
            "value": data,
        },
        headers=ODATA_HEADERS,
    )


@router.get("/runs")
def odata_runs(
    request: Request,
    db: Session = Depends(get_db),
    top: Optional[int] = Query(None, alias="$top"),
    skip: int = Query(0, alias="$skip"),
):
    """OData runs feed."""
    query = db.query(Run).order_by(Run.uploaded_at.desc())
    query = query.offset(skip)
    if top:
        query = query.limit(top)

    runs = query.all()
    base_url = str(request.base_url).rstrip("/")

    data = [
        {
            "run_id": r.run_id,
            "filename": r.filename,
            "source_format": r.source_format,
            "source_vendor": r.source_vendor,
            "uploaded_at": r.uploaded_at.isoformat() if r.uploaded_at else None,
            "status": r.status,
            "total_events": r.total_events,
            "alarm_count": r.alarm_count,
            "warning_count": r.warning_count,
            "needs_review": r.needs_review,
        }
        for r in runs
    ]

    return JSONResponse(
        content={
            "@odata.context": f"{base_url}/odata/$metadata#runs",
            "value": data,
        },
        headers=ODATA_HEADERS,
    )
