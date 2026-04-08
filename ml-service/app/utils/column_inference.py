from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

INTERNAL_PREFIXES = ("__fairai_", "_fairai_")
TARGET_KEYWORDS = [
    "target", "label", "outcome", "approved", "selected", "decision", "default",
    "churn", "fraud", "status", "response", "y_true", "ground_truth",
    "hire", "hired", "shortlist", "shortlisted", "admit", "admitted",
]
PRED_KEYWORDS = [
    "prediction", "predicted", "y_pred", "prob", "probability", "risk",
    "model_output", "logit", "corrected_prediction", "corrected_probability",
]
WEAK_PRED_KEYWORDS = ["score", "scoring"]
SENSITIVE_KEYWORDS = [
    "gender", "sex", "race", "ethnicity", "age", "age_group", "religion",
    "disability", "marital", "nationality", "region", "location", "education",
]
BAD_FEATURE_KEYWORDS = ["id", "uuid", "timestamp", "created", "updated", "index"]
FEATURE_FLAG_KEYWORDS = ["referral", "flag", "indicator", "count", "score", "probability", "prob", "risk"]


@dataclass
class ColumnProfile:
    name: str
    dtype: str
    non_null_ratio: float
    missing_ratio: float
    unique_count: int
    unique_ratio: float
    is_numeric: bool
    is_binary_like: bool
    is_probability_like: bool
    is_constant: bool
    is_internal: bool
    high_cardinality: bool
    sample_values: List[Any]


@dataclass
class InferenceResult:
    target_column: Optional[str]
    prediction_column: Optional[str]
    probability_column: Optional[str]
    sensitive_columns: List[str]
    candidate_sensitive_columns: List[str]
    profiling: Dict[str, Dict[str, Any]]
    warnings: List[str]


def sanitize_columns(df: pd.DataFrame) -> pd.DataFrame:
    renamed = []
    seen = {}
    for col in df.columns:
        base = str(col).strip().replace("\n", " ")
        count = seen.get(base, 0)
        seen[base] = count + 1
        renamed.append(base if count == 0 else f"{base}__{count}")
    out = df.copy()
    out.columns = renamed
    return out


def drop_internal_generated_columns(df: pd.DataFrame, keep_corrected: bool = True) -> pd.DataFrame:
    protected = {"corrected_prediction", "corrected_probability"} if keep_corrected else set()
    removable = [
        c for c in df.columns
        if str(c).startswith(INTERNAL_PREFIXES) and c not in protected
    ]
    return df.drop(columns=removable, errors="ignore") if removable else df


def is_probability_like(series: pd.Series) -> bool:
    numeric = pd.to_numeric(series, errors="coerce").dropna()
    if numeric.empty:
        return False
    if numeric.nunique() <= 2:
        return False
    return float(numeric.min()) >= 0.0 and float(numeric.max()) <= 1.0


def normalize_binary(series: pd.Series, positive_label: Any = 1) -> pd.Series:
    positive_tokens = {
        str(positive_label).strip().lower(), "1", "true", "yes", "y", "approved", "selected",
        "hired", "positive", "pass", "passed", "good", "defaulted",
    }
    s = series.copy()
    if pd.api.types.is_numeric_dtype(s):
        numeric = pd.to_numeric(s, errors="coerce")
        unique = sorted(pd.Series(numeric.dropna().unique()).tolist())
        if set(unique).issubset({0, 1}):
            return numeric.fillna(0).astype(int)
    mapped = s.astype(str).str.strip().str.lower().isin(positive_tokens).astype(int)
    if mapped.nunique() < 2 and pd.api.types.is_numeric_dtype(series):
        numeric = pd.to_numeric(series, errors="coerce").fillna(0)
        return (numeric > 0).astype(int)
    return mapped


def profile_columns(df: pd.DataFrame) -> Dict[str, ColumnProfile]:
    profiles: Dict[str, ColumnProfile] = {}
    n = max(len(df), 1)
    for col in df.columns:
        s = df[col]
        non_null = float(s.notna().mean())
        unique_count = int(s.nunique(dropna=True))
        is_num = pd.api.types.is_numeric_dtype(s)
        binary_like = unique_count == 2 or (is_num and set(pd.to_numeric(s, errors="coerce").dropna().unique()).issubset({0, 1}))
        prof = ColumnProfile(
            name=col,
            dtype=str(s.dtype),
            non_null_ratio=round(non_null, 6),
            missing_ratio=round(1.0 - non_null, 6),
            unique_count=unique_count,
            unique_ratio=round(unique_count / n, 6),
            is_numeric=is_num,
            is_binary_like=bool(binary_like),
            is_probability_like=is_probability_like(s),
            is_constant=unique_count <= 1,
            is_internal=str(col).startswith(INTERNAL_PREFIXES),
            high_cardinality=unique_count > min(50, max(20, int(0.5 * n))),
            sample_values=[None if pd.isna(v) else str(v) for v in s.dropna().head(5).tolist()],
        )
        profiles[col] = prof
    return profiles


def _score_target(col: str, p: ColumnProfile) -> float:
    lowered = col.lower()
    if p.is_internal:
        return -1e9
    score = 0.0
    if lowered in {"target", "label", "outcome", "hired", "approved", "selected"}:
        score += 20
    if any(k in lowered for k in TARGET_KEYWORDS):
        score += 10
    if p.is_binary_like:
        score += 8
    if 2 <= p.unique_count <= 10:
        score += 4
    if p.is_numeric and not p.is_binary_like:
        score -= 6
    if p.is_probability_like:
        score -= 5
    if any(k in lowered for k in PRED_KEYWORDS):
        score -= 4
    if any(k in lowered for k in FEATURE_FLAG_KEYWORDS):
        score -= 6
    if p.high_cardinality:
        score -= 3
    if any(k in lowered for k in BAD_FEATURE_KEYWORDS):
        score -= 10
    return score


def _score_prediction(col: str, p: ColumnProfile) -> float:
    lowered = col.lower()
    if p.is_internal and lowered not in {"corrected_prediction", "corrected_probability"}:
        return -1e9
    score = 0.0
    if lowered == "corrected_prediction":
        score += 50
    if lowered == "corrected_probability":
        score += 48
    if any(k in lowered for k in PRED_KEYWORDS):
        score += 12
    if any(k in lowered for k in WEAK_PRED_KEYWORDS):
        score += 2 if any(token in lowered for token in ["hire", "approve", "bias", "pred"]) else -4
    if p.is_probability_like:
        score += 8
    if p.is_binary_like:
        score += 6
    if p.is_numeric and not p.is_probability_like and not p.is_binary_like:
        score -= 4
    if any(k in lowered for k in TARGET_KEYWORDS):
        score -= 4
    if any(k in lowered for k in SENSITIVE_KEYWORDS):
        score -= 12
    if any(k in lowered for k in BAD_FEATURE_KEYWORDS):
        score -= 8
    return score


def _score_sensitive(col: str, p: ColumnProfile) -> float:
    lowered = col.lower()
    if p.is_internal:
        return -1e9
    score = 0.0
    if any(k in lowered for k in SENSITIVE_KEYWORDS):
        score += 12
    if 2 <= p.unique_count <= 12:
        score += 5
    if p.high_cardinality:
        score -= 3
    if p.is_probability_like:
        score -= 8
    if any(k in lowered for k in BAD_FEATURE_KEYWORDS):
        score -= 10
    return score


def infer_columns(
    df: pd.DataFrame,
    requested_target: Optional[str] = None,
    requested_prediction: Optional[str] = None,
    requested_sensitive: Optional[List[str]] = None,
) -> InferenceResult:
    df = sanitize_columns(drop_internal_generated_columns(df))
    profiles = profile_columns(df)
    warnings: List[str] = []

    target = requested_target if requested_target in df.columns else None
    if target is None:
        ranked = sorted((( _score_target(c, p), c) for c, p in profiles.items()), reverse=True)
        target = ranked[0][1] if ranked and ranked[0][0] > 0 else None

    pred = requested_prediction if requested_prediction in df.columns else None
    if pred is None:
        ranked = sorted(((_score_prediction(c, p), c) for c, p in profiles.items()), reverse=True)
        pred = ranked[0][1] if ranked and ranked[0][0] > 0 else None

    prob = None
    if pred and profiles[pred].is_probability_like:
        prob = pred
    else:
        prob_ranked = sorted(((20 if p.is_probability_like else -1, c) for c, p in profiles.items()), reverse=True)
        if prob_ranked and prob_ranked[0][0] > 0:
            prob = prob_ranked[0][1]

    candidates = [c for _, c in sorted(((_score_sensitive(c, p), c) for c, p in profiles.items()), reverse=True) if _score_sensitive(c, profiles[c]) > 0]
    sensitive = [c for c in (requested_sensitive or []) if c in df.columns and c != target]
    if not sensitive:
        sensitive = [c for c in candidates if c not in {target, pred}][:3]
    if not sensitive and target:
        fallback = [c for c, p in profiles.items() if c != target and not p.is_constant and 2 <= p.unique_count <= 10]
        sensitive = fallback[:2]
        if sensitive:
            warnings.append("Sensitive attributes were weakly inferred from low-cardinality columns.")

    if target is None:
        warnings.append("Target column could not be inferred confidently.")
    if not sensitive:
        warnings.append("Sensitive columns could not be inferred confidently.")

    profiling = {k: vars(v) for k, v in profiles.items()}
    return InferenceResult(target, pred, prob, sensitive, candidates[:6], profiling, warnings)
