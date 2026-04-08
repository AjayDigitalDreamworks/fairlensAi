from __future__ import annotations

from itertools import combinations
from typing import Any, Dict, List, Optional, Sequence, Tuple

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

try:
    from fairlearn.postprocessing import ThresholdOptimizer
    from fairlearn.reductions import DemographicParity, EqualizedOdds, ExponentiatedGradient
    FAIRLEARN_MITIGATION_AVAILABLE = True
except Exception:
    FAIRLEARN_MITIGATION_AVAILABLE = False
    ThresholdOptimizer = None  # type: ignore
    DemographicParity = None  # type: ignore
    EqualizedOdds = None  # type: ignore
    ExponentiatedGradient = None  # type: ignore

from app.fairness.metrics import (
    build_intersectional_findings,
    compute_overall_fairness_summary,
    compute_structured_fairness_metrics,
)
from app.utils.column_inference import normalize_binary


def _accuracy(df: pd.DataFrame, target_column: Optional[str], pred_col: str, positive_label: Any) -> float:
    if not target_column or target_column not in df.columns:
        return 0.0
    y_true = normalize_binary(df[target_column], positive_label)
    y_pred = normalize_binary(df[pred_col], positive_label)
    return float((y_true == y_pred).mean())


def _selection_gap(series: pd.Series, threshold: float = 0.5) -> float:
    pred = (series >= threshold).astype(int)
    return float(pred.mean())


def _build_feature_matrix(
    df: pd.DataFrame,
    target_column: Optional[str],
    sensitive_columns: List[str],
    probability_column: Optional[str],
    prediction_column: str,
) -> pd.DataFrame:
    excluded = set([prediction_column, probability_column, target_column, "corrected_prediction", "corrected_probability"]) | set(sensitive_columns)
    feature_columns = [c for c in df.columns if c not in excluded]
    if not feature_columns:
        raise ValueError("No usable features available for fairlearn mitigation.")
    return df[feature_columns].copy()


def _build_tabular_preprocessor(X: pd.DataFrame) -> ColumnTransformer:
    categorical = [c for c in X.columns if not pd.api.types.is_numeric_dtype(X[c])]
    numeric = [c for c in X.columns if c not in categorical]
    return ColumnTransformer(
        transformers=[
            (
                "num",
                Pipeline(
                    [
                        ("imputer", SimpleImputer(strategy="median")),
                        ("scale", StandardScaler()),
                    ]
                ),
                numeric,
            ),
            (
                "cat",
                Pipeline(
                    [
                        ("imputer", SimpleImputer(strategy="most_frequent")),
                        ("onehot", OneHotEncoder(handle_unknown="ignore")),
                    ]
                ),
                categorical,
            ),
        ],
        remainder="drop",
    )


def _fairlearn_candidates(
    df: pd.DataFrame,
    sensitive_columns: List[str],
    prediction_column: str,
    target_column: Optional[str],
    positive_label: Any,
    probability_column: Optional[str],
) -> List[Dict[str, Any]]:
    if not FAIRLEARN_MITIGATION_AVAILABLE or not target_column or target_column not in df.columns or not sensitive_columns:
        return []

    candidates: List[Dict[str, Any]] = []
    try:
        X = _build_feature_matrix(df, target_column, sensitive_columns, probability_column, prediction_column)
    except Exception:
        return []

    y = normalize_binary(df[target_column], positive_label)
    if y.nunique() < 2:
        return []

    preprocessor = _build_tabular_preprocessor(X)
    base_estimator = Pipeline(
        [
            ("preprocess", preprocessor),
            ("model", LogisticRegression(max_iter=1000, class_weight="balanced")),
        ]
    )

    for sensitive_column in [s for s in sensitive_columns if s in df.columns][:2]:
        sensitive = df[sensitive_column].astype(str).fillna("missing")

        if ThresholdOptimizer is not None:
            for constraint in ["demographic_parity", "equalized_odds"]:
                try:
                    optimizer = ThresholdOptimizer(
                        estimator=base_estimator,
                        constraints=constraint,
                        objective="accuracy_score",
                        prefit=False,
                    )
                    optimizer.fit(X, y, sensitive_features=sensitive)
                    pred = pd.Series(optimizer.predict(X, sensitive_features=sensitive), index=df.index, dtype=int)
                    col = f"__fairai_fairlearn_threshold__{constraint}__{sensitive_column}"
                    pred = pred.rename(col)
                    temp = df.copy()
                    temp[col] = pred
                    result = _evaluate_candidate(temp, col, sensitive_columns, target_column, positive_label)
                    candidates.append(
                        {
                            "name": f"fairlearn_threshold::{constraint}::{sensitive_column}",
                            "prediction_column": col,
                            "prediction_series": pred,
                            **result,
                            "strategy_type": "fairlearn_threshold_optimizer",
                            "details": {"constraint": constraint, "sensitive_column": sensitive_column, "provider": "fairlearn"},
                        }
                    )
                except Exception:
                    pass

        if ExponentiatedGradient is not None and DemographicParity is not None and EqualizedOdds is not None:
            reductions = [
                ("demographic_parity", DemographicParity()),
                ("equalized_odds", EqualizedOdds()),
            ]
            for reduction_name, reduction in reductions:
                try:
                    mitigator = ExponentiatedGradient(
                        estimator=base_estimator,
                        constraints=reduction,
                    )
                    mitigator.fit(X, y, sensitive_features=sensitive)
                    pred = pd.Series(mitigator.predict(X), index=df.index, dtype=int)
                    col = f"__fairai_fairlearn_reduction__{reduction_name}__{sensitive_column}"
                    pred = pred.rename(col)
                    temp = df.copy()
                    temp[col] = pred
                    result = _evaluate_candidate(temp, col, sensitive_columns, target_column, positive_label)
                    candidates.append(
                        {
                            "name": f"fairlearn_reduction::{reduction_name}::{sensitive_column}",
                            "prediction_column": col,
                            "prediction_series": pred,
                            **result,
                            "strategy_type": "fairlearn_exponentiated_gradient",
                            "details": {"constraint": reduction_name, "sensitive_column": sensitive_column, "provider": "fairlearn"},
                        }
                    )
                except Exception:
                    pass

    return candidates


def _build_group_thresholds(
    df: pd.DataFrame,
    grouping: pd.Series,
    score_column: str,
    objective: str,
    base_threshold: float,
) -> Dict[str, float]:
    score = pd.to_numeric(df[score_column], errors="coerce").fillna(0.5)
    target_rate = _selection_gap(score, threshold=base_threshold)
    thresholds: Dict[str, float] = {}

    for group, idx in grouping.groupby(grouping).groups.items():
        group_scores = score.loc[idx]
        if len(group_scores) < 6:
            thresholds[str(group)] = base_threshold
            continue

        if objective == "demographic_parity":
            quantile = float(np.clip(1.0 - target_rate, 0.05, 0.95))
            thresholds[str(group)] = float(group_scores.quantile(quantile))
        else:
            offsets = np.linspace(-0.15, 0.15, 13)
            candidate_thresholds = np.clip(base_threshold + offsets, 0.1, 0.9)
            thresholds[str(group)] = float(np.median(candidate_thresholds))

    return thresholds


def _apply_group_thresholds(
    df: pd.DataFrame,
    grouping: pd.Series,
    score_column: str,
    thresholds: Dict[str, float],
    output_column: str,
) -> pd.Series:
    score = pd.to_numeric(df[score_column], errors="coerce").fillna(0.5)
    preds = pd.Series(index=df.index, dtype=int)
    for group, idx in grouping.groupby(grouping).groups.items():
        threshold = float(thresholds.get(str(group), 0.5))
        preds.loc[idx] = (score.loc[idx] >= threshold).astype(int)
    return preds.astype(int).rename(output_column)


def _optimize_thresholds_for_attribute(
    df: pd.DataFrame,
    sensitive_column: str,
    score_column: str,
    target_column: Optional[str],
    positive_label: Any,
    objective: str,
) -> Tuple[pd.Series, Dict[str, float], Dict[str, Any]]:
    grouping = df[sensitive_column].astype(str).fillna("missing")
    base_grid = np.linspace(0.25, 0.75, 11)
    best: Optional[Dict[str, Any]] = None

    for base_threshold in base_grid:
        thresholds = _build_group_thresholds(df, grouping, score_column, objective, float(base_threshold))
        col_name = f"__fairai_{objective}__{sensitive_column}"
        preds = _apply_group_thresholds(df, grouping, score_column, thresholds, col_name)
        temp = df.copy()
        temp[col_name] = preds
        findings = [compute_structured_fairness_metrics(temp, sensitive_column, col_name, target_column, positive_label)]
        fairness_score = compute_overall_fairness_summary(findings)
        accuracy = _accuracy(temp, target_column, col_name, positive_label)
        objective_score = fairness_score * 0.78 + accuracy * 100.0 * 0.22

        candidate = {
            "preds": preds,
            "thresholds": thresholds,
            "findings": findings,
            "fairness_score": fairness_score,
            "accuracy": accuracy,
            "objective_score": objective_score,
        }
        if best is None or candidate["objective_score"] > best["objective_score"]:
            best = candidate

    if best is None:
        raise ValueError(f"Unable to optimize thresholds for {sensitive_column}.")

    return best["preds"], best["thresholds"], {
        "objective": objective,
        "thresholds": best["thresholds"],
        "fairness_score": round(float(best["fairness_score"]), 6),
        "accuracy": round(float(best["accuracy"]), 6),
    }


def _intersectional_candidates(sensitive_columns: Sequence[str]) -> List[List[str]]:
    available = list(sensitive_columns)
    combos: List[List[str]] = []
    for size in range(2, min(3, len(available)) + 1):
        for combo in combinations(available, size):
            combos.append(list(combo))
    return combos[:4]


def _evaluate_candidate(
    df: pd.DataFrame,
    pred_col: str,
    sensitive_columns: List[str],
    target_column: Optional[str],
    positive_label: Any,
) -> Dict[str, Any]:
    findings = [
        compute_structured_fairness_metrics(df, s, pred_col, target_column, positive_label)
        for s in sensitive_columns
        if s in df.columns
    ]
    intersectional = build_intersectional_findings(df, sensitive_columns, pred_col, target_column, positive_label)
    score = compute_overall_fairness_summary(findings, intersectional)
    acc = _accuracy(df, target_column, pred_col, positive_label)
    worst = min((f["fairness_score"] for f in findings), default=score)
    return {
        "findings": findings,
        "intersectional_findings": intersectional,
        "fairness_score": score,
        "accuracy": acc,
        "worst_group_score": worst,
    }


def _score_shift_candidate(
    df: pd.DataFrame,
    sensitive_column: str,
    score_column: str,
    output_column: str,
) -> pd.Series:
    working = pd.to_numeric(df[score_column], errors="coerce").fillna(0.5)
    groups = df[sensitive_column].astype(str).fillna("missing")
    overall_mean = float(working.mean())
    adjusted = working.copy()
    for group, idx in groups.groupby(groups).groups.items():
        group_mean = float(working.loc[idx].mean())
        shift = np.clip((overall_mean - group_mean) * 0.35, -0.08, 0.08)
        adjusted.loc[idx] = np.clip(working.loc[idx] + shift, 0.0, 1.0)
    return (adjusted >= 0.5).astype(int).rename(output_column)


def choose_mitigation(
    df: pd.DataFrame,
    sensitive_columns: List[str],
    prediction_column: str,
    target_column: Optional[str],
    positive_label: Any = 1,
    probability_column: Optional[str] = None,
) -> Dict[str, Any]:
    working = df.copy()
    if probability_column and probability_column in working.columns:
        working[probability_column] = pd.to_numeric(working[probability_column], errors="coerce").clip(0, 1).fillna(0.5)

    baseline = _evaluate_candidate(working, prediction_column, sensitive_columns, target_column, positive_label)
    candidates: List[Dict[str, Any]] = [
        {
            "name": "baseline",
            "prediction_column": prediction_column,
            **baseline,
            "accepted": False,
            "reason": "reference",
            "strategy_type": "baseline",
        }
    ]

    if probability_column and probability_column in working.columns and sensitive_columns:
        for sensitive_column in sensitive_columns:
            if sensitive_column not in working.columns:
                continue

            for objective in ["demographic_parity", "equalized_odds_proxy"]:
                pred_series, thresholds, optimization_summary = _optimize_thresholds_for_attribute(
                    df=working,
                    sensitive_column=sensitive_column,
                    score_column=probability_column,
                    target_column=target_column,
                    positive_label=positive_label,
                    objective=objective,
                )
                col = pred_series.name
                working[col] = pred_series
                result = _evaluate_candidate(working, col, sensitive_columns, target_column, positive_label)
                candidates.append(
                    {
                        "name": f"{objective}::{sensitive_column}",
                        "prediction_column": col,
                        **result,
                        "strategy_type": objective,
                        "details": optimization_summary,
                    }
                )

            shift_col = f"__fairai_shifted__{sensitive_column}"
            working[shift_col] = _score_shift_candidate(working, sensitive_column, probability_column, shift_col)
            shifted_result = _evaluate_candidate(working, shift_col, sensitive_columns, target_column, positive_label)
            candidates.append(
                {
                    "name": f"score_shift::{sensitive_column}",
                    "prediction_column": shift_col,
                    **shifted_result,
                    "strategy_type": "score_shift",
                    "details": {"sensitive_column": sensitive_column},
                }
            )

        for combo in _intersectional_candidates([s for s in sensitive_columns if s in working.columns]):
            combo_name = "__".join(combo)
            grouping_col = f"__fairai_intersection_group__{combo_name}"
            working[grouping_col] = working[combo].astype(str).agg(" | ".join, axis=1)
            pred_series, thresholds, optimization_summary = _optimize_thresholds_for_attribute(
                df=working,
                sensitive_column=grouping_col,
                score_column=probability_column,
                target_column=target_column,
                positive_label=positive_label,
                objective="demographic_parity",
            )
            working[pred_series.name] = pred_series
            result = _evaluate_candidate(working, pred_series.name, sensitive_columns, target_column, positive_label)
            candidates.append(
                {
                    "name": f"intersectional_threshold::{combo_name}",
                    "prediction_column": pred_series.name,
                    **result,
                    "strategy_type": "intersectional_threshold",
                    "details": {"components": combo, **optimization_summary},
                }
            )

    for fairlearn_candidate in _fairlearn_candidates(
        df=working,
        sensitive_columns=sensitive_columns,
        prediction_column=prediction_column,
        target_column=target_column,
        positive_label=positive_label,
        probability_column=probability_column,
    ):
        fairlearn_col = fairlearn_candidate["prediction_column"]
        prediction_series = fairlearn_candidate.pop("prediction_series", None)
        if prediction_series is not None:
            working[fairlearn_col] = prediction_series
        candidates.append(fairlearn_candidate)

    baseline_acc = baseline["accuracy"]
    baseline_score = baseline["fairness_score"]
    baseline_worst = baseline["worst_group_score"]
    accepted: List[Dict[str, Any]] = []

    for candidate in candidates[1:]:
        gain = float(candidate["fairness_score"] - baseline_score)
        acc_drop = float(baseline_acc - candidate["accuracy"])
        worst_improvement = float(candidate["worst_group_score"] - baseline_worst)
        candidate["fairness_gain"] = round(gain, 6)
        candidate["accuracy_drop"] = round(acc_drop, 6)
        candidate["worst_group_improvement"] = round(worst_improvement, 6)
        candidate["selection_score"] = round(gain * 0.75 - acc_drop * 100.0 * 0.15 + worst_improvement * 0.10, 6)
        candidate["accepted"] = bool(gain >= 1.0 and acc_drop <= 0.04 and worst_improvement >= -0.5)
        candidate["reason"] = (
            "accepted"
            if candidate["accepted"]
            else "Rejected: fairness gain too small, accuracy drop too high, or worst subgroup degraded."
        )
        if candidate["accepted"]:
            accepted.append(candidate)

    chosen = (
        sorted(
            accepted,
            key=lambda item: (
                item["selection_score"],
                item["fairness_gain"],
                -item["accuracy_drop"],
                item["worst_group_improvement"],
            ),
            reverse=True,
        )[0]
        if accepted
        else candidates[0]
    )

    final_col = chosen["prediction_column"]
    corrected = working.copy()
    corrected["corrected_prediction"] = normalize_binary(corrected[final_col], 1)
    if probability_column and probability_column in corrected.columns:
        corrected["corrected_probability"] = pd.to_numeric(corrected[probability_column], errors="coerce").clip(0, 1).fillna(0.5)
    else:
        corrected["corrected_probability"] = corrected["corrected_prediction"].astype(float)

    return {
        "corrected_df": corrected,
        "baseline": baseline,
        "candidates": candidates,
        "selected_candidate": chosen,
        "accepted": chosen.get("accepted", False),
        "acceptance_reason": chosen.get("reason") if chosen.get("accepted", False) else "no safe correction found",
    }
