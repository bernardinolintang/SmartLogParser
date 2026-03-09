"""Dashboard and drift detection endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Run, Event, DriftAlert
from app.services.golden_run import mark_golden, compare_runs

router = APIRouter(prefix="/api", tags=["dashboards"])


@router.get("/runs/{run_id}/drift")
def get_drift(run_id: str, db: Session = Depends(get_db)):
    alerts = db.query(DriftAlert).filter(DriftAlert.run_id == run_id).all()
    return [
        {
            "parameter": a.parameter,
            "baseline_value": a.baseline_value,
            "current_value": a.current_value,
            "pct_deviation": a.pct_deviation,
            "severity": a.severity,
        }
        for a in alerts
    ]


@router.post("/runs/{run_id}/mark-golden")
def mark_run_golden(run_id: str, db: Session = Depends(get_db)):
    ok = mark_golden(db, run_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Run not found")
    return {"run_id": run_id, "is_golden": True}


@router.get("/golden/compare")
def golden_compare(
    baseline_run_id: str = Query(...),
    current_run_id: str = Query(...),
    db: Session = Depends(get_db),
):
    for rid in (baseline_run_id, current_run_id):
        if not db.query(Run).filter(Run.run_id == rid).first():
            raise HTTPException(status_code=404, detail=f"Run {rid} not found")

    return compare_runs(db, baseline_run_id, current_run_id)
