"""Constrained optimization for fairness correction.

Replaces the heuristic massaging / threshold tweaking / iterative repair
with mathematically grounded constrained optimization.

Mathematical formulation:
    Minimize:   Σᵢ L(ŷᵢ(θ), yᵢ)        [prediction error]
    Subject to: DI(θ)  ≥ 0.8             [disparate impact ≥ 4/5ths]
                DP(θ)  ≤ 0.1             [demographic parity gap]
                EO(θ)  ≤ 0.1             [equalized odds gap]

Where θ = {θ_g} are per-group decision thresholds on calibrated probabilities.

Solver: scipy.optimize.minimize with COBYLA (Constrained Optimization BY Linear
Approximation) — derivative-free, handles inequality constraints natively.

Why COBYLA over alternatives:
- No gradients needed (thresholds create non-differentiable loss)
- Handles inequality constraints directly
- Works well for low-dimensional problems (n_groups typically 2-5)
- Much better than grid search over 9 discrete values (original code)
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from scipy.optimize import minimize

from app.core import (
    DI_THRESHOLD,
    DP_THRESHOLD,
    EO_THRESHOLD,
    normalize_binary,
    safe_divide,
)


def _apply_group_thresholds(
    probabilities: np.ndarray,
    group_labels: np.ndarray,
    groups: List[str],
    thresholds: Dict[str, float],
) -> np.ndarray:
    """Apply per-group thresholds to calibrated probabilities."""
    predictions = np.zeros(len(probabilities), dtype=int)
    for group in groups:
        mask = group_labels == group
        t = thresholds.get(group, 0.5)
        predictions[mask] = (probabilities[mask] >= t).astype(int)
    return predictions


def _compute_fairness_violation(
    predictions: np.ndarray,
    targets: Optional[np.ndarray],
    group_labels: np.ndarray,
    groups: List[str],
    baseline_group: str,
) -> Dict[str, float]:
    """Compute fairness violation magnitudes for a set of predictions."""
    baseline_mask = group_labels == baseline_group
    baseline_rate = float(predictions[baseline_mask].mean()) if baseline_mask.sum() > 0 else 0.0

    selection_rates = {}
    tpr_values = {}
    fpr_values = {}

    for group in groups:
        mask = group_labels == group
        if mask.sum() == 0:
            continue
        sr = float(predictions[mask].mean())
        selection_rates[group] = sr

        if targets is not None:
            tp = int(((predictions[mask] == 1) & (targets[mask] == 1)).sum())
            fn = int(((predictions[mask] == 0) & (targets[mask] == 1)).sum())
            fp = int(((predictions[mask] == 1) & (targets[mask] == 0)).sum())
            tn = int(((predictions[mask] == 0) & (targets[mask] == 0)).sum())
            tpr_values[group] = safe_divide(tp, tp + fn)
            fpr_values[group] = safe_divide(fp, fp + tn)

    # Disparate impact
    impacts = [safe_divide(sr, baseline_rate) for sr in selection_rates.values()]
    di = min(impacts) if impacts else 1.0

    # Demographic parity difference
    rates = list(selection_rates.values())
    dp_diff = (max(rates) - min(rates)) if rates else 0.0

    # Equalized odds gap
    tpr_gap = (max(tpr_values.values()) - min(tpr_values.values())) if len(tpr_values) >= 2 else 0.0
    fpr_gap = (max(fpr_values.values()) - min(fpr_values.values())) if len(fpr_values) >= 2 else 0.0
    eo_gap = max(tpr_gap, fpr_gap)

    return {
        "disparate_impact": di,
        "dp_diff": dp_diff,
        "eo_gap": eo_gap,
        "tpr_gap": tpr_gap,
        "fpr_gap": fpr_gap,
    }


def optimize_thresholds(
    df: pd.DataFrame,
    sensitive_column: str,
    probability_column: str,
    target_column: Optional[str],
    positive_label: Any,
    fairness_mode: str = "balanced",
) -> Tuple[pd.DataFrame, Dict[str, Any]]:
    """Find optimal per-group thresholds via constrained optimization.

    Args:
        fairness_mode: "strict" (prioritize fairness), "balanced" (equal weight),
                       or "lenient" (prioritize accuracy). This controls the
                       relative weight of fairness vs accuracy in the objective.

    Returns:
        (corrected_dataframe, optimization_summary)
    """
    working = df.copy()
    groups = working[sensitive_column].astype(str).value_counts().head(5).index.tolist()

    if len(groups) < 2:
        working["corrected_prediction"] = (
            pd.to_numeric(working[probability_column], errors="coerce").fillna(0.5) >= 0.5
        ).astype(int)
        working["corrected_probability"] = working[probability_column]
        working["correction_note"] = "No correction needed — single group"
        working["correction_method"] = "none"
        return working, {
            "method": "none",
            "sensitive_column": sensitive_column,
            "applied": False,
            "thresholds": {},
        }

    probabilities = pd.to_numeric(working[probability_column], errors="coerce").fillna(0.5).values
    group_labels = working[sensitive_column].astype(str).values
    baseline_group = groups[0]

    targets = None
    if target_column and target_column in working.columns:
        targets = normalize_binary(working[target_column], positive_label).values

    # Fairness mode controls the accuracy-fairness tradeoff weight
    mode_weights = {
        "strict": 0.2,    # 20% accuracy, 80% fairness
        "balanced": 0.5,  # 50/50
        "lenient": 0.8,   # 80% accuracy, 20% fairness
    }
    accuracy_weight = mode_weights.get(fairness_mode, 0.5)
    fairness_weight = 1.0 - accuracy_weight

    def objective(theta: np.ndarray) -> float:
        """Minimize: (accuracy_weight * error) + (fairness_weight * violations)."""
        thresholds = {groups[i]: float(np.clip(theta[i], 0.01, 0.99)) for i in range(len(groups))}
        preds = _apply_group_thresholds(probabilities, group_labels, groups, thresholds)

        # Accuracy loss
        if targets is not None:
            error = 1.0 - float((preds == targets).mean())
        else:
            # Without targets, minimize deviation from calibrated predictions
            baseline_preds = (probabilities >= 0.5).astype(int)
            error = 1.0 - float((preds == baseline_preds).mean())

        # Fairness violations as penalty
        violations = _compute_fairness_violation(preds, targets, group_labels, groups, baseline_group)
        di_penalty = max(0.0, DI_THRESHOLD - violations["disparate_impact"])
        dp_penalty = max(0.0, violations["dp_diff"] - DP_THRESHOLD)
        eo_penalty = max(0.0, violations["eo_gap"] - EO_THRESHOLD)
        fairness_loss = di_penalty + dp_penalty + eo_penalty

        return accuracy_weight * error + fairness_weight * fairness_loss

    # Constraints for COBYLA (must return >= 0 when satisfied)
    constraints = [
        {
            "type": "ineq",
            "fun": lambda theta: _compute_fairness_violation(
                _apply_group_thresholds(probabilities, group_labels, groups,
                                        {groups[i]: float(np.clip(theta[i], 0.01, 0.99)) for i in range(len(groups))}),
                targets, group_labels, groups, baseline_group,
            )["disparate_impact"] - DI_THRESHOLD,
        },
        {
            "type": "ineq",
            "fun": lambda theta: DP_THRESHOLD - _compute_fairness_violation(
                _apply_group_thresholds(probabilities, group_labels, groups,
                                        {groups[i]: float(np.clip(theta[i], 0.01, 0.99)) for i in range(len(groups))}),
                targets, group_labels, groups, baseline_group,
            )["dp_diff"],
        },
        {
            "type": "ineq",
            "fun": lambda theta: EO_THRESHOLD - _compute_fairness_violation(
                _apply_group_thresholds(probabilities, group_labels, groups,
                                        {groups[i]: float(np.clip(theta[i], 0.01, 0.99)) for i in range(len(groups))}),
                targets, group_labels, groups, baseline_group,
            )["eo_gap"],
        },
    ]

    # Initial point: 0.5 for all groups
    theta0 = np.full(len(groups), 0.5)

    # Run COBYLA optimization
    result = minimize(
        objective, theta0,
        method="COBYLA",
        constraints=constraints,
        options={"maxiter": 500, "rhobeg": 0.1},
    )

    optimal_thresholds = {
        groups[i]: round(float(np.clip(result.x[i], 0.01, 0.99)), 4)
        for i in range(len(groups))
    }

    # Apply optimal thresholds
    final_preds = _apply_group_thresholds(probabilities, group_labels, groups, optimal_thresholds)
    working["corrected_prediction"] = final_preds
    working["corrected_probability"] = probabilities
    working["correction_note"] = "Optimized per-group threshold"
    working["correction_method"] = "constrained_optimization"

    # Compute final violation levels
    final_violations = _compute_fairness_violation(
        final_preds, targets, group_labels, groups, baseline_group,
    )

    return working, {
        "method": "constrained_optimization",
        "sensitive_column": sensitive_column,
        "applied": True,
        "fairness_mode": fairness_mode,
        "accuracy_weight": accuracy_weight,
        "fairness_weight": fairness_weight,
        "optimal_thresholds": optimal_thresholds,
        "optimizer_success": bool(result.success),
        "optimizer_message": str(result.message),
        "final_violations": {
            "disparate_impact": round(final_violations["disparate_impact"], 4),
            "dp_diff": round(final_violations["dp_diff"], 4),
            "eo_gap": round(final_violations["eo_gap"], 4),
        },
        "constraints_satisfied": {
            "di_pass": final_violations["disparate_impact"] >= DI_THRESHOLD,
            "dp_pass": final_violations["dp_diff"] <= DP_THRESHOLD,
            "eo_pass": final_violations["eo_gap"] <= EO_THRESHOLD,
        },
    }


def build_corrected_dataset(
    df: pd.DataFrame,
    sensitive_columns: List[str],
    prediction_column: str,
    target_column: Optional[str],
    positive_label: Any,
    score_column: Optional[str],
    fairness_mode: str = "balanced",
) -> Tuple[pd.DataFrame, Dict[str, Any]]:
    """Build corrected dataset using constrained optimization.

    Replaces the original's massaging + threshold tweaking + iterative repair
    with a single, mathematically principled optimization pass per sensitive column.
    """
    corrected = df.copy()

    # Handle re-audit of already-corrected data
    if prediction_column == "corrected_prediction" and "corrected_prediction" in corrected.columns:
        if "corrected_probability" not in corrected.columns:
            corrected["corrected_probability"] = _get_probability_series(
                corrected, "corrected_prediction", score_column, positive_label,
            )
        if "correction_note" not in corrected.columns:
            corrected["correction_note"] = "Re-audited existing corrected artifact"
        if "correction_method" not in corrected.columns:
            corrected["correction_method"] = "re_audit_existing_correction"
        return corrected, {
            "method": "re_audit_existing_correction",
            "notes": ["Uploaded file already contained corrected predictions."],
            "optimization_results": [],
            "fairness_target": 95.0,
        }

    # Get base probabilities
    base_probs = _get_probability_series(corrected, prediction_column, score_column, positive_label)
    corrected["corrected_probability"] = base_probs
    corrected["corrected_prediction"] = (base_probs >= 0.5).astype(int)
    corrected["correction_note"] = "Baseline prediction"

    optimization_results = []
    for sensitive in sensitive_columns:
        corrected, opt_summary = optimize_thresholds(
            corrected, sensitive, "corrected_probability",
            target_column, positive_label, fairness_mode,
        )
        optimization_results.append(opt_summary)

    corrected["correction_method"] = "constrained_optimization"

    return corrected, {
        "method": "constrained_optimization",
        "fairness_mode": fairness_mode,
        "notes": [
            "Correction uses constrained optimization (COBYLA) to find per-group thresholds.",
            f"Fairness mode: {fairness_mode}.",
        ],
        "optimization_results": optimization_results,
        "fairness_target": 95.0,
    }


def compute_tradeoff_curve(
    df: pd.DataFrame,
    sensitive_columns: List[str],
    prediction_column: str,
    target_column: Optional[str],
    positive_label: Any,
    score_column: Optional[str],
    n_points: int = 7,
) -> List[Dict[str, Any]]:
    """Generate fairness vs accuracy tradeoff curve.

    Runs optimization at different fairness strictness levels to show
    the frontier of achievable (fairness, accuracy) pairs.
    """
    # Define sweep from strict to lenient
    sweep_weights = np.linspace(0.1, 0.9, n_points)
    curve = []

    base_probs = _get_probability_series(df, prediction_column, score_column, positive_label)
    targets = normalize_binary(df[target_column], positive_label).values if target_column and target_column in df.columns else None

    for w in sweep_weights:
        temp = df.copy()
        temp["__probs__"] = base_probs
        temp["corrected_prediction"] = (base_probs >= 0.5).astype(int)
        temp["corrected_probability"] = base_probs

        # Set the mode based on weight
        if w <= 0.3:
            mode_label = "strict"
        elif w <= 0.7:
            mode_label = "balanced"
        else:
            mode_label = "lenient"

        for sensitive in sensitive_columns:
            temp, _ = optimize_thresholds(
                temp, sensitive, "corrected_probability",
                target_column, positive_label,
                fairness_mode=mode_label,
            )

        preds = temp["corrected_prediction"].values
        accuracy = float((preds == targets).mean()) if targets is not None else None

        # Compute summary fairness
        from app.fairness.metrics import compute_structured_fairness_metrics
        fairness_scores = []
        for sensitive in sensitive_columns:
            fm = compute_structured_fairness_metrics(
                temp, sensitive, "corrected_prediction", target_column, positive_label,
            )
            fairness_scores.append(fm["fairness_score"])
        avg_fairness = float(np.mean(fairness_scores)) if fairness_scores else 100.0

        curve.append({
            "accuracy_weight": round(float(w), 2),
            "mode": mode_label,
            "accuracy": round(accuracy, 4) if accuracy is not None else None,
            "fairness_score": round(avg_fairness, 2),
        })

    return curve


def _get_probability_series(
    df: pd.DataFrame,
    prediction_column: str,
    score_column: Optional[str],
    positive_label: Any,
) -> pd.Series:
    from app.core import is_probability_like
    if score_column and score_column in df.columns and is_probability_like(df[score_column]):
        return pd.to_numeric(df[score_column], errors="coerce").fillna(0.0).clip(0.0, 1.0)
    if is_probability_like(df[prediction_column]):
        return pd.to_numeric(df[prediction_column], errors="coerce").fillna(0.0).clip(0.0, 1.0)
    return normalize_binary(df[prediction_column], positive_label).astype(float)
