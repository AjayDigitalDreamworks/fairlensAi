from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import pandas as pd

logger = logging.getLogger(__name__)

from app.core.model_selector import (
    CATBOOST_AVAILABLE,
    LIGHTGBM_AVAILABLE,
    OPTUNA_AVAILABLE,
    XGBOOST_AVAILABLE,
    train_and_select_model,
)
from app.core.report_builder import build_report_markdown
from app.explain.shap_explain import build_explainability
from app.fairness.metrics import (
    build_intersectional_findings,
    build_root_causes,
    compute_overall_fairness_summary,
    compute_structured_fairness_metrics,
)
from app.fairness.optimization import FAIRLEARN_MITIGATION_AVAILABLE, choose_mitigation
from app.utils.column_inference import infer_columns, normalize_binary, sanitize_columns, drop_internal_generated_columns
from app.utils.data_quality import scan_data_quality
from app.utils.proxy_detection import detect_proxy_features


SERVICE_VERSION = "3.0.0"


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _risk_level(score: Optional[float]) -> str:
    if score is None:
        return "unknown"
    if score >= 90:
        return "low"
    if score >= 75:
        return "medium"
    return "high"


def _first_or_none(values: List[Optional[float]], fn=min) -> Optional[float]:
    cleaned = [float(v) for v in values if v is not None]
    return fn(cleaned) if cleaned else None


def _infer_audit_mode(
    df: pd.DataFrame,
    inference: Any,
    requested_target: Optional[str],
    requested_sensitive: Optional[List[str]],
) -> Dict[str, Any]:
    target_confidence = "high" if requested_target else inference.target_confidence
    sensitive_confidence = "high" if requested_sensitive else inference.sensitive_confidence
    prediction_confidence = inference.prediction_confidence
    usable_features = [
        column
        for column in df.columns
        if column not in set((inference.sensitive_columns or []) + [inference.target_column, inference.prediction_column, inference.probability_column])
        and not str(column).startswith("__fairai_")
        and df[column].nunique(dropna=True) > 1
    ]
    has_prediction_signal = bool(inference.prediction_column and inference.prediction_column in df.columns)
    has_confident_prediction_signal = has_prediction_signal and prediction_confidence in {"medium", "high"}
    has_trainable_feature_set = len(usable_features) >= 3

    if not inference.target_column or target_confidence == "low" or not inference.sensitive_columns or sensitive_confidence == "low":
        return {
            "mode": "needs_review",
            "reason": "Low-confidence schema detection. Please confirm target and sensitive columns before trusting the audit.",
            "usable_feature_columns": usable_features,
            "has_prediction_signal": has_prediction_signal,
            "has_confident_prediction_signal": has_confident_prediction_signal,
            "has_trainable_feature_set": has_trainable_feature_set,
        }

    if has_confident_prediction_signal or has_trainable_feature_set:
        return {
            "mode": "full",
            "reason": "Target, sensitive attributes, and usable prediction signals were detected with sufficient confidence.",
            "usable_feature_columns": usable_features,
            "has_prediction_signal": has_prediction_signal,
            "has_confident_prediction_signal": has_confident_prediction_signal,
            "has_trainable_feature_set": has_trainable_feature_set,
        }

    return {
        "mode": "limited",
        "reason": "Target and sensitive columns were detected, but prediction or training features are limited. Results are descriptive and mitigation reliability is reduced.",
        "usable_feature_columns": usable_features,
        "has_prediction_signal": has_prediction_signal,
        "has_confident_prediction_signal": has_confident_prediction_signal,
        "has_trainable_feature_set": has_trainable_feature_set,
    }


def _build_unsafe_result(
    df: pd.DataFrame,
    source_name: str,
    domain: Optional[str],
    inference: Any,
    quality: Dict[str, Any],
    requested_target: Optional[str],
    requested_prediction: Optional[str],
    requested_sensitive: Optional[List[str]],
    mode_info: Dict[str, Any],
) -> Dict[str, Any]:
    warnings = list(dict.fromkeys(inference.warnings + quality["warnings"] + [mode_info["reason"]]))
    metadata = {
        "rows": int(len(df)),
        "columns": df.columns.tolist(),
        "domain": domain or "auto",
        "domain_confidence": 1.0 if domain and domain != "auto" else 0.55,
        "source_name": source_name,
        "target_column": inference.target_column,
        "prediction_column": inference.prediction_column,
        "probability_column": inference.probability_column,
        "sensitive_columns": inference.sensitive_columns,
        "service_version": SERVICE_VERSION,
        "target_auto_detected": not bool(requested_target),
        "prediction_auto_generated": False,
        "sensitive_auto_detected": not bool(requested_sensitive),
        "audit_mode": mode_info["mode"],
        "audit_mode_reason": mode_info["reason"],
        "usable_feature_columns": mode_info["usable_feature_columns"][:12],
        "libraries_used": {
            "xgboost_available": XGBOOST_AVAILABLE,
            "lightgbm_available": LIGHTGBM_AVAILABLE,
            "catboost_available": CATBOOST_AVAILABLE,
            "optuna_available": OPTUNA_AVAILABLE,
            "fairlearn_mitigation_available": FAIRLEARN_MITIGATION_AVAILABLE,
        },
        "detection": {
            "target_origin": "user" if requested_target else "auto",
            "prediction_origin": "user" if requested_prediction else "auto",
            "sensitive_origin": "user" if requested_sensitive else "auto",
        },
    }
    detection = {
        "resolved_domain": metadata["domain"],
        "target_column": inference.target_column,
        "prediction_column": inference.prediction_column,
        "sensitive_columns": inference.sensitive_columns,
        "positive_label": "1",
        "generated_target": False,
        "generated_prediction": False,
        "used_outcome_fallback": False,
        "mode": mode_info["mode"],
        "mode_reason": mode_info["reason"],
        "confidence": {
            "target": inference.target_confidence,
            "prediction": inference.prediction_confidence,
            "sensitive": inference.sensitive_confidence,
        },
        "candidates": {
            "target": inference.target_candidates,
            "prediction": inference.prediction_candidates,
            "sensitive": inference.sensitive_candidates,
        },
        "notes": warnings,
    }
    explanation = {
        "executive_summary": (
            f"Dataset review completed on {len(df)} rows across {len(df.columns)} columns, "
            f"but the audit was paused in {mode_info['mode']} mode because schema detection was not reliable enough "
            f"for a trustworthy fairness report."
        ),
        "plain_language": [
            "The system did not produce a full fairness result because the detected schema is not reliable enough.",
            f"Target confidence: {inference.target_confidence}. Sensitive confidence: {inference.sensitive_confidence}. Prediction confidence: {inference.prediction_confidence}.",
            "Provide or confirm the target column, sensitive columns, and optionally the prediction column to continue.",
        ],
    }
    result = {
        "metadata": metadata,
        "profiling": inference.profiling,
        "warnings": warnings,
        "errors": quality["errors"],
        "quality_checks": quality,
        "model_summary": {"selected_model": "not_run", "candidates": []},
        "fairness_summary": {
            "overall_fairness_score": None,
            "risk_level": "unknown",
            "overall_accuracy": None,
            "corrected_fairness_score": None,
            "baseline_accuracy": None,
            "corrected_accuracy": None,
            "disparate_impact": None,
            "corrected_disparate_impact": None,
            "intersectional_fairness_score": None,
            "intersectional_corrected_fairness_score": None,
            "fairness_target": 95.0,
            "fairness_target_met": False,
            "fairness_target_gap": None,
            "selected_sensitive_column": None,
        },
        "sensitive_findings": [],
        "intersectional_findings": [],
        "corrected_sensitive_findings": [],
        "corrected_intersectional_findings": [],
        "mitigation_summary": {
            "accepted": False,
            "selected_candidate": {"name": "not_run", "reason": mode_info["reason"]},
            "candidate_count": 0,
            "candidates": [],
        },
        "recommendations": [
            {
                "category": "schema_review",
                "priority": "high",
                "title": "Confirm target and sensitive columns",
                "description": "The automatic detection confidence is too low for a trustworthy audit. Pass explicit target and sensitive column names.",
            },
            {
                "category": "dataset_quality",
                "priority": "medium",
                "title": "Add clearer business features",
                "description": "Include several non-sensitive feature columns so the service can build or validate a prediction signal safely.",
            },
        ],
        "explanation": explanation,
        "analysis_log": [
            {
                "stage": "schema_review",
                "title": "Schema review required",
                "detail": mode_info["reason"],
                "status": "warning",
                "timestamp": _utc_now(),
            }
        ],
        "detection": detection,
        "explainability": {"status": "not_run", "method": "skipped_due_to_low_confidence", "top_features": []},
        "artifacts": {
            "before_after": {"before_score": None, "after_score": None},
            "corrected_fairness_summary": {"overall_fairness_score": None, "risk_level": "unknown"},
            "corrected_sensitive_findings": [],
        },
        "explanation_summary": {"status": "not_run", "method": "skipped_due_to_low_confidence", "top_features": []},
        "proxy_detection": [],
        "root_causes": [],
        "recommendation": "schema review required",
        "corrected_csv": "",
    }
    result["report_markdown"] = build_report_markdown(result)
    return result


def _build_analysis_log(meta: Dict[str, Any], quality: Dict[str, Any], mitigation: Dict[str, Any], explainability: Dict[str, Any], proxy_findings: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    now = _utc_now()
    return [
        {
            "stage": "dataset_received",
            "title": "Dataset received",
            "detail": f"Loaded {meta['rows']} rows and {len(meta['columns'])} columns from {meta['source_name']}.",
            "status": "completed",
            "timestamp": now,
        },
        {
            "stage": "schema_inference",
            "title": "Schema inferred",
            "detail": f"Target: {meta.get('target_column') or 'none'}, prediction: {meta.get('prediction_column') or 'generated'}, sensitive: {', '.join(meta.get('sensitive_columns', [])) or 'none'}.",
            "status": "completed",
            "timestamp": now,
        },
        {
            "stage": "quality_scan",
            "title": "Data quality scan",
            "detail": f"Warnings: {len(quality.get('warnings', []))}, errors: {len(quality.get('errors', []))}.",
            "status": "completed",
            "timestamp": now,
        },
        {
            "stage": "fairness_analysis",
            "title": "Fairness analysis",
            "detail": "Computed sensitive and intersectional fairness metrics.",
            "status": "completed",
            "timestamp": now,
        },
        {
            "stage": "proxy_detection",
            "title": "Proxy-risk scan",
            "detail": f"Detected {len(proxy_findings)} proxy-risk signals.",
            "status": "completed",
            "timestamp": now,
        },
        {
            "stage": "explainability",
            "title": "Explainability generated",
            "detail": f"Explainability status: {explainability.get('status', 'unknown')} via {explainability.get('method', 'unknown')}.",
            "status": "completed",
            "timestamp": now,
        },
        {
            "stage": "mitigation",
            "title": "Mitigation selection",
            "detail": mitigation.get("acceptance_reason", "Mitigation evaluation completed."),
            "status": "completed",
            "timestamp": now,
        },
    ]


def _build_recommendations(
    fairness_findings: List[Dict[str, Any]],
    proxy_findings: List[Dict[str, Any]],
    quality: Dict[str, Any],
    mitigation: Dict[str, Any],
) -> List[Dict[str, Any]]:
    recommendations: List[Dict[str, Any]] = []
    for finding in sorted(fairness_findings, key=lambda item: item.get("fairness_score", 100.0))[:3]:
        recommendations.append(
            {
                "category": "fairness",
                "priority": "high" if finding.get("risk_level") == "high" else "medium",
                "title": f"Review {finding['sensitive_column']} decision boundary",
                "description": f"{finding['sensitive_column']} scored {finding['fairness_score']} with DI {finding['disparate_impact']} and DP gap {finding['demographic_parity_difference']}. Focus on subgroup {finding.get('subgroup_worst_case') or 'with the largest parity gap'}.",
            }
        )
    for proxy in proxy_findings[:2]:
        recommendations.append(
            {
                "category": "proxy_risk",
                "priority": "high" if proxy.get("risk") == "high" else "medium",
                "title": f"Inspect proxy feature {proxy['feature']}",
                "description": f"{proxy['feature']} is strongly associated with {proxy['sensitive_column']} (strength {proxy['association_strength']}). Consider removal, monotonic constraints, or business-rule review.",
            }
        )
    if quality.get("leakage_columns"):
        recommendations.append(
            {
                "category": "data_quality",
                "priority": "high",
                "title": "Remove leakage columns",
                "description": f"Potential leakage columns were detected: {', '.join(quality['leakage_columns'][:5])}. Removing them will make fairness and performance estimates more reliable.",
            }
        )
    if not mitigation.get("accepted", False):
        recommendations.append(
            {
                "category": "mitigation",
                "priority": "medium",
                "title": "Escalate to retraining-based mitigation",
                "description": "The direct mitigation preview did not meet the acceptance threshold. Try retraining with stronger constraints, feature review, or data rebalancing.",
            }
        )
    return recommendations[:8]


def _build_explanation(
    meta: Dict[str, Any],
    fairness_summary: Dict[str, Any],
    findings: List[Dict[str, Any]],
    root_causes: List[Dict[str, Any]],
    mitigation: Dict[str, Any],
    explainability: Dict[str, Any],
) -> Dict[str, Any]:
    audit_mode = meta.get("audit_mode", "full")
    worst = min(findings, key=lambda item: item.get("fairness_score", 100.0)) if findings else None
    corrected_score = fairness_summary.get("corrected_fairness_score")
    improvement = None
    if corrected_score is not None and fairness_summary.get("overall_fairness_score") is not None:
        improvement = round(float(corrected_score - fairness_summary["overall_fairness_score"]), 2)
    has_material_issue = bool(
        worst
        and (
            worst.get("risk_level") != "low"
            or float(worst.get("demographic_parity_difference", 0.0)) > 0.01
            or float(worst.get("equalized_odds_difference", 0.0)) > 0.01
            or float(worst.get("accuracy_spread", 0.0)) > 0.03
            or float(worst.get("disparate_impact", 1.0)) < 0.99
        )
    )
    if audit_mode == "limited":
        executive_summary = (
            f"Limited audit analysis completed on {meta['rows']} rows across {len(meta['columns'])} columns. "
            f"Overall fairness scored {fairness_summary.get('overall_fairness_score')} with {_risk_level(fairness_summary.get('overall_fairness_score'))} risk. "
            f"{'The strongest descriptive disparity was observed for ' + worst['sensitive_column'] + '.' if has_material_issue and worst else 'No material sensitive-attribute disparity was isolated.'} "
            f"Mitigation reliability is reduced because prediction or training features were limited."
        )
    else:
        executive_summary = (
            f"Direct audit analysis completed on {meta['rows']} rows across {len(meta['columns'])} columns. "
            f"Overall fairness scored {fairness_summary.get('overall_fairness_score')} with {_risk_level(fairness_summary.get('overall_fairness_score'))} risk. "
            f"{'The strongest disparity was observed for ' + worst['sensitive_column'] + '.' if has_material_issue and worst else 'No material sensitive-attribute disparity was isolated.'} "
            f"{'Mitigation improved the score to ' + str(corrected_score) + ' (' + str(improvement) + ' point lift).' if improvement is not None and improvement > 0 else 'Mitigation did not materially change the fairness score.' if improvement is not None else 'No corrected fairness score was produced.'}"
        )
    plain_language = [
        f"The audit used a direct analysis flow with no separate pipeline setup required.",
        f"Audit mode: {audit_mode}.",
        f"Sensitive columns analyzed: {', '.join(meta.get('sensitive_columns', [])) or 'none identified'}.",
        f"Main model drivers: {', '.join([item['feature'] for item in explainability.get('top_features', [])[:3]]) or 'not available'}.",
        f"Likely causes include: {', '.join([item['summary'] for item in root_causes[:2]]) or 'no clear root-cause signal'}",
        mitigation.get("acceptance_reason", "Mitigation review completed."),
    ]
    return {
        "executive_summary": executive_summary,
        "plain_language": plain_language,
    }


def _normalize_prediction_inputs(df: pd.DataFrame, prediction_column: Optional[str], probability_column: Optional[str]) -> Dict[str, Optional[str]]:
    pred_col = prediction_column
    prob_col = probability_column
    if prob_col and prob_col in df.columns:
        df[prob_col] = pd.to_numeric(df[prob_col], errors="coerce").clip(0, 1)
    if pred_col and pred_col in df.columns:
        series = df[pred_col]
        if pd.api.types.is_numeric_dtype(series) and series.nunique(dropna=True) > 2:
            prob_col = pred_col
            pred_col = f"__fairai_from_score__{pred_col}"
            df[pred_col] = (pd.to_numeric(series, errors="coerce").fillna(0.5) >= 0.5).astype(int)
        else:
            df[pred_col] = normalize_binary(series)
    return {"prediction_column": pred_col, "probability_column": prob_col}


def _resolve_prediction_fallback(
    df: pd.DataFrame,
    inference: Any,
    warnings: List[str],
) -> Dict[str, Optional[str]]:
    if inference.prediction_column and inference.prediction_column in df.columns:
        return {
            "prediction_column": inference.prediction_column,
            "probability_column": inference.probability_column if inference.probability_column in df.columns else None,
        }

    numeric_candidates = [
        column
        for column in df.columns
        if column not in set((inference.sensitive_columns or []) + [inference.target_column])
        and pd.api.types.is_numeric_dtype(df[column])
        and df[column].nunique(dropna=True) > 2
    ]
    if numeric_candidates:
        chosen = numeric_candidates[0]
        warnings.append(f"Using numeric column '{chosen}' as a fallback prediction signal.")
        return {"prediction_column": chosen, "probability_column": chosen}

    if inference.target_column and inference.target_column in df.columns:
        warnings.append("No usable prediction features were available; auditing observed outcomes directly.")
        fallback_col = "__fairai_outcome_fallback_prediction"
        df[fallback_col] = normalize_binary(df[inference.target_column])
        return {"prediction_column": fallback_col, "probability_column": None}

    return {"prediction_column": None, "probability_column": None}


def run_audit(
    df: pd.DataFrame,
    source_name: str,
    domain: Optional[str] = None,
    requested_target: Optional[str] = None,
    requested_prediction: Optional[str] = None,
    requested_sensitive: Optional[List[str]] = None,
    positive_label: Any = 1,
) -> Dict[str, Any]:
    df = sanitize_columns(drop_internal_generated_columns(df.copy()))
    inference = infer_columns(df, requested_target, requested_prediction, requested_sensitive)
    quality = scan_data_quality(df, inference.target_column, inference.sensitive_columns, positive_label)
    mode_info = _infer_audit_mode(df, inference, requested_target, requested_sensitive)
    fallback_warnings: List[str] = []
    if not quality["suitable"]:
        return _build_unsafe_result(
            df,
            source_name,
            domain,
            inference,
            quality,
            requested_target,
            requested_prediction,
            requested_sensitive,
            {**mode_info, "mode": "needs_review", "reason": "Dataset unsuitable for reliable fairness audit."},
        )
    if mode_info["mode"] == "needs_review":
        return _build_unsafe_result(
            df,
            source_name,
            domain,
            inference,
            quality,
            requested_target,
            requested_prediction,
            requested_sensitive,
            mode_info,
        )

    model_bundle = None
    pred_column = inference.prediction_column
    prob_column = inference.probability_column
    used_outcome_fallback = False
    if pred_column == inference.target_column:
        pred_column = None
        prob_column = None
    if not pred_column and inference.target_column and mode_info["mode"] == "full":
        try:
            model_bundle = train_and_select_model(df, inference.target_column, inference.sensitive_columns, positive_label)
            pred_column = "__fairai_model_prediction"
            prob_column = "__fairai_model_probability"
            df[pred_column] = model_bundle["predictions"]
            df[prob_column] = model_bundle["probabilities"]
        except Exception as exc:
            fallback_warnings.append(f"Surrogate training skipped: {exc}")
            fallback = _resolve_prediction_fallback(df, inference, fallback_warnings)
            pred_column = fallback["prediction_column"]
            prob_column = fallback["probability_column"]
            used_outcome_fallback = pred_column == "__fairai_outcome_fallback_prediction"
    elif not pred_column and mode_info["mode"] == "limited":
        fallback = _resolve_prediction_fallback(df, inference, fallback_warnings)
        pred_column = fallback["prediction_column"]
        prob_column = fallback["probability_column"]
        used_outcome_fallback = pred_column == "__fairai_outcome_fallback_prediction"
    normalized_cols = _normalize_prediction_inputs(df, pred_column, prob_column)
    pred_column = normalized_cols["prediction_column"]
    prob_column = normalized_cols["probability_column"]
    used_outcome_fallback = used_outcome_fallback or pred_column == "__fairai_outcome_fallback_prediction"
    if pred_column is None:
        raise ValueError("Unable to determine prediction signal for audit.")

    fairness_findings = [compute_structured_fairness_metrics(df, s, pred_column, inference.target_column, positive_label) for s in inference.sensitive_columns if s in df.columns]
    intersectional = build_intersectional_findings(df, inference.sensitive_columns, pred_column, inference.target_column, positive_label)
    fairness_score = compute_overall_fairness_summary(fairness_findings, intersectional)

    mitigation = choose_mitigation(df, inference.sensitive_columns, pred_column, inference.target_column, positive_label, prob_column)
    corrected_df = mitigation["corrected_df"]
    corrected_findings = [compute_structured_fairness_metrics(corrected_df, s, "corrected_prediction", inference.target_column, positive_label) for s in inference.sensitive_columns if s in corrected_df.columns]
    corrected_intersectional = build_intersectional_findings(corrected_df, inference.sensitive_columns, "corrected_prediction", inference.target_column, positive_label)
    corrected_score = compute_overall_fairness_summary(corrected_findings, corrected_intersectional)

    explainability = build_explainability(df, model_bundle or {}, inference.sensitive_columns)
    proxy_findings = detect_proxy_features(df, inference.sensitive_columns, exclude=[c for c in [inference.target_column, pred_column, prob_column] if c])
    root_causes = build_root_causes(proxy_findings, explainability, fairness_findings)
    recommendations = _build_recommendations(fairness_findings, proxy_findings, quality, mitigation)

    recommendation = mitigation["acceptance_reason"] if mitigation["accepted"] else "no safe correction found"
    overall_accuracy = mitigation["baseline"].get("accuracy")
    corrected_accuracy = mitigation["selected_candidate"].get("accuracy")
    overall_di = _first_or_none([item.get("disparate_impact") for item in fairness_findings], min)
    corrected_di = _first_or_none([item.get("disparate_impact") for item in corrected_findings], min)
    intersectional_score = compute_overall_fairness_summary([], intersectional) if intersectional else None
    corrected_intersectional_score = compute_overall_fairness_summary([], corrected_intersectional) if corrected_intersectional else None
    fairness_target = 95.0
    fairness_target_met = corrected_score >= fairness_target
    fairness_target_gap = round(max(0.0, fairness_target - corrected_score), 4)
    fairness_summary = {
        "overall_fairness_score": fairness_score,
        "risk_level": _risk_level(fairness_score),
        "overall_accuracy": overall_accuracy,
        "corrected_fairness_score": corrected_score,
        "baseline_accuracy": overall_accuracy,
        "corrected_accuracy": corrected_accuracy,
        "disparate_impact": overall_di,
        "corrected_disparate_impact": corrected_di,
        "intersectional_fairness_score": intersectional_score,
        "intersectional_corrected_fairness_score": corrected_intersectional_score,
        "fairness_target": fairness_target,
        "fairness_target_met": fairness_target_met,
        "fairness_target_gap": fairness_target_gap,
        "selected_sensitive_column": min(fairness_findings, key=lambda x: x["fairness_score"])["sensitive_column"] if fairness_findings else None,
    }
    detection_notes = list(dict.fromkeys(inference.warnings + quality["warnings"] + fallback_warnings))
    metadata = {
        "rows": int(len(df)),
        "columns": df.columns.tolist(),
        "domain": domain or "auto",
        "domain_confidence": 1.0 if domain and domain != "auto" else 0.55,
        "source_name": source_name,
        "target_column": inference.target_column,
        "prediction_column": None if used_outcome_fallback else pred_column,
        "probability_column": prob_column,
        "sensitive_columns": inference.sensitive_columns,
        "service_version": SERVICE_VERSION,
        "audit_mode": mode_info["mode"],
        "audit_mode_reason": mode_info["reason"],
        "domain_auto_detected": not bool(domain and domain != "auto"),
        "target_auto_detected": not bool(requested_target),
        "prediction_auto_generated": bool(model_bundle),
        "sensitive_auto_detected": not bool(requested_sensitive),
        "usable_feature_columns": mode_info["usable_feature_columns"][:12],
        "large_dataset_mode": len(df) >= 100000,
        "training_rows_used": int(len(df)),
        "proxy_scan_rows_used": int(len(df)),
        "correction_method": mitigation["selected_candidate"].get("name", "baseline"),
        "precorrected_upload": "corrected_prediction" in df.columns,
        "surrogate_model": (model_bundle or {}).get("selected_model"),
        "explainability_model_source": explainability.get("model_source"),
        "spark_acceleration_active": False,
        "reweighing_applied": bool((model_bundle or {}).get("reweighing_summary", {}).get("applied")),
        "intersectional_analysis_enabled": bool(intersectional),
        "intersectional_findings_count": len(intersectional),
        "libraries_used": {
            "xgboost_available": XGBOOST_AVAILABLE,
            "lightgbm_available": LIGHTGBM_AVAILABLE,
            "catboost_available": CATBOOST_AVAILABLE,
            "optuna_available": OPTUNA_AVAILABLE,
            "fairlearn_mitigation_available": FAIRLEARN_MITIGATION_AVAILABLE,
        },
        "detection": {
            "target_origin": "user" if requested_target else "auto",
            "prediction_origin": "generated" if model_bundle else ("outcome_fallback" if used_outcome_fallback else ("user" if requested_prediction else "auto")),
            "sensitive_origin": "user" if requested_sensitive else "auto",
        },
    }
    explanation = _build_explanation(metadata, fairness_summary, fairness_findings, root_causes, mitigation, explainability)
    analysis_log = _build_analysis_log(metadata, quality, mitigation, explainability, proxy_findings)
    result = {
        "metadata": metadata,
        "profiling": inference.profiling,
        "warnings": detection_notes,
        "errors": [],
        "quality_checks": quality,
        "model_summary": model_bundle["evaluation"] if model_bundle else {"selected_model": "user_supplied_predictions", "candidates": []},
        "fairness_summary": fairness_summary,
        "sensitive_findings": fairness_findings,
        "intersectional_findings": intersectional,
        "corrected_sensitive_findings": corrected_findings,
        "corrected_intersectional_findings": corrected_intersectional,
        "mitigation_summary": {
            "accepted": mitigation["accepted"],
            "selected_candidate": mitigation["selected_candidate"],
            "candidate_count": len(mitigation["candidates"]),
            "candidates": mitigation["candidates"],
        },
        "recommendations": recommendations,
        "explanation": explanation,
        "analysis_log": analysis_log,
        "detection": {
            "resolved_domain": metadata["domain"],
            "target_column": inference.target_column,
            "prediction_column": None if used_outcome_fallback else pred_column,
            "sensitive_columns": inference.sensitive_columns,
            "positive_label": str(positive_label),
            "generated_target": False,
            "generated_prediction": bool(model_bundle),
            "used_outcome_fallback": used_outcome_fallback,
            "mode": mode_info["mode"],
            "mode_reason": mode_info["reason"],
            "confidence": {
                "target": inference.target_confidence,
                "prediction": inference.prediction_confidence,
                "sensitive": inference.sensitive_confidence,
            },
            "candidates": {
                "target": inference.target_candidates,
                "prediction": inference.prediction_candidates,
                "sensitive": inference.sensitive_candidates,
            },
            "notes": detection_notes,
        },
        "explainability": explainability,
        "artifacts": {
            "before_after": {
                "before_score": fairness_score,
                "after_score": corrected_score,
            },
            "corrected_fairness_summary": {
                "overall_fairness_score": corrected_score,
                "risk_level": _risk_level(corrected_score),
            },
            "corrected_sensitive_findings": corrected_findings,
        },
        "explanation_summary": explainability,
        "proxy_detection": proxy_findings,
        "root_causes": root_causes,
        "recommendation": recommendation,
        "corrected_csv": corrected_df.to_csv(index=False),
    }
    result["report_markdown"] = build_report_markdown(result)
    return result
