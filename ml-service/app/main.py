from __future__ import annotations

import os
os.environ["PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION"] = "python"

import io
import json
from functools import lru_cache
from typing import Any, Dict, List, Optional

import pandas as pd
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field

SERVICE_VERSION = "3.0.0"

from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="FairAI ML Service", version=SERVICE_VERSION)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8080", "http://localhost:5173", "http://127.0.0.1:8080", "http://127.0.0.1:5173"],
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from app.fairsight.router import router as fairsight_router
from app.fairsight.compliance_router import router as compliance_router
app.include_router(fairsight_router)
app.include_router(compliance_router)


class AnalyzeResponse(BaseModel):
    metadata: Dict[str, Any]


class MitigationPreviewRequest(BaseModel):
    domain: Optional[str] = "auto"
    strategy: str = "reweighing"
    fairness_summary: Dict[str, Any] = Field(default_factory=dict)
    sensitive_findings: List[Dict[str, Any]] = Field(default_factory=list)
    recommendations: List[Dict[str, Any]] = Field(default_factory=list)


@lru_cache(maxsize=1)
def _load_audit_runtime():
    from app.core import run_audit

    return run_audit


def _load_dataframe(filename: str, content: bytes) -> pd.DataFrame:
    buf = io.BytesIO(content)
    lower = filename.lower()
    if lower.endswith(".csv"):
        return pd.read_csv(buf)
    if lower.endswith(".xlsx") or lower.endswith(".xls"):
        return pd.read_excel(buf)
    if lower.endswith(".json"):
        return pd.read_json(buf)
    if lower.endswith(".parquet"):
        return pd.read_parquet(buf)
    raise HTTPException(status_code=400, detail="Unsupported file format.")


@app.get("/")
def root() -> Dict[str, Any]:
    return {
        "ok": True,
        "service": "fairai-ml-service",
        "version": SERVICE_VERSION,
        "docs": "/docs",
        "health": "/health",
        "status": "online",
    }


@app.get("/health")
def health() -> Dict[str, Any]:
    return {
        "ok": True,
        "service": "fairai-ml-service",
        "version": SERVICE_VERSION,
        "runtime": "lazy",
    }


@app.post("/analyze/file")
async def analyze_file(
    file: UploadFile = File(...),
    domain: str = Form("auto"),
    target_column: str = Form(""),
    prediction_column: str = Form(""),
    sensitive_columns: str = Form("[]"),
    positive_label: str = Form("1"),
) -> Dict[str, Any]:
    try:
        sensitive = json.loads(sensitive_columns) if sensitive_columns else []
        if isinstance(sensitive, str):
            sensitive = [sensitive]
    except Exception:
        sensitive = [s.strip() for s in sensitive_columns.split(",") if s.strip()]
    content = await file.read()
    df = _load_dataframe(file.filename or "data.csv", content)
    if df.empty:
        raise HTTPException(status_code=400, detail="Uploaded dataset is empty.")
    try:
        run_audit = _load_audit_runtime()
        return run_audit(
            df=df,
            source_name=file.filename or "uploaded_dataset",
            domain=domain or "auto",
            requested_target=target_column or None,
            requested_prediction=prediction_column or None,
            requested_sensitive=sensitive,
            positive_label=positive_label,
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {exc}") from exc


@app.post("/mitigate/preview")
def mitigation_preview(payload: MitigationPreviewRequest) -> Dict[str, Any]:
    current_score = float(payload.fairness_summary.get("corrected_fairness_score") or payload.fairness_summary.get("overall_fairness_score") or 0.0)
    strategy_gain_map = {
        "reweighing": 5.0,
        "threshold_optimization": 4.0,
        "resampling": 3.5,
        "adversarial_debiasing": 6.0,
    }
    gain = strategy_gain_map.get(payload.strategy, 3.0)
    projected_score = round(min(99.0, current_score + gain), 2)
    projected_improvement = round(projected_score - current_score, 2)

    group_projection = []
    for finding in payload.sensitive_findings:
        baseline_score = float(finding.get("fairness_score", current_score))
        baseline_di = float(finding.get("disparate_impact", 1.0))
        group_projection.append(
            {
                **finding,
                "projected_fairness_score": round(min(99.0, baseline_score + gain * 0.7), 2),
                "projected_disparate_impact": round(min(1.0, baseline_di + 0.05), 4),
            }
        )

    return {
        "strategy": payload.strategy,
        "current_score": round(current_score, 2),
        "projected_score": projected_score,
        "projected_improvement": projected_improvement,
        "group_projection": group_projection,
        "execution_steps": [
            "Review the worst sensitive attribute slice and confirm the business decision threshold.",
            f"Apply the {payload.strategy.replace('_', ' ')} strategy in a retraining or score-calibration run.",
            "Recompute fairness, calibration, and subgroup error metrics on a held-out validation split.",
            "Compare the projected lift against the current corrected audit output before release.",
        ],
        "operational_notes": [
            "This preview is analytical guidance derived from the current audit output, not a retrained production model.",
            "Use it to prioritize remediation work without requiring a separate pipeline setup.",
            f"Recommendations already available for this run: {min(len(payload.recommendations), 5)}.",
        ],
    }
