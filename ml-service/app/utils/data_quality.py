from __future__ import annotations

from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

from .column_inference import normalize_binary


def scan_data_quality(
    df: pd.DataFrame,
    target_column: Optional[str],
    sensitive_columns: List[str],
    positive_label: Any = 1,
) -> Dict[str, Any]:
    warnings: List[str] = []
    errors: List[str] = []
    duplicate_rows = int(df.duplicated().sum())
    missing = {c: round(float(df[c].isna().mean()), 4) for c in df.columns if df[c].isna().any()}
    constant_columns = [c for c in df.columns if df[c].nunique(dropna=True) <= 1]
    high_cardinality = [c for c in df.columns if df[c].nunique(dropna=True) > min(100, max(20, int(0.7 * len(df))))]

    if duplicate_rows:
        warnings.append(f"Dataset contains {duplicate_rows} duplicate rows.")
    if constant_columns:
        warnings.append(f"Constant columns detected: {', '.join(constant_columns[:8])}.")
    if high_cardinality:
        warnings.append(f"High-cardinality columns detected: {', '.join(high_cardinality[:8])}.")
    if len(df) < 50:
        warnings.append("Dataset is very small; fairness conclusions may have low confidence.")
    if target_column and target_column in df.columns:
        y = normalize_binary(df[target_column], positive_label)
        pos_rate = float(y.mean()) if len(y) else 0.0
        imbalance_ratio = float(max(pos_rate, 1 - pos_rate) / max(min(pos_rate, 1 - pos_rate), 1e-9)) if 0 < pos_rate < 1 else np.inf
        if y.nunique() < 2:
            errors.append("Target column is not binary after normalization.")
        elif imbalance_ratio > 10:
            warnings.append(f"Strong class imbalance detected (ratio≈{imbalance_ratio:.1f}).")
    else:
        pos_rate = None
        imbalance_ratio = None

    leakage_columns: List[str] = []
    if target_column and target_column in df.columns:
        target_series = normalize_binary(df[target_column], positive_label)
        for c in df.columns:
            if c == target_column:
                continue
            s = df[c]
            if s.nunique(dropna=True) <= 1:
                continue
            try:
                comp = normalize_binary(s, positive_label)
                if len(comp) == len(target_series) and float((comp == target_series).mean()) > 0.98:
                    leakage_columns.append(c)
                    continue
            except Exception:
                pass
            lowered = c.lower()
            if any(k in lowered for k in ["target", "label", "actual", "ground_truth"]):
                leakage_columns.append(c)
    if leakage_columns:
        warnings.append(f"Possible leakage columns: {', '.join(leakage_columns[:8])}.")

    sensitive_group_sizes: Dict[str, Dict[str, int]] = {}
    for s in sensitive_columns:
        if s in df.columns:
            counts = df[s].astype(str).fillna("missing").value_counts(dropna=False).to_dict()
            sensitive_group_sizes[s] = {str(k): int(v) for k, v in counts.items()}
            if min(counts.values()) < 5:
                warnings.append(f"Sensitive column '{s}' has very small subgroup(s).")

    suitable = not errors and len(df) >= 20 and (target_column is None or target_column in df.columns)
    if len(df.columns) < 3:
        errors.append("Dataset must have at least 3 columns for useful audit.")
        suitable = False

    return {
        "suitable": suitable and not errors,
        "warnings": warnings,
        "errors": errors,
        "duplicate_rows": duplicate_rows,
        "missing_values": missing,
        "constant_columns": constant_columns,
        "high_cardinality_columns": high_cardinality,
        "leakage_columns": sorted(set(leakage_columns)),
        "class_balance": {
            "positive_rate": None if pos_rate is None else round(pos_rate, 4),
            "imbalance_ratio": None if imbalance_ratio is None or not np.isfinite(imbalance_ratio) else round(float(imbalance_ratio), 4),
        },
        "sensitive_group_sizes": sensitive_group_sizes,
    }
