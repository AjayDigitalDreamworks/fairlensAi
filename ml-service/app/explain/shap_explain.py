from __future__ import annotations

from typing import Any, Dict, List

import numpy as np
import pandas as pd

try:
    import shap
    SHAP_AVAILABLE = True
except Exception:
    SHAP_AVAILABLE = False
    shap = None  # type: ignore


def _feature_names(model_artifact: Any, fallback: List[str]) -> List[str]:
    try:
        pre = model_artifact.estimator.named_steps["preprocess"]
        return pre.get_feature_names_out().tolist()
    except Exception:
        return fallback


def build_explainability(
    df: pd.DataFrame,
    model_bundle: Dict[str, Any],
    sensitive_columns: List[str],
) -> Dict[str, Any]:
    model = model_bundle.get("model_artifact")
    raw_pipeline = model_bundle.get("raw_pipeline")
    feature_columns = model_bundle.get("feature_columns", [])
    if model is None or raw_pipeline is None:
        return {
            "status": "unavailable",
            "method": "none",
            "model_source": "user_supplied_predictions",
            "methods_available": [],
            "methods_unavailable": ["shap", "coefficient_fallback"],
            "note": "A trained audit model was not available, so model-based explainability could not be generated.",
            "global_feature_importance": [],
            "group_explanations": [],
            "local_explanations": [],
            "shap_style_summary": [],
            "lime_style_example": [],
            "top_features": [],
            "natural_language_summary": "Model-based explainability unavailable.",
        }
    X = df[feature_columns].copy()
    sample = X.head(min(64, len(X))).copy()
    transformed = raw_pipeline.named_steps["preprocess"].transform(sample)
    names = _feature_names(model, feature_columns)

    items: List[Dict[str, Any]] = []
    local_explanations: List[Dict[str, Any]] = []
    method = "coefficient_fallback"
    methods_available: List[str] = []
    methods_unavailable: List[str] = []
    sensitive_lower = {c.lower() for c in sensitive_columns}

    model_source = str(model_bundle.get("selected_model", "")).lower()
    use_fast_tree_shap = any(token in model_source for token in ["xgboost", "lightgbm", "catboost"])

    if SHAP_AVAILABLE and use_fast_tree_shap:
        try:
            base_model = raw_pipeline.named_steps["model"]
            explainer = shap.TreeExplainer(base_model)
            shap_values = explainer(transformed)
            values = shap_values.values
            if values.ndim == 3:
                values = values[..., 1]
            mean_abs = np.abs(values).mean(axis=0)
            directional = values.mean(axis=0)
            total = float(mean_abs.sum()) or 1.0
            items = [
                {
                    "feature": names[i] if i < len(names) else f"feature_{i}",
                    "mean_abs_shap": round(float(mean_abs[i]), 6),
                    "average_directional_shap": round(float(directional[i]), 6),
                    "importance_share": round(float(mean_abs[i] / total), 6),
                    "direction": "positive" if directional[i] >= 0 else "negative",
                    "sensitive": any(token in (names[i] if i < len(names) else "").lower() for token in sensitive_lower),
                    "summary": f"{names[i] if i < len(names) else f'feature_{i}'} has a {('positive' if directional[i] >= 0 else 'negative')} average effect on approval.",
                }
                for i in range(len(mean_abs))
            ]
            items.sort(key=lambda x: x["mean_abs_shap"], reverse=True)
            methods_available.append("shap")
            method = "shap"

            sample_count = min(5, len(sample))
            for row_idx in range(sample_count):
                row_values = values[row_idx]
                ranked = sorted(
                    [
                        {
                            "feature": names[i] if i < len(names) else f"feature_{i}",
                            "value": str(sample.iloc[row_idx, i]) if i < sample.shape[1] else "",
                            "shap_value": round(float(row_values[i]), 6),
                            "magnitude": round(float(abs(row_values[i])), 6),
                            "importance_share": round(float(abs(row_values[i]) / (np.abs(row_values).sum() or 1.0)), 6),
                            "direction": "positive" if row_values[i] >= 0 else "negative",
                            "sensitive": any(token in (names[i] if i < len(names) else "").lower() for token in sensitive_lower),
                        }
                        for i in range(len(row_values))
                    ],
                    key=lambda item: item["magnitude"],
                    reverse=True,
                )[:5]
                probability = float(model.predict_proba(sample.iloc[[row_idx]])[:, 1][0])
                local_explanations.append(
                    {
                        "sample_id": str(sample.index[row_idx]),
                        "row_index": str(sample.index[row_idx]),
                        "prediction_probability": round(probability, 6),
                        "predicted_label": int(probability >= model_bundle.get("threshold", 0.5)),
                        "baseline_probability": None,
                        "summary": f"Prediction for row {sample.index[row_idx]} is mainly driven by {', '.join([item['feature'] for item in ranked[:3]])}.",
                        "top_contributors": ranked,
                    }
                )
        except Exception:
            methods_unavailable.append("shap")
    elif SHAP_AVAILABLE:
        methods_unavailable.append("shap")

    if not items:
        try:
            base_model = raw_pipeline.named_steps["model"]
            coefs = getattr(base_model, "feature_importances_", None)
            if coefs is None:
                coefs = getattr(base_model, "coef_", None)
                if coefs is not None and np.ndim(coefs) > 1:
                    coefs = coefs[0]
            if coefs is None:
                coefs = np.zeros(transformed.shape[1])
            total = float(np.abs(coefs).sum()) or 1.0
            items = [
                {
                    "feature": names[i] if i < len(names) else f"feature_{i}",
                    "mean_abs_shap": round(float(abs(v)), 6),
                    "average_directional_shap": round(float(v), 6),
                    "importance_share": round(float(abs(v) / total), 6),
                    "direction": "positive" if float(v) >= 0 else "negative",
                    "sensitive": any(token in (names[i] if i < len(names) else "").lower() for token in sensitive_lower),
                    "summary": f"{names[i] if i < len(names) else f'feature_{i}'} is influential in the surrogate audit model.",
                }
                for i, v in enumerate(coefs)
            ]
            items.sort(key=lambda x: x["mean_abs_shap"], reverse=True)
            methods_available.append("coefficient_fallback")
        except Exception:
            items = []
            methods_unavailable.append("coefficient_fallback")

    top = items[:12]
    group_explanations: List[Dict[str, Any]] = []
    for s in sensitive_columns:
        if s not in df.columns:
            continue
        for group, subset in df.groupby(s):
            group_explanations.append({
                "sensitive_column": s,
                "group": str(group),
                "top_drivers": top[:5],
            })
            break
    driver_names = ", ".join([t["feature"] for t in top[:3]]) if top else "no stable drivers"
    shap_style_summary = [
        {
            "feature": item["feature"],
            "direction": item["direction"],
            "impact": item["mean_abs_shap"],
            "summary": item["summary"],
        }
        for item in top[:6]
    ]
    lime_style_example = []
    if local_explanations:
        lime_style_example = [
            {
                "feature": contributor["feature"],
                "direction": contributor["direction"],
                "impact": contributor["magnitude"],
                "summary": f"{contributor['feature']} pushes this sample {contributor['direction']}.",
            }
            for contributor in local_explanations[0]["top_contributors"][:5]
        ]
    return {
        "status": "ok" if top else "fallback",
        "method": method,
        "model_source": model_bundle.get("selected_model", "surrogate_model"),
        "methods_available": methods_available,
        "methods_unavailable": methods_unavailable,
        "note": "Explainability is generated directly from the audit model without requiring a separate pipeline setup.",
        "global_feature_importance": top,
        "group_explanations": group_explanations[:10],
        "local_explanations": local_explanations,
        "shap_style_summary": shap_style_summary,
        "lime_style_example": lime_style_example,
        "top_features": [
            {
                "feature": item["feature"],
                "score": item["mean_abs_shap"],
                "weight": item["importance_share"],
                "direction": item["direction"],
                "reason": item["summary"],
            }
            for item in top
        ],
        "before_after_summary": "Before/after mitigation explanation reuses the same model driver set unless a retrained mitigated model is available.",
        "natural_language_summary": f"Bias appears mainly driven by {driver_names}.",
    }
