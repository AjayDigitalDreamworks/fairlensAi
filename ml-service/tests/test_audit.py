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


def test_target_inference_prefers_hired_over_referral():
    df = pd.DataFrame({
        "Referral": [0, 1, 0, 1, 1, 0],
        "Hired": [0, 1, 0, 1, 0, 1],
        "Gender": ["F", "M", "F", "M", "F", "M"],
        "Experience_Years": [1, 3, 2, 5, 4, 6],
    })
    result = infer_columns(df)
    assert result.target_column == "Hired"
    assert result.target_confidence in {"medium", "high"}


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


def test_ambiguous_dataset_returns_needs_review_mode():
    df = pd.DataFrame({
        "value_a": [1, 0, 1, 0, 1, 0],
        "value_b": [0, 1, 0, 1, 0, 1],
        "code": ["x", "y", "x", "y", "z", "z"],
        "metric": [10, 12, 9, 11, 8, 13],
    })
    result = run_audit(df, source_name="ambiguous.csv")
    assert result["metadata"]["audit_mode"] == "needs_review"
    assert result["recommendation"] == "schema review required"
