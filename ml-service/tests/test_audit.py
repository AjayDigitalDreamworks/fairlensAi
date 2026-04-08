import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pandas as pd

from app.core.audit_orchestrator import run_audit
from app.utils.column_inference import infer_columns, normalize_binary
from app.fairness.metrics import compute_structured_fairness_metrics


def test_column_inference_blocks_internal_columns():
    df = pd.DataFrame({
        "__fairai_model_prediction": [0, 1, 0, 1],
        "approved": [0, 1, 0, 1],
        "Gender": ["M", "F", "M", "F"],
        "score": [0.1, 0.9, 0.2, 0.8],
    })
    result = infer_columns(df)
    assert result.target_column == "approved"
    assert result.prediction_column == "score"
    assert "Gender" in result.sensitive_columns


def test_fairness_metrics_edge_case_runs():
    df = pd.DataFrame({
        "target": [1, 1, 0, 0],
        "prediction": [1, 0, 0, 0],
        "Gender": ["F", "F", "M", "M"],
    })
    out = compute_structured_fairness_metrics(df, "Gender", "prediction", "target")
    assert "disparate_impact" in out
    assert out["confidence"] in {"low", "medium", "high"}


def test_end_to_end_audit_with_training_path():
    rows = 80
    df = pd.DataFrame({
        "Gender": ["F"] * 40 + ["M"] * 40,
        "Education": ["High"] * 20 + ["Low"] * 20 + ["High"] * 20 + ["Low"] * 20,
        "income": list(range(80)),
        "age": [22 + (i % 10) for i in range(80)],
        "approved": [1 if i % 3 else 0 for i in range(80)],
    })
    result = run_audit(df, source_name="unit.csv", requested_target="approved", requested_sensitive=["Gender", "Education"])
    assert result["metadata"]["target_column"] == "approved"
    assert "fairness_summary" in result
    assert "mitigation_summary" in result
    assert "corrected_csv" in result
