"""Smart Log Parser - FastAPI backend entry point."""

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import init_db
from app.routes import upload, runs, dashboards, stream, synthetic

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

app = FastAPI(
    title="Smart Semiconductor Tool Log Parser",
    description="Parse, normalize, and analyze semiconductor equipment logs from any vendor.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload.router)
app.include_router(runs.router)
app.include_router(dashboards.router)
app.include_router(stream.router)
app.include_router(synthetic.router)


@app.on_event("startup")
def on_startup():
    init_db()
    logging.getLogger(__name__).info("Database initialized")


@app.get("/")
def root():
    return {"service": "Smart Log Parser API", "status": "running"}


@app.get("/health")
def health():
    return {"status": "ok"}
