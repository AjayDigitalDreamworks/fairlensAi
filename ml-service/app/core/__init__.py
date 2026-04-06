"""Core constants, utilities, and shared helpers for FairAI ML Service."""
from __future__ import annotations

import io
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
SERVICE_VERSION = "2.0.0"
RANDOM_SEED = 42

# Dataset size thresholds
LARGE_DATASET_ROWS = 250_000
MAX_TRAIN_ROWS = 120_000
MAX_PROXY_SCAN_ROWS = 50_000
MAX_CATEGORY_LEVELS = 25
PREDICTION_BATCH_ROWS = 100_000

# Splitting ratios — 70 / 15 / 15
TRAIN_RATIO = 0.70
VAL_RATIO = 0.15
TEST_RATIO = 0.15

# Fairness thresholds (from literature)
DI_THRESHOLD = 0.8        # 4/5ths rule
DP_THRESHOLD = 0.1        # demographic parity gap
EO_THRESHOLD = 0.1        # equalized odds gap

# Intersectional analysis
MAX_INTERSECTIONAL_COMPONENTS = 3
MAX_INTERSECTIONAL_FINDINGS = 10  # raised from 4

# Reweighing
REWEIGHING_WEIGHT_CLIP_MIN = 0.35
REWEIGHING_WEIGHT_CLIP_MAX = 4.0
MIN_REWEIGHING_CELL_COUNT = 5

# SHAP
SHAP_SAMPLE_ROWS = 200
GLOBAL_SHAP_FEATURE_LIMIT = 15   # raised from 10
LOCAL_EXPLANATION_LIMIT = 3
LOCAL_CONTRIBUTOR_LIMIT = 4

# Gemini
GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta"
GEMINI_MODEL = os.getenv("FAIRAI_GEMINI_MODEL", "gemini-2.0-flash")

# Column detection
COMMON_TARGET_NAMES = [
    "target", "label", "outcome", "approved", "selected",
    "decision", "hired", "default", "churn", "status",
]
COMMON_PREDICTION_NAMES = [
    "corrected_prediction", "corrected_probability", "prediction",
    "predicted", "score", "model_prediction", "y_pred", "risk_score",
]
COMMON_SENSITIVE_NAMES = [
    "gender", "sex", "race", "ethnicity", "age", "age_group",
    "religion", "marital_status", "location", "region",
    "disability", "protected", "sensitive",
]
DOMAIN_HINTS = {
    "hiring": ["candidate", "resume", "hiring", "salary", "selected", "interview", "department"],
    "finance": ["loan", "credit", "interest", "income", "default", "limit", "balance"],
    "healthcare": ["patient", "diagnosis", "treatment", "admission", "clinical", "hospital", "disease"],
}


# ---------------------------------------------------------------------------
# Utility functions
# ---------------------------------------------------------------------------
def safe_divide(numerator: float, denominator: float) -> float:
    """Safe division returning 0.0 when denominator is zero."""
    return float(numerator / denominator) if denominator else 0.0


def score_to_risk(score: float) -> str:
    if score >= 85:
        return "low"
    if score >= 65:
        return "medium"
    return "high"


def sigmoid(value: float) -> float:
    bounded = float(np.clip(value, -30.0, 30.0))
    return 1.0 / (1.0 + float(np.exp(-bounded)))


def normalize_binary(series: pd.Series, positive_label: Any) -> pd.Series:
    """Map any series to 0/1 using the given positive label."""
    positive_set = {
        str(positive_label).strip().lower(),
        "1", "true", "yes", "approved", "selected", "hired", "positive",
    }
    normalized = series.astype(str).str.strip().str.lower().isin(positive_set).astype(int)
    if normalized.nunique() < 2 and pd.api.types.is_numeric_dtype(series):
        numeric = pd.to_numeric(series, errors="coerce").fillna(0)
        return (numeric > 0).astype(int)
    return normalized


def is_probability_like(series: pd.Series) -> bool:
    if not pd.api.types.is_numeric_dtype(series):
        return False
    numeric = pd.to_numeric(series, errors="coerce").dropna()
    if numeric.empty:
        return False
    return float(numeric.min()) >= 0.0 and float(numeric.max()) <= 1.0


def parse_positive_label(value: str) -> Any:
    value = value.strip()
    if value.isdigit():
        return int(value)
    try:
        return float(value)
    except ValueError:
        return value


def load_dataframe(filename: str, content: bytes) -> pd.DataFrame:
    lower = filename.lower()
    buffer = io.BytesIO(content)
    if lower.endswith(".csv"):
        return pd.read_csv(buffer)
    if lower.endswith(".xlsx") or lower.endswith(".xls"):
        return pd.read_excel(buffer)
    if lower.endswith(".json"):
        return pd.read_json(buffer)
    if lower.endswith(".parquet"):
        return pd.read_parquet(buffer)
    raise ValueError("Unsupported file format. Use CSV, XLSX, JSON, or Parquet.")


def optimize_dataframe_memory(df: pd.DataFrame) -> pd.DataFrame:
    for column in df.select_dtypes(include=["int", "int64", "int32"]).columns:
        df[column] = pd.to_numeric(df[column], downcast="integer")
    for column in df.select_dtypes(include=["float", "float64"]).columns:
        df[column] = pd.to_numeric(df[column], downcast="float")
    return df


def sample_frame(
    df: pd.DataFrame, max_rows: int, stratify_column: Optional[str] = None
) -> pd.DataFrame:
    if len(df) <= max_rows:
        return df.copy()
    if stratify_column and stratify_column in df.columns:
        sampled_parts = []
        normalized = df[stratify_column].astype(str)
        for _, subset in df.groupby(normalized, dropna=False):
            fraction = len(subset) / len(df)
            take = max(1, int(round(max_rows * fraction)))
            sampled_parts.append(subset.sample(min(take, len(subset)), random_state=RANDOM_SEED))
        sampled = pd.concat(sampled_parts).drop_duplicates()
        if len(sampled) > max_rows:
            sampled = sampled.sample(max_rows, random_state=RANDOM_SEED)
        return sampled
    return df.sample(max_rows, random_state=RANDOM_SEED)


def fit_category_compactors(X: pd.DataFrame) -> Dict[str, set]:
    compactors: Dict[str, set] = {}
    for column in X.columns:
        if pd.api.types.is_numeric_dtype(X[column]):
            continue
        top_values = X[column].astype(str).value_counts().head(MAX_CATEGORY_LEVELS).index.tolist()
        if X[column].nunique(dropna=False) > MAX_CATEGORY_LEVELS:
            compactors[column] = set(top_values)
    return compactors


def apply_category_compactors(X: pd.DataFrame, compactors: Dict[str, set]) -> pd.DataFrame:
    transformed = X.copy()
    for column, allowed in compactors.items():
        if column in transformed.columns:
            transformed[column] = transformed[column].astype(str).where(
                transformed[column].astype(str).isin(allowed), "__OTHER__",
            )
    return transformed


def format_feature_value(value: Any) -> str:
    if pd.isna(value):
        return "missing"
    if isinstance(value, (float, np.floating)):
        return f"{float(value):.4f}"
    return str(value)


# ---------------------------------------------------------------------------
# Column inference
# ---------------------------------------------------------------------------
def infer_domain(df: pd.DataFrame, requested_domain: str) -> str:
    if requested_domain and requested_domain not in {"", "auto"}:
        return requested_domain
    joined = " ".join([str(col).lower() for col in df.columns])
    scores = {
        domain: sum(1 for hint in hints if hint in joined)
        for domain, hints in DOMAIN_HINTS.items()
    }
    best_domain = max(scores, key=scores.get)
    return best_domain if scores[best_domain] > 0 else "general"


def infer_target_column(df: pd.DataFrame) -> Optional[str]:
    for col in df.columns:
        if any(name in col.lower() for name in COMMON_TARGET_NAMES):
            return col
    candidates = []
    for col in df.columns:
        series = df[col].dropna()
        unique = series.nunique()
        if 2 <= unique <= 6 and len(series) > 0:
            score = 0
            if series.dtype.kind in {"i", "u", "b", "f"}:
                score += 2
            score += max(0, 6 - unique)
            candidates.append((score, col))
    return sorted(candidates, reverse=True)[0][1] if candidates else None


def infer_prediction_column(df: pd.DataFrame) -> Optional[str]:
    for col in df.columns:
        if any(name in col.lower() for name in COMMON_PREDICTION_NAMES):
            return col
    return None


def infer_sensitive_columns(df: pd.DataFrame, domain: str) -> List[str]:
    matches = []
    for col in df.columns:
        lowered = col.lower()
        if any(name in lowered for name in COMMON_SENSITIVE_NAMES):
            matches.append(col)
    if domain == "hiring":
        matches += [col for col in df.columns if any(h in col.lower() for h in {"education", "marital"})]
    return list(dict.fromkeys(matches))[:3]


def fallback_sensitive_columns(df: pd.DataFrame) -> List[str]:
    candidates = []
    for col in df.columns:
        series = df[col].dropna()
        if 2 <= series.nunique() <= 10:
            candidates.append(col)
    return candidates[:2]
