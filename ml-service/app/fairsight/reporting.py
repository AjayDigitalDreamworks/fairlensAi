"""
reporting.py — Bias Audit Report Generation & Model Export
Produces structured JSON and CSV reports matching the audit guide spec.
"""

import json
import os
import datetime
import pandas as pd
import joblib
import logging

logger = logging.getLogger(__name__)


def generate_bias_report(bias_before: dict, bias_after: dict,
                         sensitive_feature: str,
                         output_prefix: str,
                         mitigation_method: str = "N/A") -> tuple[str, str]:
    """
    Generate a structured bias audit report in JSON and CSV formats.
    Matches the guide's output schema exactly.
    """
    report = {
        "report_generated_at": datetime.datetime.utcnow().isoformat() + "Z",
        "protected_attribute": sensitive_feature,
        "mitigation_method": mitigation_method,
        "thresholds_used": {"dpd": 0.10, "eod": 0.10},
        "before_mitigation": {
            "accuracy": bias_before.get("accuracy", bias_before.get("accuracy_before", 0.0)),
            "balanced_accuracy": bias_before.get("balanced_accuracy",
                                                 bias_before.get("balanced_accuracy_before", 0.0)),
            "dpd": bias_before.get("dpd", bias_before.get("dpd_before", 0.0)),
            "eod": bias_before.get("eod", bias_before.get("eod_before", 0.0)),
            "biased": bias_before.get("is_biased", bias_before.get("biased", True)),
        },
        "after_mitigation": {
            "accuracy": bias_after.get("accuracy_after", bias_after.get("accuracy", 0.0)),
            "balanced_accuracy": bias_after.get("balanced_accuracy_after",
                                                bias_after.get("balanced_accuracy", 0.0)),
            "dpd": bias_after.get("dpd_after", bias_after.get("dpd", 0.0)),
            "eod": bias_after.get("eod_after", bias_after.get("eod", 0.0)),
            "biased": not bias_after.get("bias_resolved", False),
        },
        "improvements": {
            "accuracy_delta": bias_after.get("accuracy_delta", 0.0),
            "dpd_reduction": bias_after.get("dpd_reduction", 0.0),
            "eod_reduction": bias_after.get("eod_reduction", 0.0),
            "dpd_reduction_pct": bias_after.get("dpd_reduction_pct", 0.0),
            "eod_reduction_pct": bias_after.get("eod_reduction_pct", 0.0),
        },
        "mitigation_assessment": bias_after.get("summary", {}),
    }

    # Save JSON
    os.makedirs(os.path.dirname(output_prefix) or ".", exist_ok=True)
    json_path = f"{output_prefix}.json"
    with open(json_path, 'w') as f:
        json.dump(report, f, indent=2, default=str)

    # Save CSV summary
    rows = []
    for stage, data in [("Before", report["before_mitigation"]),
                         ("After", report["after_mitigation"])]:
        rows.append({"Stage": stage, **data})
    csv_path = f"{output_prefix}.csv"
    pd.DataFrame(rows).to_csv(csv_path, index=False)

    logger.info(f"Bias report saved: {json_path}, {csv_path}")
    return json_path, csv_path


def export_corrected_model(model, path: str, metadata: dict = None) -> tuple[str, str]:
    """
    Save the bias-mitigated model with metadata sidecar.
    Handles scikit-learn via joblib and Keras via model.save().
    """
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    
    # Switch to proper Keras saving if applicable
    if hasattr(model, "save") and str(type(model)).find("keras") != -1:
        if not path.endswith('.h5') and not path.endswith('.keras'):
            path = path.replace('.pkl', '.h5')
        model.save(path)
    else:
        joblib.dump(model, path)

    meta = {
        "exported_at": datetime.datetime.utcnow().isoformat() + "Z",
        "model_type": type(model).__name__,
        "mitigation_method": (metadata or {}).get("method", "unknown"),
        "fairness_constraint": (metadata or {}).get("constraint", "N/A"),
        "metrics_after": (metadata or {}).get("metrics", {}),
    }

    meta_path = path.replace(".pkl", "_metadata.json").replace(".joblib", "_metadata.json")
    with open(meta_path, 'w') as f:
        json.dump(meta, f, indent=2, default=str)

    logger.info(f"Model saved: {path} | Metadata: {meta_path}")
    return path, meta_path
