from __future__ import annotations

from itertools import combinations
from typing import Any, Dict, List

import numpy as np
import pandas as pd
from scipy.stats import chi2_contingency


def _association_strength(a: pd.Series, b: pd.Series) -> float:
    x = a.copy()
    y = b.copy()
    if pd.api.types.is_numeric_dtype(x) and pd.api.types.is_numeric_dtype(y):
        corr = pd.to_numeric(x, errors="coerce").corr(pd.to_numeric(y, errors="coerce"))
        return float(abs(corr)) if pd.notna(corr) else 0.0
    xt = x.astype(str).fillna("missing")
    yt = y.astype(str).fillna("missing")
    table = pd.crosstab(xt, yt)
    if table.shape[0] < 2 or table.shape[1] < 2:
        return 0.0
    chi2 = chi2_contingency(table)[0]
    n = table.values.sum()
    k = min(table.shape) - 1
    if n <= 0 or k <= 0:
        return 0.0
    return float(np.sqrt(chi2 / (n * k)))


def detect_proxy_features(df: pd.DataFrame, sensitive_columns: List[str], exclude: List[str]) -> List[Dict[str, Any]]:
    if len(df) > 3000:
        df = df.sample(n=3000, random_state=42)
    findings: List[Dict[str, Any]] = []
    excluded = set(exclude) | set(sensitive_columns)
    for sensitive in sensitive_columns:
        if sensitive not in df.columns:
            continue
        for col in df.columns:
            if col in excluded:
                continue
            try:
                strength = _association_strength(df[col], df[sensitive])
            except Exception:
                continue
            if strength >= 0.2:
                findings.append({
                    "sensitive_column": sensitive,
                    "feature": col,
                    "association_strength": round(float(strength), 4),
                    "risk": "high" if strength >= 0.5 else "medium",
                })
    findings.sort(key=lambda x: x["association_strength"], reverse=True)
    return findings[:25]


def intersectional_groups(df: pd.DataFrame, sensitive_columns: List[str], max_combinations: int = 3) -> List[Dict[str, Any]]:
    available = [c for c in sensitive_columns if c in df.columns]
    combos = []
    for r in range(2, min(max_combinations, len(available)) + 1):
        for cols in combinations(available, r):
            key = df[list(cols)].astype(str).agg(" | ".join, axis=1)
            counts = key.value_counts()
            combos.append({
                "columns": list(cols),
                "group_counts": {str(k): int(v) for k, v in counts.head(25).to_dict().items()},
            })
    return combos
