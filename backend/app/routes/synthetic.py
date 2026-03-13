"""Synthetic log endpoints for demo/prototype."""

from fastapi import APIRouter, HTTPException
from fastapi.responses import PlainTextResponse, Response

from app.synthetic.generator import (
    generate_json,
    generate_xml,
    generate_csv,
    generate_kv,
    generate_syslog,
    generate_text,
    generate_binary,
    generate_hex,
)

router = APIRouter(prefix="/api/synthetic", tags=["synthetic"])


@router.get("/{format_type}")
def synthetic(format_type: str):
    fmt = format_type.lower()
    if fmt == "json":
        return PlainTextResponse(generate_json(), media_type="application/json")
    if fmt == "xml":
        return PlainTextResponse(generate_xml(), media_type="application/xml")
    if fmt == "csv":
        return PlainTextResponse(generate_csv(), media_type="text/csv")
    if fmt in {"kv", "keyvalue"}:
        return PlainTextResponse(generate_kv(), media_type="text/plain")
    if fmt == "syslog":
        return PlainTextResponse(generate_syslog(), media_type="text/plain")
    if fmt == "text":
        return PlainTextResponse(generate_text(), media_type="text/plain")
    if fmt == "binary":
        return Response(content=generate_binary(), media_type="application/octet-stream")
    if fmt == "hex":
        return PlainTextResponse(generate_hex(), media_type="text/plain")
    raise HTTPException(status_code=404, detail=f"Unsupported synthetic format: {format_type}")
