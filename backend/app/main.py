"""Smart Log Parser - FastAPI backend entry point."""

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import settings
from app.database import init_db
from app.routes import upload, runs, dashboards, stream, synthetic, bi, ingestion, odata
from app.routes.odata import METADATA_XML

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

_ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    "http://127.0.0.1:3000",
]

# When deployed on Vercel, VERCEL_URL is injected automatically.
_vercel_url = os.environ.get("VERCEL_URL")
if _vercel_url:
    _ALLOWED_ORIGINS.extend([f"https://{_vercel_url}", f"http://{_vercel_url}"])

# Support additional origins via CORS_ORIGINS env var (comma-separated).
if settings.cors_origins:
    _ALLOWED_ORIGINS.extend([o.strip() for o in settings.cors_origins.split(",") if o.strip()])


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    logging.getLogger(__name__).info("Database initialized")
    yield


app = FastAPI(
    title="Smart Semiconductor Tool Log Parser",
    description="Parse, normalize, and analyze semiconductor equipment logs from any vendor.",
    version="1.0.0",
    lifespan=lifespan,
)


class ODataMetadataMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        raw = request.scope.get("path", "")
        if raw in ("/odata/$metadata", "/odata/%24metadata"):
            return Response(
                content=METADATA_XML,
                media_type="application/xml",
                headers={"OData-Version": "4.0"},
            )
        return await call_next(request)


app.add_middleware(ODataMetadataMiddleware)
_cors_kwargs: dict = {
    "allow_origins": _ALLOWED_ORIGINS,
    "allow_credentials": True,
    "allow_methods": ["*"],
    "allow_headers": ["*"],
}
# Allow all *.vercel.app origins so preview deployments work too.
if _vercel_url:
    _cors_kwargs["allow_origin_regex"] = r"https://.*\.vercel\.app"

app.add_middleware(CORSMiddleware, **_cors_kwargs)

app.include_router(upload.router)
app.include_router(runs.router)
app.include_router(dashboards.router)
app.include_router(stream.router)
app.include_router(synthetic.router)
app.include_router(bi.router)
app.include_router(ingestion.router)
app.include_router(odata.router)


@app.get("/")
def root():
    return {"service": "Smart Log Parser API", "status": "running"}


@app.get("/health")
def health():
    return {"status": "ok"}
