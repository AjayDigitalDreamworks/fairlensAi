"""SHAP explainability — preserves category-level importance.

Key improvement over original:
- One-hot encoded features are NOT merged back to parent column
- Shows which specific category values (e.g., gender=Female, race=Black)
  drive predictions — essential for fairness auditing
- Adds category_level_importance section
- Optionally includes SHAP interaction values
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline

from app.core import (
    GEMINI_API_BASE,
    GEMINI_MODEL,
    GLOBAL_SHAP_FEATURE_LIMIT,
    LOCAL_CONTRIBUTOR_LIMIT,
    LOCAL_EXPLANATION_LIMIT,
    MAX_PROXY_SCAN_ROWS,
    RANDOM_SEED,
    SHAP_SAMPLE_ROWS,
    apply_category_compactors,
    format_feature_value,
    safe_divide,
    sample_frame,
    sigmoid,
)
from app.fairness.metrics import estimate_proxy_signal

try:
    from xgboost import DMatrix
    XGBOOST_AVAILABLE = True
    XGBOOST_IMPORT_ERROR = ""
except Exception as exc:
    DMatrix = None  # type: ignore[assignment]
    XGBOOST_AVAILABLE = False
    XGBOOST_IMPORT_ERROR = str(exc)

try:
    import shap
    SHAP_AVAILABLE = True
except Exception:
    shap = None  # type: ignore[assignment]
    SHAP_AVAILABLE = False


def build_tree_shap_explainability(
    df: pd.DataFrame,
    sensitive_columns: List[str],
    model_bundle: Dict[str, Any],
) -> Dict[str, Any]:
    """Build TreeSHAP explainability preserving category-level features.

    Unlike the original which merged one-hot features back to parents,
    this keeps individual category values separate so auditors can see
    exactly which categories (e.g., gender=Female) drive predictions.
    """
    if not XGBOOST_AVAILABLE or DMatrix is None:
        raise RuntimeError(f"XGBoost runtime unavailable: {XGBOOST_IMPORT_ERROR}")

    pipeline = model_bundle["pipeline"]
    feature_columns = [c for c in model_bundle.get("feature_columns", []) if c in df.columns]
    if not feature_columns:
        raise RuntimeError("No feature columns available for TreeSHAP.")

    feature_frame = apply_category_compactors(
        df[feature_columns].copy(), model_bundle.get("compactors", {}),
    )
    preprocessor = pipeline.named_steps["preprocessor"]
    estimator = pipeline.named_steps["model"]
    transformed = preprocessor.transform(feature_frame)
    feature_names = preprocessor.get_feature_names_out().tolist()
    booster = estimator.get_booster()

    contributions = booster.predict(
        DMatrix(transformed, feature_names=feature_names),
        pred_contribs=True,
        validate_features=False,
    )
    if contributions.ndim != 2 or contributions.shape[1] <= 1:
        raise RuntimeError("TreeSHAP output was empty.")

    bias_terms = contributions[:, -1]
    feature_contribs = contributions[:, :-1]

    # --- GLOBAL IMPORTANCE: keep one-hot features separate ---
    mean_abs = np.mean(np.abs(feature_contribs), axis=0)
    mean_signed = np.mean(feature_contribs, axis=0)
    total_abs = max(float(np.sum(mean_abs)), 1e-9)

    # Build category-level importance (one-hot features shown individually)
    category_level_importance = []
    # Build aggregated importance (merged to parent for backward compat)
    source_map = _build_source_map(feature_names, model_bundle, preprocessor)
    aggregated_importance: Dict[str, Dict[str, float]] = {}

    for idx, feat_name in enumerate(feature_names):
        if mean_abs[idx] <= 0:
            continue
        signed_val = float(mean_signed[idx])
        direction = (
            "pushes toward positive outcome" if signed_val > 0.001
            else "pushes away from positive outcome" if signed_val < -0.001
            else "mixed influence"
        )

        # Category-level (individual one-hot features)
        is_sensitive = any(
            feat_name.startswith(f"cat__{s}") or feat_name == f"num__{s}"
            for s in sensitive_columns
        )
        category_level_importance.append({
            "feature": feat_name.replace("cat__", "").replace("num__", ""),
            "raw_feature": feat_name,
            "mean_abs_shap": round(float(mean_abs[idx]), 6),
            "average_directional_shap": round(signed_val, 6),
            "importance_share": round(float(mean_abs[idx] / total_abs), 4),
            "direction": direction,
            "sensitive": is_sensitive,
        })

        # Aggregated (for backward compat)
        source = source_map.get(feat_name, feat_name)
        bucket = aggregated_importance.setdefault(source, {"abs": 0.0, "signed": 0.0})
        bucket["abs"] += float(mean_abs[idx])
        bucket["signed"] += float(mean_signed[idx])

    # Sort category-level by importance
    category_level_importance.sort(key=lambda x: x["mean_abs_shap"], reverse=True)

    # Build aggregated global feature importance (backward compatible)
    global_feature_importance = []
    for feature, vals in sorted(aggregated_importance.items(), key=lambda x: x[1]["abs"], reverse=True):
        direction = (
            "pushes toward positive outcome" if vals["signed"] > 0.001
            else "pushes away from positive outcome" if vals["signed"] < -0.001
            else "mixed influence"
        )
        global_feature_importance.append({
            "feature": feature,
            "mean_abs_shap": round(vals["abs"], 6),
            "average_directional_shap": round(vals["signed"], 6),
            "importance_share": round(vals["abs"] / total_abs, 4),
            "direction": direction,
            "sensitive": feature in set(sensitive_columns),
            "summary": f"{feature} {direction} in the XGBoost model.",
        })
    global_feature_importance = global_feature_importance[:GLOBAL_SHAP_FEATURE_LIMIT]

    # --- LOCAL EXPLANATIONS ---
    prediction_scores = np.asarray(
        model_bundle.get("prediction_scores")
        if model_bundle.get("prediction_scores") is not None
        else np.zeros(len(df)),
        dtype=float,
    )

    # Aggregate contributions for local explanations
    agg_features, agg_contribs = _aggregate_contributions(
        feature_contribs, feature_names, feature_columns, source_map,
    )
    row_strength = np.sum(np.abs(agg_contribs), axis=1)
    local_positions = _select_local_positions(prediction_scores, row_strength)

    local_explanations = []
    for rank, pos in enumerate(local_positions, start=1):
        top_indices = np.argsort(np.abs(agg_contribs[pos]))[::-1][:LOCAL_CONTRIBUTOR_LIMIT]
        top_total = max(float(np.sum(np.abs(agg_contribs[pos, top_indices]))), 1e-9)
        contributors = []
        for fidx in top_indices:
            fname = agg_features[fidx]
            sv = float(agg_contribs[pos, fidx])
            contributors.append({
                "feature": fname,
                "value": format_feature_value(
                    feature_frame.iloc[pos][fname]
                ) if fname in feature_frame.columns else "derived",
                "shap_value": round(sv, 6),
                "magnitude": round(abs(sv), 6),
                "importance_share": round(abs(sv) / top_total, 4),
                "direction": "raises the positive-outcome score" if sv > 0 else "lowers the positive-outcome score" if sv < 0 else "neutral",
                "sensitive": fname in set(sensitive_columns),
            })

        prob = float(prediction_scores[pos]) if pos < len(prediction_scores) else 0.0
        lead = ", ".join(c["feature"] for c in contributors[:2]) or "multiple features"
        local_explanations.append({
            "sample_id": f"sample-{rank}",
            "row_index": int(df.index[pos]) if isinstance(df.index[pos], (int, np.integer)) else str(df.index[pos]),
            "prediction_probability": round(prob, 4),
            "predicted_label": int(prob >= 0.5),
            "baseline_probability": round(sigmoid(float(bias_terms[pos])), 4),
            "summary": f"Sample {rank} is driven mostly by {lead}. The positive-outcome probability is {prob:.2f}.",
            "top_contributors": contributors,
        })

    # Build backward-compatible structures
    top_features = [
        {"feature": f["feature"], "score": f["importance_share"],
         "weight": f["mean_abs_shap"], "direction": f["direction"], "reason": "tree_shap"}
        for f in global_feature_importance
    ]
    shap_style_summary = [
        {"feature": f["feature"], "impact": f["importance_share"],
         "direction": f["direction"], "summary": f["summary"]}
        for f in global_feature_importance
    ]
    lime_style_example = [
        {"feature": c["feature"], "impact": c["magnitude"],
         "direction": c["direction"],
         "summary": local_explanations[0]["summary"] if local_explanations else c["direction"]}
        for c in (local_explanations[0]["top_contributors"] if local_explanations else [])[:3]
    ]

    model_source = str(model_bundle.get("model_source", "xgboost_training_model"))
    return {
        "status": "model_based" if model_source == "xgboost_training_model" else "surrogate_model_based",
        "method": "TreeSHAP",
        "model_source": model_source,
        "methods_available": ["TreeSHAP global importance", "TreeSHAP local explanations", "category_level_importance"],
        "methods_unavailable": [],
        "top_features": top_features,
        "shap_style_summary": shap_style_summary,
        "lime_style_example": lime_style_example,
        "global_feature_importance": global_feature_importance,
        "category_level_importance": category_level_importance[:GLOBAL_SHAP_FEATURE_LIMIT],
        "local_explanations": local_explanations,
        "note": "TreeSHAP with category-level importance (one-hot features preserved).",
    }


def build_proxy_explainability(
    df: pd.DataFrame,
    prediction_column: str,
    target_column: Optional[str],
    sensitive_columns: List[str],
    note: Optional[str] = None,
) -> Dict[str, Any]:
    """Fallback explainability using proxy-signal correlation scan."""
    top_features = []
    sampled = sample_frame(df, MAX_PROXY_SCAN_ROWS, target_column)
    for col in sampled.columns:
        if col in set(sensitive_columns + [prediction_column] + ([target_column] if target_column else [])):
            continue
        if sampled[col].nunique(dropna=True) < 2:
            continue
        score = max(
            estimate_proxy_signal(sampled[col], sampled[s])
            for s in sensitive_columns
        ) if sensitive_columns else 0.0
        top_features.append({"feature": col, "score": round(float(score), 3), "reason": "proxy association"})
    top_features = sorted(top_features, key=lambda x: x["score"], reverse=True)[:5]
    shap_style = [
        {"feature": f["feature"], "impact": f["score"], "direction": "proxy influence",
         "summary": f"Feature '{f['feature']}' shows proxy-style influence."}
        for f in top_features
    ]
    return {
        "status": "proxy_fallback", "method": "proxy_scan", "model_source": "proxy_scan",
        "methods_available": ["rule_based_proxy_scan"],
        "methods_unavailable": ["TreeSHAP"],
        "top_features": top_features, "shap_style_summary": shap_style,
        "lime_style_example": shap_style[:3],
        "global_feature_importance": [], "local_explanations": [],
        "category_level_importance": [],
        "gemini_narrative": {
            "status": "skipped", "model": GEMINI_MODEL,
            "summary": None, "key_points": [],
            "risk_statement": "TreeSHAP was not available for this run.",
            "recommended_focus": "Run with a trainable XGBoost path.",
        },
        "note": note or "TreeSHAP was not available; using proxy-risk scan.",
    }


def build_explainability(
    df: pd.DataFrame,
    prediction_column: str,
    target_column: Optional[str],
    sensitive_columns: List[str],
    source_name: str,
    resolved_domain: str,
    fairness_summary: Dict[str, Any],
    findings: List[Dict[str, Any]],
    model_bundle: Optional[Dict[str, Any]],
    gemini_api_key: Optional[str],
) -> Dict[str, Any]:
    if not model_bundle:
        return build_proxy_explainability(
            df, prediction_column, target_column, sensitive_columns,
            note="No XGBoost model bundle — using proxy-risk fallback.",
        )
    try:
        explainability = build_tree_shap_explainability(df, sensitive_columns, model_bundle)
    except Exception as exc:
        fb = build_proxy_explainability(
            df, prediction_column, target_column, sensitive_columns,
            note=f"TreeSHAP failed ({exc}). Proxy fallback returned.",
        )
        fb["error"] = str(exc)
        return fb

    gemini_narrative = build_gemini_narrative(
        source_name, resolved_domain, fairness_summary, findings, explainability, gemini_api_key,
    )
    explainability["gemini_narrative"] = gemini_narrative
    if gemini_narrative.get("status") == "available":
        explainability["methods_available"].append("Gemini plain-language narration")
    else:
        explainability["methods_unavailable"].append("Gemini plain-language narration")
    return explainability


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------
def _build_source_map(
    feature_names: List[str], model_bundle: Dict[str, Any], preprocessor: ColumnTransformer,
) -> Dict[str, str]:
    source_map: Dict[str, str] = {}
    numeric_cols = [str(c) for c in model_bundle.get("numeric_columns", [])]
    categorical_cols = [str(c) for c in model_bundle.get("categorical_columns", [])]
    for c in numeric_cols:
        source_map[f"num__{c}"] = c
    cat_transformer = getattr(preprocessor, "named_transformers_", {}).get("cat")
    encoder = cat_transformer.named_steps.get("onehot") if hasattr(cat_transformer, "named_steps") else None
    if encoder is not None and categorical_cols:
        encoded = encoder.get_feature_names_out(categorical_cols).tolist()
        for name in encoded:
            for col in sorted(categorical_cols, key=len, reverse=True):
                if name == col or name.startswith(f"{col}_"):
                    source_map[f"cat__{name}"] = col
                    break
    for fn in feature_names:
        if fn not in source_map:
            source_map[fn] = fn.split("__", 1)[-1] if "__" in fn else fn
    return source_map


def _aggregate_contributions(
    contribs: np.ndarray, feature_names: List[str],
    feature_columns: List[str], source_map: Dict[str, str],
) -> tuple:
    ordered = list(feature_columns)
    fidx = {f: i for i, f in enumerate(ordered)}
    agg = np.zeros((contribs.shape[0], len(ordered)), dtype=float)
    for ci, tname in enumerate(feature_names):
        source = source_map.get(tname, tname)
        if source not in fidx:
            fidx[source] = len(ordered)
            ordered.append(source)
            agg = np.pad(agg, ((0, 0), (0, 1)))
        agg[:, fidx[source]] += contribs[:, ci]
    return ordered, agg


def _select_local_positions(scores: np.ndarray, strength: np.ndarray) -> List[int]:
    if scores.size == 0:
        return []
    positions = [int(np.argmax(scores)), int(np.argmin(scores)),
                 int(np.argmin(np.abs(scores - 0.5)))]
    positions.extend(int(p) for p in np.argsort(-strength).tolist())
    unique: List[int] = []
    for p in positions:
        if p not in unique:
            unique.append(p)
        if len(unique) >= LOCAL_EXPLANATION_LIMIT:
            break
    return unique


# ---------------------------------------------------------------------------
# Gemini narrative (kept from original)
# ---------------------------------------------------------------------------
def build_gemini_narrative(
    source_name: str, resolved_domain: str, fairness_summary: Dict[str, Any],
    findings: List[Dict[str, Any]], explainability: Dict[str, Any],
    gemini_api_key: Optional[str],
) -> Dict[str, Any]:
    api_key = (gemini_api_key or os.getenv("GEMINI_API_KEY", "")).strip()
    if not api_key:
        return {
            "status": "not_configured", "model": GEMINI_MODEL,
            "summary": None, "key_points": [],
            "risk_statement": "No Gemini API key supplied.",
            "recommended_focus": "Pass geminiApiKey during upload or set GEMINI_API_KEY.",
        }

    worst = sorted(findings, key=lambda x: x.get("fairness_score", 100))[:2]
    payload = {
        "dataset": source_name, "domain": resolved_domain,
        "overall_fairness_score": fairness_summary.get("overall_fairness_score"),
        "corrected_fairness_score": fairness_summary.get("corrected_fairness_score"),
        "worst_group_findings": [
            {"sensitive_column": f.get("sensitive_column"), "fairness_score": f.get("fairness_score"),
             "disparate_impact": f.get("disparate_impact"), "dp_diff": f.get("demographic_parity_difference")}
            for f in worst
        ],
        "global_shap_drivers": [
            {"feature": f.get("feature"), "mean_abs_shap": f.get("mean_abs_shap"),
             "direction": f.get("direction")}
            for f in explainability.get("global_feature_importance", [])[:5]
        ],
    }
    prompt = (
        "You explain fairness audits for product managers.\n"
        "Use only the supplied numbers.\n"
        "Return strict JSON with keys: summary, key_points, risk_statement, recommended_focus.\n"
        f"{json.dumps(payload, ensure_ascii=True)}"
    )
    request_payload = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.2, "responseMimeType": "application/json"},
    }
    endpoint = f"{GEMINI_API_BASE}/models/{GEMINI_MODEL}:generateContent?key={api_key}"
    req = urllib.request.Request(
        endpoint, data=json.dumps(request_payload).encode("utf-8"),
        headers={"Content-Type": "application/json"}, method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            resp_payload = json.loads(resp.read().decode("utf-8"))
    except Exception as exc:
        return {
            "status": "error", "model": GEMINI_MODEL,
            "summary": None, "key_points": [],
            "risk_statement": "Gemini narration failed.",
            "recommended_focus": "Check API key and network.", "error": str(exc),
        }

    text = _extract_gemini_text(resp_payload)
    parsed = _extract_json(text)
    if parsed:
        return {
            "status": "available", "model": GEMINI_MODEL,
            "summary": str(parsed.get("summary", "")).strip() or None,
            "key_points": [str(x).strip() for x in (parsed.get("key_points") or []) if str(x).strip()],
            "risk_statement": str(parsed.get("risk_statement", "")).strip() or None,
            "recommended_focus": str(parsed.get("recommended_focus", "")).strip() or None,
        }
    return {
        "status": "available", "model": GEMINI_MODEL,
        "summary": text or "Gemini response did not match expected format.",
        "key_points": [], "risk_statement": None, "recommended_focus": None,
    }


def _extract_gemini_text(payload: Dict[str, Any]) -> str:
    parts = []
    for c in payload.get("candidates", []):
        for p in c.get("content", {}).get("parts", []):
            if p.get("text"):
                parts.append(str(p["text"]))
    return "\n".join(parts).strip()


def _extract_json(text: str) -> Optional[Dict[str, Any]]:
    if not text:
        return None
    try:
        p = json.loads(text)
        return p if isinstance(p, dict) else None
    except json.JSONDecodeError:
        pass
    s, e = text.find("{"), text.rfind("}")
    if s == -1 or e <= s:
        return None
    try:
        p = json.loads(text[s:e + 1])
        return p if isinstance(p, dict) else None
    except json.JSONDecodeError:
        return None
