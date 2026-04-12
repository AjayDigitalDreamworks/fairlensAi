"""
evaluation.py — Before/After Mitigation Evaluation Module
Provides full side-by-side comparison of fairness and accuracy metrics.
"""

import pandas as pd
from sklearn.metrics import accuracy_score, balanced_accuracy_score, f1_score
from fairlearn.metrics import (
    demographic_parity_difference,
    equalized_odds_difference,
)
from .bias_detection import sanitize


def evaluate_before_after(y_test, y_before, y_after,
                          sensitive_features, method_name='Mitigated'):
    """
    Full evaluation: accuracy + fairness metrics before and after mitigation.
    Returns a structured comparison dict.
    """
    acc_before = accuracy_score(y_test, y_before)
    acc_after = accuracy_score(y_test, y_after)

    bal_acc_before = balanced_accuracy_score(y_test, y_before)
    bal_acc_after = balanced_accuracy_score(y_test, y_after)

    f1_before = f1_score(y_test, y_before, zero_division=0)
    f1_after = f1_score(y_test, y_after, zero_division=0)

    dpd_before = demographic_parity_difference(
        y_test, y_before, sensitive_features=sensitive_features
    )
    dpd_after = demographic_parity_difference(
        y_test, y_after, sensitive_features=sensitive_features
    )

    eod_before = equalized_odds_difference(
        y_test, y_before, sensitive_features=sensitive_features
    )
    eod_after = equalized_odds_difference(
        y_test, y_after, sensitive_features=sensitive_features
    )

    dpd_reduction = abs(dpd_before) - abs(dpd_after)
    eod_reduction = abs(eod_before) - abs(eod_after)

    dpd_reduction_pct = (dpd_reduction / abs(dpd_before) * 100) if abs(dpd_before) > 0.001 else 0.0
    eod_reduction_pct = (eod_reduction / abs(eod_before) * 100) if abs(eod_before) > 0.001 else 0.0

    # Determine if mitigation was successful
    bias_resolved = abs(dpd_after) <= 0.10 and abs(eod_after) <= 0.10
    accuracy_acceptable = (acc_before - acc_after) <= 0.03

    return sanitize({
        "method": method_name,

        # Accuracy
        "accuracy_before": float(acc_before),
        "accuracy_after": float(acc_after),
        "accuracy_delta": float(acc_after - acc_before),

        # Balanced accuracy
        "balanced_accuracy_before": float(bal_acc_before),
        "balanced_accuracy_after": float(bal_acc_after),

        # F1
        "f1_before": float(f1_before),
        "f1_after": float(f1_after),

        # DPD
        "dpd_before": float(dpd_before),
        "dpd_after": float(dpd_after),
        "dpd_reduction": float(dpd_reduction),
        "dpd_reduction_pct": round(float(dpd_reduction_pct), 1),

        # EOD
        "eod_before": float(eod_before),
        "eod_after": float(eod_after),
        "eod_reduction": float(eod_reduction),
        "eod_reduction_pct": round(float(eod_reduction_pct), 1),

        # Status
        "bias_resolved": bias_resolved,
        "accuracy_acceptable": accuracy_acceptable,
        "mitigation_successful": bias_resolved and accuracy_acceptable,

        # Summary
        "summary": {
            "verdict": "SUCCESS" if (bias_resolved and accuracy_acceptable) else "PARTIAL" if bias_resolved else "NEEDS_REVIEW",
            "accuracy_impact": f"{(acc_after - acc_before) * 100:+.2f}%",
            "dpd_impact": f"Reduced by {dpd_reduction_pct:.1f}%",
            "eod_impact": f"Reduced by {eod_reduction_pct:.1f}%",
        },
    })
