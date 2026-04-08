"""Pipeline entrypoint for the FairAI ML service.

Keeps a clean, explicit pipeline layer while delegating the heavy audit logic
to the orchestrator. This is the stable entrypoint the FastAPI service should
call for a full analysis run.
"""
from __future__ import annotations

from time import perf_counter
from typing import Any, Dict

import pandas as pd

from app.core.audit_orchestrator import SERVICE_VERSION, run_audit as _run_orchestrated_audit


def run_audit_pipeline(*, df: pd.DataFrame, **kwargs: Any) -> Dict[str, Any]:
    started = perf_counter()
    result = _run_orchestrated_audit(df=df, **kwargs)
    pipeline_meta = {
        "name": "direct_audit_pipeline",
        "service_version": SERVICE_VERSION,
        "duration_seconds": round(perf_counter() - started, 4),
    }
    result["pipeline"] = pipeline_meta
    result.setdefault("metadata", {})
    result["metadata"]["pipeline"] = pipeline_meta
    return result


def train_production_pipeline(*args: Any, **kwargs: Any) -> Dict[str, Any]:
    from app.core.model_selector import train_and_select_model

    return train_and_select_model(*args, **kwargs)
