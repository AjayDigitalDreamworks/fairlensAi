"""Structured fairness metrics — replaces the fake single-score system.

Why structured metrics instead of a single score:
- A single score hides which fairness criteria pass/fail
- Different stakeholders care about different metrics
- Legal standards reference specific metrics (e.g., 4/5ths rule = DI >= 0.8)
- A single score with arbitrary weights is not reproducible or interpretable
"""
from __future__ import annotations

from itertools import combinations
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

from app.core import (
    DI_THRESHOLD,
    DP_THRESHOLD,
    EO_THRESHOLD,
    MAX_INTERSECTIONAL_COMPONENTS,
    MAX_INTERSECTIONAL_FINDINGS,
    MAX_PROXY_SCAN_ROWS,
    MIN_REWEIGHING_CELL_COUNT,
    RANDOM_SEED,
    REWEIGHING_WEIGHT_CLIP_MAX,
    REWEIGHING_WEIGHT_CLIP_MIN,
    is_probability_like,
    normalize_binary,
    safe_divide,
    sample_frame,
    score_to_risk,
)


# ---------------------------------------------------------------------------
# Structured fairness metrics — the core of the new system
# ---------------------------------------------------------------------------
def compute_structured_fairness_metrics(
    df: pd.DataFrame,
    sensitive_column: str,
    prediction_column: str,
    target_column: Optional[str],
    positive_label: Any,
) -> Dict[str, Any]:
    """Compute standard fairness metrics for a single sensitive attribute.

    Returns structured metrics instead of a single arbitrary score:
    - disparate_impact: min(selection_rate_g / selection_rate_baseline) — 4/5ths rule
    - demographic_parity_diff: max absolute difference in selection rates
    - equalized_odds_gap: max of TPR gap and FPR gap across groups
    - tpr_gap: max difference in true positive rates
    - fpr_gap: max difference in false positive rates
    - accuracy_by_group: per-group accuracy
    - group_metrics: detailed per-group breakdown

    Also computes a backward-compatible fairness_score derived from pass/fail
    of standard thresholds (not arbitrary weights).
    """
    frame = df[[sensitive_column, prediction_column]].copy()
    if target_column and target_column in df.columns:
        frame[target_column] = df[target_column]
    frame = frame.dropna(subset=[sensitive_column, prediction_column])

    # Normalize predictions to binary
    if is_probability_like(frame[prediction_column]):
        frame[prediction_column] = (
            pd.to_numeric(frame[prediction_column], errors="coerce").fillna(0) >= 0.5
        ).astype(int)
    else:
        frame[prediction_column] = normalize_binary(frame[prediction_column], positive_label)

    if target_column and target_column in frame.columns:
        frame[target_column] = normalize_binary(frame[target_column], positive_label)

    groups = frame[sensitive_column].astype(str).value_counts().head(5).index.tolist()
    if len(groups) < 2:
        return _single_group_result(sensitive_column)

    baseline = groups[0]
    baseline_rate = frame.loc[
        frame[sensitive_column].astype(str) == baseline, prediction_column
    ].mean()

    group_metrics = []
    selection_rates = []
    tpr_values = []
    fpr_values = []
    accuracy_by_group = {}

    for group in groups:
        subset = frame.loc[frame[sensitive_column].astype(str) == group]
        selection_rate = float(subset[prediction_column].mean()) if len(subset) else 0.0
        selection_rates.append(selection_rate)

        metrics: Dict[str, Any] = {
            "group": group,
            "count": int(len(subset)),
            "selection_rate": round(selection_rate, 4),
        }

        if target_column and target_column in frame.columns:
            tp = int(((subset[prediction_column] == 1) & (subset[target_column] == 1)).sum())
            tn = int(((subset[prediction_column] == 0) & (subset[target_column] == 0)).sum())
            fp = int(((subset[prediction_column] == 1) & (subset[target_column] == 0)).sum())
            fn = int(((subset[prediction_column] == 0) & (subset[target_column] == 1)).sum())
            tpr = safe_divide(tp, tp + fn)
            fpr = safe_divide(fp, fp + tn)
            fnr = safe_divide(fn, fn + tp)
            accuracy = safe_divide(tp + tn, len(subset))
            metrics.update({
                "true_positive_rate": round(tpr, 4),
                "false_positive_rate": round(fpr, 4),
                "false_negative_rate": round(fnr, 4),
                "accuracy": round(accuracy, 4),
            })
            tpr_values.append(tpr)
            fpr_values.append(fpr)
            accuracy_by_group[group] = round(accuracy, 4)

        group_metrics.append(metrics)

    # Compute standard metrics
    impacts = [
        safe_divide(sr, baseline_rate) for sr in selection_rates
    ]
    disparate_impact = float(min(impacts)) if impacts else 1.0
    dp_diff = float(max(selection_rates) - min(selection_rates)) if selection_rates else 0.0
    tpr_gap = float(max(tpr_values) - min(tpr_values)) if tpr_values else 0.0
    fpr_gap = float(max(fpr_values) - min(fpr_values)) if fpr_values else 0.0
    equalized_odds_gap = max(tpr_gap, fpr_gap)
    accuracy_spread = (
        float(max(accuracy_by_group.values()) - min(accuracy_by_group.values()))
        if accuracy_by_group else 0.0
    )

    # Backward-compatible fairness_score derived from STANDARD thresholds
    # Each criterion contributes equally. Score = 100 * (fraction of criteria met)
    # with penalty proportional to how far each metric is from its threshold.
    criteria_scores = []

    # DI criterion: 1.0 if DI >= 0.8, else proportional
    di_score = min(1.0, disparate_impact / DI_THRESHOLD) if DI_THRESHOLD > 0 else 1.0
    criteria_scores.append(di_score)

    # DP criterion: 1.0 if dp_diff <= 0.1, else proportional
    dp_score = min(1.0, DP_THRESHOLD / max(dp_diff, 1e-9)) if dp_diff > DP_THRESHOLD else 1.0
    criteria_scores.append(dp_score)

    # EO criterion: 1.0 if eo_gap <= 0.1, else proportional
    if tpr_values:
        eo_score = min(1.0, EO_THRESHOLD / max(equalized_odds_gap, 1e-9)) if equalized_odds_gap > EO_THRESHOLD else 1.0
        criteria_scores.append(eo_score)

    fairness_score = round(100.0 * float(np.mean(criteria_scores)), 2)

    # Notes based on standard violations
    notes = []
    if disparate_impact < DI_THRESHOLD:
        notes.append(f"Disparate impact {disparate_impact:.3f} violates the 4/5ths rule (< {DI_THRESHOLD}).")
    if dp_diff > DP_THRESHOLD:
        notes.append(f"Demographic parity gap {dp_diff:.3f} exceeds threshold ({DP_THRESHOLD}).")
    if equalized_odds_gap > EO_THRESHOLD:
        notes.append(f"Equalized odds gap {equalized_odds_gap:.3f} exceeds threshold ({EO_THRESHOLD}).")
    if accuracy_spread > 0.1:
        notes.append(f"Accuracy spread {accuracy_spread:.3f} indicates unequal model performance across groups.")

    return {
        "sensitive_column": sensitive_column,
        "baseline_group": baseline,
        # Structured metrics — the primary output
        "disparate_impact": round(disparate_impact, 4),
        "demographic_parity_difference": round(dp_diff, 4),
        "equalized_odds_gap": round(equalized_odds_gap, 4),
        "tpr_gap": round(tpr_gap, 4),
        "fpr_gap": round(fpr_gap, 4),
        "accuracy_by_group": accuracy_by_group,
        "accuracy_spread": round(accuracy_spread, 4),
        # Backward-compatible score — derived from standard thresholds
        "fairness_score": fairness_score,
        "risk_level": score_to_risk(fairness_score),
        # Detailed breakdown
        "group_metrics": group_metrics,
        "notes": notes,
        # Pass/fail flags
        "di_pass": disparate_impact >= DI_THRESHOLD,
        "dp_pass": dp_diff <= DP_THRESHOLD,
        "eo_pass": equalized_odds_gap <= EO_THRESHOLD,
    }


def _single_group_result(sensitive_column: str) -> Dict[str, Any]:
    return {
        "sensitive_column": sensitive_column,
        "fairness_score": 100.0,
        "risk_level": "low",
        "group_metrics": [],
        "demographic_parity_difference": 0.0,
        "disparate_impact": 1.0,
        "equalized_odds_gap": 0.0,
        "tpr_gap": 0.0,
        "fpr_gap": 0.0,
        "accuracy_by_group": {},
        "accuracy_spread": 0.0,
        "notes": ["Not enough distinct groups for comparison."],
        "di_pass": True,
        "dp_pass": True,
        "eo_pass": True,
    }


# ---------------------------------------------------------------------------
# Intersectional fairness — improved ranking
# ---------------------------------------------------------------------------
def build_intersectional_group_labels(df: pd.DataFrame, columns: List[str]) -> pd.Series:
    available = [col for col in columns if col in df.columns]
    if not available:
        return pd.Series(["__ALL__"] * len(df), index=df.index, dtype="string")
    combined = available[0] + "=" + df[available[0]].astype("string").fillna("__MISSING__")
    for col in available[1:]:
        combined = combined + " | " + col + "=" + df[col].astype("string").fillna("__MISSING__")
    return combined.astype("string")


def build_intersectional_findings(
    df: pd.DataFrame,
    sensitive_columns: List[str],
    prediction_column: str,
    target_column: Optional[str],
    positive_label: Any,
) -> List[Dict[str, Any]]:
    """Generate ALL subgroup combinations, rank by severity, return top-K worst.

    Improvement over original:
    - Generates all k-combinations for k=2..min(n, 3) instead of truncating
    - Ranks by worst disparate impact (ascending) → worst groups first
    - Returns up to MAX_INTERSECTIONAL_FINDINGS findings
    """
    available = [col for col in sensitive_columns if col in df.columns][:MAX_INTERSECTIONAL_COMPONENTS]
    if len(available) < 2:
        return []

    # Generate all pair and triple combinations
    all_combos: List[tuple] = []
    for k in range(2, min(len(available), MAX_INTERSECTIONAL_COMPONENTS) + 1):
        all_combos.extend(combinations(available, k))

    findings: List[Dict[str, Any]] = []
    for combo in all_combos:
        intersectional_name = " x ".join(combo)
        temp_column = "__intersectional__" + "__".join(combo)
        frame = pd.DataFrame(
            {
                temp_column: build_intersectional_group_labels(df, list(combo)),
                prediction_column: df[prediction_column],
            },
            index=df.index,
        )
        if target_column and target_column in df.columns:
            frame[target_column] = df[target_column]

        finding = compute_structured_fairness_metrics(
            frame, temp_column, prediction_column, target_column, positive_label,
        )
        if len(finding.get("group_metrics", [])) < 2:
            continue

        finding["sensitive_column"] = intersectional_name
        finding["component_sensitive_columns"] = list(combo)
        finding["is_intersectional"] = True
        finding["notes"] = [
            *finding.get("notes", []),
            f"Intersectional slice built from {', '.join(combo)}.",
        ]
        findings.append(finding)

    # Rank by severity: worst disparate impact first
    findings.sort(key=lambda f: f["disparate_impact"])

    return findings[:MAX_INTERSECTIONAL_FINDINGS]


# ---------------------------------------------------------------------------
# Overall fairness summary — computed from standard metrics, not magic numbers
# ---------------------------------------------------------------------------
def compute_overall_fairness_summary(
    findings: List[Dict[str, Any]],
    intersectional_findings: List[Dict[str, Any]],
) -> float:
    """Compute overall fairness score from constituent findings.

    Uses geometric mean of individual scores (penalizes outliers more than
    arithmetic mean) rather than the original's arbitrary weighted blend.
    """
    all_scores = [f["fairness_score"] for f in findings + intersectional_findings]
    if not all_scores:
        return 100.0
    # Geometric mean — single bad score pulls overall down
    clipped = [max(s, 0.01) for s in all_scores]
    geo_mean = float(np.exp(np.mean(np.log(clipped))))
    return round(max(0.0, min(100.0, geo_mean)), 2)


# ---------------------------------------------------------------------------
# Reweighing — kept from original but cleaned up
# ---------------------------------------------------------------------------
def compute_reweighing_weights(
    X: pd.DataFrame, y: pd.Series, sensitive_columns: List[str],
) -> Tuple[pd.Series, Dict[str, Any]]:
    available = [col for col in sensitive_columns if col in X.columns]
    default_weights = pd.Series(np.ones(len(y), dtype=float), index=y.index)

    if not available:
        return default_weights, {
            "applied": False, "strategy": "intersectional_reweighing",
            "group_columns": [], "notes": ["No sensitive columns available for reweighing."],
        }

    group_labels = build_intersectional_group_labels(X, available).astype(str)
    working = pd.DataFrame(
        {"__group__": group_labels, "__label__": y.astype(int)}, index=y.index,
    )

    total = len(working)
    if total == 0:
        return default_weights, {
            "applied": False, "strategy": "intersectional_reweighing",
            "group_columns": available, "notes": ["Training sample was empty."],
        }

    group_counts = working["__group__"].value_counts()
    label_counts = working["__label__"].value_counts()
    joint_counts = working.groupby(["__group__", "__label__"]).size()
    weights = pd.Series(np.ones(total, dtype=float), index=working.index)

    for (group_name, label_value), joint_count in joint_counts.items():
        if joint_count <= 0:
            continue
        raw_weight = (group_counts[group_name] * label_counts[label_value]) / max(total * joint_count, 1)
        if joint_count < MIN_REWEIGHING_CELL_COUNT:
            raw_weight = (raw_weight + 1.0) / 2.0
        mask = (working["__group__"] == group_name) & (working["__label__"] == label_value)
        weights.loc[mask] = raw_weight

    weights = weights.clip(REWEIGHING_WEIGHT_CLIP_MIN, REWEIGHING_WEIGHT_CLIP_MAX)
    weights = weights / max(float(weights.mean()), 1e-9)

    return weights, {
        "applied": True, "strategy": "intersectional_reweighing",
        "group_columns": available,
        "group_count": int(group_counts.shape[0]),
        "weight_min": round(float(weights.min()), 4),
        "weight_max": round(float(weights.max()), 4),
        "weight_mean": round(float(weights.mean()), 4),
        "notes": ["Training-time reweighing balanced label frequencies across intersectional groups."],
    }


# ---------------------------------------------------------------------------
# Root cause analysis
# ---------------------------------------------------------------------------
def estimate_proxy_signal(feature: pd.Series, sensitive: pd.Series) -> float:
    data = pd.DataFrame({"feature": feature.astype(str), "sensitive": sensitive.astype(str)}).dropna()
    if len(data) > MAX_PROXY_SCAN_ROWS:
        data = data.sample(MAX_PROXY_SCAN_ROWS, random_state=RANDOM_SEED)
    if data.empty:
        return 0.0
    contingency = pd.crosstab(data["feature"], data["sensitive"])
    total = contingency.to_numpy().sum()
    if total == 0:
        return 0.0
    expected = np.outer(contingency.sum(axis=1), contingency.sum(axis=0)) / total
    observed = contingency.to_numpy()
    with np.errstate(divide="ignore", invalid="ignore"):
        chi_sq = np.nansum((observed - expected) ** 2 / np.where(expected == 0, 1, expected))
    min_dim = min(contingency.shape) - 1
    if min_dim <= 0:
        return 0.0
    return float(min(np.sqrt((chi_sq / total) / min_dim), 1.0))


def build_root_causes(
    df: pd.DataFrame, sensitive_columns: List[str],
    target_column: Optional[str], prediction_column: str,
) -> List[Dict[str, Any]]:
    causes: List[Dict[str, Any]] = []
    sampled = sample_frame(df, MAX_PROXY_SCAN_ROWS, target_column)

    for sensitive in sensitive_columns:
        vc = sampled[sensitive].astype(str).value_counts(normalize=True)
        minority = float(vc.min()) if len(vc) > 1 else 0.0
        if minority < 0.2:
            causes.append({
                "type": "representation_imbalance",
                "sensitive_column": sensitive,
                "severity": "high" if minority < 0.1 else "medium",
                "details": f"Smallest group share is {minority:.1%}, suggesting underrepresentation.",
            })

        proxy_scores = []
        for col in sampled.columns:
            if col in {sensitive, target_column, prediction_column}:
                continue
            if sampled[col].nunique(dropna=True) < 2:
                continue
            proxy = estimate_proxy_signal(sampled[col], sampled[sensitive])
            if proxy >= 0.35:
                proxy_scores.append((col, proxy))
        for col, proxy in sorted(proxy_scores, key=lambda x: x[1], reverse=True)[:3]:
            causes.append({
                "type": "proxy_feature_risk",
                "sensitive_column": sensitive,
                "feature": col,
                "severity": "medium" if proxy < 0.55 else "high",
                "details": f"Feature '{col}' shows strong association with '{sensitive}' ({proxy:.2f}).",
            })
    return causes


def build_intersectional_root_causes(findings: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    causes = []
    for f in findings:
        if f["fairness_score"] >= 85 and f["disparate_impact"] >= DI_THRESHOLD:
            continue
        causes.append({
            "type": "intersectional_disparity",
            "sensitive_column": f["sensitive_column"],
            "severity": "high" if f["fairness_score"] < 65 or f["disparate_impact"] < DI_THRESHOLD else "medium",
            "details": (
                f"Intersectional slice '{f['sensitive_column']}' shows fairness {f['fairness_score']} "
                f"and disparate impact {f['disparate_impact']}."
            ),
        })
    return causes[:MAX_INTERSECTIONAL_FINDINGS]
