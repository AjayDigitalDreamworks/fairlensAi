"""
bias_detection.py — Full Bias Detection Module
Implements comprehensive fairness auditing using Fairlearn MetricFrame.
Supports sklearn (predict_proba) and Keras/TF (predict) models.
"""

import numpy as np
import pandas as pd
from sklearn.metrics import (
    accuracy_score, balanced_accuracy_score, f1_score,
    roc_auc_score, recall_score, precision_score,
    classification_report
)
from fairlearn.metrics import (
    MetricFrame, demographic_parity_difference,
    equalized_odds_difference, selection_rate,
    true_positive_rate, false_positive_rate
)
import logging

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────
# Common sensitive-attribute keywords for auto-detection
# ─────────────────────────────────────────────
SENSITIVE_KEYWORDS = [
    "gender", "sex", "race", "ethnicity", "age", "age_group",
    "disability", "religion", "marital", "nationality", "color",
    "orientation", "veteran", "pregnant", "native",
]


def sanitize(obj):
    """Recursively convert numpy types to native Python for JSON serialization."""
    if isinstance(obj, dict):
        return {k: sanitize(v) for k, v in obj.items()}
    elif isinstance(obj, (list, tuple, np.ndarray)):
        return [sanitize(i) for i in obj]
    elif isinstance(obj, (np.bool_, bool)):
        return bool(obj)
    elif isinstance(obj, (np.integer, int)):
        return int(obj)
    elif isinstance(obj, (np.floating, float)):
        return float(obj)
    elif hasattr(obj, "item"):
        return obj.item()
    else:
        return obj


# ─────────────────────────────────────────────
# Auto-detection of sensitive columns
# ─────────────────────────────────────────────
def auto_detect_sensitive_columns(df: pd.DataFrame) -> list[dict]:
    """
    Scan DataFrame columns for likely protected attributes.
    Returns a list of dicts with column name, reason, and unique values.
    """
    detected = []
    for col in df.columns:
        col_lower = col.lower().strip().replace(" ", "_")
        for keyword in SENSITIVE_KEYWORDS:
            if keyword in col_lower:
                unique_vals = df[col].dropna().unique().tolist()
                detected.append({
                    "column": col,
                    "keyword_match": keyword,
                    "unique_values": unique_vals[:20],  # cap for display
                    "unique_count": int(df[col].nunique()),
                    "dtype": str(df[col].dtype),
                })
                break
    return detected


# ─────────────────────────────────────────────
# Predictions
# ─────────────────────────────────────────────
def get_predictions(model, X, threshold: float = 0.5):
    """
    Generate hard predictions and probability scores.
    Works for both sklearn (predict_proba) and Keras (predict).
    """
    if hasattr(model, 'predict_proba'):
        try:
            probs = model.predict_proba(X)
            if probs.shape[1] == 2:
                y_prob = probs[:, 1]
            else:
                y_prob = np.max(probs, axis=1)
        except Exception:
            y_prob = model.predict(X).ravel()
    elif hasattr(model, 'predict'):
        raw = model.predict(X).ravel()
        y_prob = raw
    else:
        raise ValueError("Model must implement predict or predict_proba")

    y_pred = (y_prob >= threshold).astype(int)
    return y_pred, y_prob


# ─────────────────────────────────────────────
# Extended performance metrics
# ─────────────────────────────────────────────
def compute_extended_performance(y_true, y_pred, y_prob):
    """Compute full model performance metrics."""
    acc = accuracy_score(y_true, y_pred)
    bal_acc = balanced_accuracy_score(y_true, y_pred)
    f1 = f1_score(y_true, y_pred, zero_division=0)
    prec = precision_score(y_true, y_pred, zero_division=0)
    rec = recall_score(y_true, y_pred, zero_division=0)

    try:
        auc = roc_auc_score(y_true, y_prob)
    except Exception:
        auc = 0.0

    return {
        "accuracy": float(acc),
        "balanced_accuracy": float(bal_acc),
        "f1": float(f1),
        "precision": float(prec),
        "recall": float(rec),
        "auc_roc": float(auc),
        "positive_rate": float(y_pred.mean()),
    }


# ─────────────────────────────────────────────
# Fairness metrics via Fairlearn MetricFrame
# ─────────────────────────────────────────────
def compute_fairness_metrics(y_true, y_pred, sensitive_features):
    """
    Compute Demographic Parity Difference, Equalized Odds Difference,
    and per-group breakdown using Fairlearn MetricFrame.
    """
    dpd = demographic_parity_difference(
        y_true=y_true, y_pred=y_pred,
        sensitive_features=sensitive_features
    )
    eod = equalized_odds_difference(
        y_true=y_true, y_pred=y_pred,
        sensitive_features=sensitive_features
    )

    metrics = {
        "accuracy": lambda yt, yp: float((yt == yp).mean()),
        "selection_rate": selection_rate,
        "true_positive_rate": recall_score,
        "false_positive_rate": false_positive_rate,
        "precision": lambda yt, yp: float(precision_score(yt, yp, zero_division=0)),
    }

    mf = MetricFrame(
        metrics=metrics,
        y_true=y_true,
        y_pred=y_pred,
        sensitive_features=sensitive_features
    )

    by_group = []
    for group, row in mf.by_group.iterrows():
        by_group.append({
            "group": str(group),
            "accuracy": float(row["accuracy"]),
            "selection_rate": float(row["selection_rate"]),
            "true_positive_rate": float(row["true_positive_rate"]),
            "false_positive_rate": float(row["false_positive_rate"]),
            "precision": float(row["precision"]),
        })

    overall_metrics = {
        "accuracy": float(mf.overall["accuracy"]),
        "selection_rate": float(mf.overall["selection_rate"]),
        "true_positive_rate": float(mf.overall["true_positive_rate"]),
        "false_positive_rate": float(mf.overall["false_positive_rate"]),
        "precision": float(mf.overall["precision"]),
    }

    differences = {}
    for key in metrics:
        differences[key] = float(mf.difference()[key])

    return float(dpd), float(eod), by_group, overall_metrics, differences


# ─────────────────────────────────────────────
# Bootstrap confidence interval for DPD
# ─────────────────────────────────────────────
def bootstrap_dpd_ci(y_true, y_pred, sensitive_features,
                     n_bootstrap=1000, ci=0.95):
    """Bootstrap confidence interval for DPD to determine statistical significance."""
    y_true = np.array(y_true)
    y_pred = np.array(y_pred)
    sensitive = np.array(sensitive_features)

    n_samples = len(y_true)
    dpd_estimates = []

    np.random.seed(42)
    for _ in range(n_bootstrap):
        indices = np.random.randint(0, n_samples, n_samples)
        dpd = demographic_parity_difference(
            y_true[indices], y_pred[indices],
            sensitive_features=sensitive[indices]
        )
        dpd_estimates.append(dpd)

    lower_bound = np.percentile(dpd_estimates, (1 - ci) / 2 * 100)
    upper_bound = np.percentile(dpd_estimates, (1 + ci) / 2 * 100)
    significant = lower_bound > 0.01

    return float(lower_bound), float(upper_bound), bool(significant)


# ─────────────────────────────────────────────
# Intersectional analysis
# ─────────────────────────────────────────────
def compute_intersectional_metrics(y_true, y_pred, df, attrs):
    """Calculate intersectional demographic parity across attribute combinations."""
    if len(attrs) < 2:
        return []

    intersectional_attr = df[attrs].apply(
        lambda row: ' × '.join(row.values.astype(str)), axis=1
    )

    metrics = {"selection_rate": selection_rate}
    mf = MetricFrame(
        metrics=metrics, y_true=y_true, y_pred=y_pred,
        sensitive_features=intersectional_attr
    )

    by_inter = []
    for group, row in mf.by_group.iterrows():
        by_inter.append({
            "intersection": str(group),
            "selection_rate": float(row["selection_rate"]),
        })
    return by_inter


# ─────────────────────────────────────────────
# Severity interpretation
# ─────────────────────────────────────────────
def interpret_severity(dpd: float, eod: float) -> dict:
    """
    Interpret fairness metric scores into human-readable severity levels.
    Based on standard fairness thresholds from the guide.
    """
    def _level(val):
        val = abs(val)
        if val <= 0.05:
            return {"level": "low", "label": "Low Bias", "action": "Model likely fair — no immediate action needed"}
        elif val <= 0.10:
            return {"level": "moderate", "label": "Moderate Bias", "action": "Review recommended — monitor in production"}
        elif val <= 0.20:
            return {"level": "high", "label": "High Bias", "action": "Mitigation required before deployment"}
        else:
            return {"level": "severe", "label": "Severe Bias", "action": "Model should not be deployed — immediate correction needed"}

    dpd_severity = _level(dpd)
    eod_severity = _level(eod)

    # Overall severity is the worse of the two
    severity_order = {"low": 0, "moderate": 1, "high": 2, "severe": 3}
    overall = dpd_severity if severity_order[dpd_severity["level"]] >= severity_order[eod_severity["level"]] else eod_severity

    return {
        "dpd_severity": dpd_severity,
        "eod_severity": eod_severity,
        "overall_severity": overall,
    }


# ─────────────────────────────────────────────
# Main detection pipeline
# ─────────────────────────────────────────────
def detect_bias(model, X_test, y_test, sensitive_features,
                dpd_threshold=0.10, eod_threshold=0.10):
    """
    Full bias detection pipeline.
    Returns a comprehensive report with performance, fairness metrics,
    per-group breakdown, severity interpretation, and statistical significance.
    """
    y_pred, y_prob = get_predictions(model, X_test)

    # Performance metrics
    perf = compute_extended_performance(y_test, y_pred, y_prob)

    # Fairness metrics with per-group breakdown
    dpd, eod, by_group, overall_metrics, metric_differences = compute_fairness_metrics(
        y_test, y_pred, sensitive_features
    )

    # Statistical significance
    lb, ub, sig = bootstrap_dpd_ci(y_test, y_pred, sensitive_features)

    # Bias determination
    is_biased = False
    if abs(dpd) > dpd_threshold and sig:
        is_biased = True
    if abs(eod) > eod_threshold:
        is_biased = True

    # Severity interpretation
    severity = interpret_severity(dpd, eod)

    # Accuracy gap analysis
    group_accuracies = [g["accuracy"] for g in by_group]
    accuracy_gap = max(group_accuracies) - min(group_accuracies) if group_accuracies else 0.0
    accuracy_gap_acceptable = accuracy_gap < 0.03

    logger.info(f"[DETECT] DPD={dpd:.4f} EOD={eod:.4f} Biased={is_biased} "
                f"Severity={severity['overall_severity']['level']} AccGap={accuracy_gap:.4f}")

    return sanitize({
        "performance": perf,
        "dpd": dpd,
        "eod": eod,
        "dpd_ci": [lb, ub],
        "statistically_significant": sig,
        "is_biased": is_biased,
        "severity": severity,
        "by_group": by_group,
        "overall_metrics": overall_metrics,
        "metric_differences": metric_differences,
        "accuracy_gap": accuracy_gap,
        "accuracy_gap_acceptable": accuracy_gap_acceptable,
        "thresholds_used": {"dpd": dpd_threshold, "eod": eod_threshold},
        "raw_predictions": y_pred,
        "raw_probabilities": y_prob,
    })
