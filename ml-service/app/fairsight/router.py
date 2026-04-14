"""
router.py — FairSight API Router
Provides the full bias detection, mitigation, and model correction pipeline.
"""

from fastapi import APIRouter, File, UploadFile, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import pandas as pd
import os
import uuid
import json
import logging
import numpy as np

from app.core import run_audit
from app.utils.column_inference import infer_columns, sanitize_columns
from .bias_detection import (
    detect_bias, compute_intersectional_metrics,
    get_predictions, auto_detect_sensitive_columns, sanitize,
)
from .bias_mitigation import (
    select_mitigation_method, mitigate_threshold_optimizer,
    mitigate_exponentiated_gradient, mitigate_custom_thresholds,
    TRADEOFF_TABLE,
)
from .evaluation import evaluate_before_after
from .reporting import generate_bias_report, export_corrected_model
from .model_loader import load_model_auto
from .gemini_advisor import get_gemini_suggestions
from .compliance_engine import ComplianceViolationDetector, ComplianceCostCalculator

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/fairsight", tags=["FairSight AI"])

# In-memory session storage
SESSION_STORE: Dict[str, Dict[str, Any]] = {}


def get_session_dir(session_id: str) -> str:
    """Get absolute path to session directory, ensuring it exists outside the watched app folder."""
    storage_root = os.path.abspath(os.path.join(os.getcwd(), "..", "fairsight_storage"))
    session_dir = os.path.join(storage_root, session_id)
    os.makedirs(session_dir, exist_ok=True)
    return session_dir

# ═══════════════════════════════════════════════
# /upload — Upload model + dataset, auto-detect sensitive cols
# ═══════════════════════════════════════════════
@router.post("/upload")
async def upload_assets(
    model_file: UploadFile = File(...),
    csv_file: UploadFile = File(...),
):
    try:
        session_id = str(uuid.uuid4())
        session_dir = get_session_dir(session_id)

        # Save model file
        model_path = os.path.join(session_dir, model_file.filename)
        with open(model_path, "wb") as f:
            f.write(await model_file.read())

        # Read and save CSV
        try:
            df = pd.read_csv(csv_file.file)
        except Exception as e:
            logger.error(f"Failed to read CSV in session {session_id}: {e}")
            raise HTTPException(status_code=400, detail=f"Invalid CSV file format: {e}")

        df_path = os.path.join(session_dir, "data.csv")
        df.to_csv(df_path, index=False)

        # Auto-detect sensitive columns
        detected_sensitive = auto_detect_sensitive_columns(df)

        # Infer label column candidates
        inference = infer_columns(df)
        label_candidates = inference.target_candidates if hasattr(inference, "target_candidates") else []

        SESSION_STORE[session_id] = {
            "model_path": model_path,
            "data_path": df_path,
            "model_filename": model_file.filename,
        }

        return {
            "session_id": session_id,
            "columns": list(df.columns),
            "row_count": len(df),
            "detected_sensitive_columns": detected_sensitive,
            "label_candidates": label_candidates,
            "model_filename": model_file.filename,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Unexpected error in /upload: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ═══════════════════════════════════════════════
# /detect — Full bias detection pipeline
# ═══════════════════════════════════════════════
class DetectRequest(BaseModel):
    session_id: str
    label_col: str
    sensitive_col: str


def _resolve_detect_columns(df, requested_label, requested_sensitive):
    inference = infer_columns(
        df,
        requested_target=requested_label or None,
        requested_sensitive=[requested_sensitive] if requested_sensitive else None,
    )
    label_col = requested_label if requested_label in df.columns else inference.target_column
    sensitive_col = (
        requested_sensitive
        if requested_sensitive in df.columns
        else (inference.sensitive_columns[0] if inference.sensitive_columns else None)
    )
    return label_col, sensitive_col


def _build_fallback_detect_report(df, source_name, label_col, sensitive_col, fallback_reason):
    """Fallback to dataset-level audit when model-level detection fails."""
    audit = run_audit(
        df=df,
        source_name=source_name,
        requested_target=label_col,
        requested_sensitive=[sensitive_col] if sensitive_col else None,
    )

    fairness_summary = audit.get("fairness_summary", {}) or {}
    findings = audit.get("sensitive_findings", []) or []
    chosen = next(
        (f for f in findings if f.get("sensitive_column") == sensitive_col), None
    )
    if chosen is None and findings:
        chosen = min(findings, key=lambda f: f.get("fairness_score", 100.0))

    if chosen:
        dpd = abs(float(chosen.get("demographic_parity_difference", 0.0)))
        eod = abs(float(chosen.get("equalized_odds_difference", 0.0)))
        by_group = chosen.get("group_metrics", [])
        biased = bool(
            chosen.get("risk_level") == "high"
            or float(chosen.get("fairness_score", 100.0)) < 90.0
            or dpd > 0.1
            or eod > 0.1
        )
    else:
        dpd, eod, by_group, biased = 0.0, 0.0, [], False

    accuracy = fairness_summary.get("overall_accuracy") or fairness_summary.get("corrected_accuracy") or 0.0

    return {
        "performance": {"accuracy": float(accuracy), "balanced_accuracy": float(accuracy)},
        "dpd": float(dpd),
        "eod": float(eod),
        "dpd_ci": [0.0, 0.0],
        "statistically_significant": biased,
        "is_biased": biased,
        "severity": {
            "overall_severity": {
                "level": "high" if biased else "low",
                "label": "Bias Detected" if biased else "No Significant Bias",
                "action": "Review recommended" if biased else "Model appears fair",
            }
        },
        "by_group": by_group,
        "raw_predictions": [],
        "raw_probabilities": [],
        "recommended_mitigation": select_mitigation_method({"dpd": dpd, "eod": eod}),
        "fallback_used": True,
        "fallback_reason": fallback_reason,
        "resolved_columns": {"label_col": label_col, "sensitive_col": sensitive_col},
        "tradeoff_table": TRADEOFF_TABLE,
    }


@router.post("/detect")
async def detect(req: DetectRequest):
    if req.session_id not in SESSION_STORE:
        raise HTTPException(status_code=404, detail="Session not found")

    s = SESSION_STORE[req.session_id]
    df = None
    label_col = req.label_col
    sensitive_col = req.sensitive_col

    try:
        if not os.path.exists(s["data_path"]):
            raise FileNotFoundError(f"Data file not found for session {req.session_id}")

        df = sanitize_columns(pd.read_csv(s["data_path"]))
        label_col, sensitive_col = _resolve_detect_columns(df, req.label_col, req.sensitive_col)

        if not label_col or not sensitive_col:
            raise ValueError("Could not resolve the requested label or sensitive column.")

        model = load_model_auto(s["model_path"])
        X = df.drop(columns=[label_col])
        y = df[label_col]
        A = df[sensitive_col]

        report = detect_bias(model, X, y, A)

        # Domain assumption heuristic for demo: if "credit" or "loan" in columns, use Credit rules. Otherwise assume Hiring or Credit fallback.
        cols_lower = [c.lower() for c in X.columns]
        is_credit = any(kw in c for c in cols_lower for kw in ["credit", "loan", "balance", "default"])
        domain = "credit" if is_credit else "hiring"

        # Attach Compliance Violations and Cost Estimates directly into the model report
        report["compliance"] = ComplianceViolationDetector.detect_violations(
            domain=domain,
            sensitive_column=sensitive_col,
            disparate_impact=report.get("dpd", 0.85),  # Using dpd proxy if raw DI format varies
            dpd=report.get("dpd", 0.0),
            eod=report.get("eod", 0.0),
            fairness_score=report.get("performance", {}).get("accuracy", 0.90) * 100, 
            group_metrics=report.get("by_group", [])
        )
        
        severity = "low" if report["compliance"]["overall_status"] == "COMPLIANT" else "high"
        report["cost_exposure"] = ComplianceCostCalculator.calculate_total_exposure(
            severity=severity, domain=domain,
            disparate_impact=report.get("dpd", 0.85),
            dpd=report.get("dpd", 0.0),
            eod=report.get("eod", 0.0),
        )

        # Add mitigation recommendation with detailed reasoning
        recommended = select_mitigation_method(report, has_training_data=True, is_deep_learning=False)
        report["recommended_mitigation"] = recommended
        report["resolved_columns"] = {
            "label_col": label_col,
            "sensitive_col": sensitive_col,
        }
        report["fallback_used"] = False
        report["tradeoff_table"] = TRADEOFF_TABLE

        # Store session state for mitigation step
        s["detect_report"] = report
        s["y_pred"] = report["raw_predictions"]
        s["y_prob"] = report["raw_probabilities"]
        s["label_col"] = label_col
        s["sensitive_col"] = sensitive_col

        return report

    except Exception as exc:
        logger.error(f"Error in /detect for session {req.session_id}: {exc}")

        if df is None:
            raise HTTPException(status_code=500, detail=f"Failed to load dataset: {exc}")

        try:
            report = _build_fallback_detect_report(
                df=df,
                source_name=os.path.basename(s.get("data_path", "data.csv")),
                label_col=label_col,
                sensitive_col=sensitive_col,
                fallback_reason=str(exc),
            )
            s["detect_report"] = report
            s["y_pred"] = report.get("raw_predictions", [])
            s["y_prob"] = report.get("raw_probabilities", [])
            return report
        except Exception as fallback_exc:
            logger.exception(f"Fallback also failed: {fallback_exc}")
            raise HTTPException(
                status_code=500,
                detail=f"Analysis failed: {fallback_exc}",
            )

@router.post("/explain")
async def explain_model(req: DetectRequest):
    if req.session_id not in SESSION_STORE:
        raise HTTPException(status_code=404, detail="Session not found")
        
    s = SESSION_STORE[req.session_id]
    
    try:
        if not os.path.exists(s["data_path"]):
            raise FileNotFoundError("Data file not found")
            
        df = sanitize_columns(pd.read_csv(s["data_path"]))
        label_col, sensitive_col = _resolve_detect_columns(df, req.label_col, req.sensitive_col)
        
        if not label_col:
            raise ValueError("Invalid label column")
            
        model = load_model_auto(s["model_path"])
        X = df.drop(columns=[label_col])
        
        # Calculate feature importances stably
        importance_data = []
        if hasattr(model, "feature_importances_"):
            importances = model.feature_importances_
        elif hasattr(model, "coef_"):
            importances = np.abs(model.coef_[0])
        else:
            predictions = model.predict(X)
            importances = []
            for col in X.columns:
                try:
                    corr = np.abs(np.corrcoef(X[col].astype(float), predictions)[0,1])
                    importances.append(corr if not np.isnan(corr) else 0.0)
                except:
                    importances.append(0.0)
            importances = np.array(importances)
            
        # Normalize
        if np.sum(importances) > 0:
            importances = importances / np.sum(importances)
            
        for i, col in enumerate(X.columns):
            importance_data.append({
                "feature": col,
                "importance": float(importances[i])
            })
            
        # Sort descending
        importance_data.sort(key=lambda x: x["importance"], reverse=True)
            
        return {
            "status": "success",
            "global_feature_importance": importance_data,
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ═══════════════════════════════════════════════
# /mitigate — Apply bias correction to the model
# ═══════════════════════════════════════════════
class MitigateRequest(BaseModel):
    session_id: str
    method: str  # ThresholdOptimizer | ExponentiatedGradient | Reweighing | CustomThresholds | AdversarialDebiasing | EqOddsPostprocessing
    label_col: str
    sensitive_col: str
    constraint: str = "equalized_odds"
    custom_thresholds: Optional[Dict[str, float]] = None


@router.post("/mitigate")
async def mitigate(req: MitigateRequest):
    if req.session_id not in SESSION_STORE:
        raise HTTPException(status_code=404, detail="Session not found")

    s = SESSION_STORE[req.session_id]
    try:
        df = pd.read_csv(s["data_path"])
        model = load_model_auto(s["model_path"])

        X = df.drop(columns=[req.label_col])
        y = df[req.label_col]
        A = df[req.sensitive_col]

        y_before = s.get("y_pred")
        if y_before is None:
            y_before, _ = get_predictions(model, X)

        corrected_model = None

        if req.method == "ThresholdOptimizer":
            mitigator = mitigate_threshold_optimizer(
                model, X, y, A, constraint=req.constraint
            )
            y_after = mitigator.predict(X, sensitive_features=A)
            corrected_model = mitigator

        elif req.method == "ExponentiatedGradient":
            mitigator = mitigate_exponentiated_gradient(
                X, y, A, constraint=req.constraint
            )
            y_after = mitigator.predict(X)
            corrected_model = mitigator

        elif req.method == "Reweighing":
            from .bias_mitigation import apply_reweighing
            _, sample_weights = apply_reweighing(df, req.label_col, req.sensitive_col)
            model.fit(X, y, sample_weight=sample_weights)
            y_after, _ = get_predictions(model, X)
            corrected_model = model

        elif req.method == "AdversarialDebiasing":
            from .bias_mitigation import apply_adversarial_debiasing
            debiaser, bld = apply_adversarial_debiasing(df, req.label_col, req.sensitive_col)
            
            # Predict
            bld_pred = debiaser.predict(bld)
            y_after = bld_pred.labels.ravel()
            corrected_model = debiaser

        elif req.method == "EqOddsPostprocessing":
            from .bias_mitigation import apply_eq_odds_postprocessing
            y_after, eq_odds_pp = apply_eq_odds_postprocessing(
                model=model, df_train=df, df_test=df, # For basic flow test/train are the same
                label_col=req.label_col, sensitive_col=req.sensitive_col
            )
            corrected_model = eq_odds_pp

        elif req.method == "CustomThresholds":
            if not req.custom_thresholds:
                raise HTTPException(400, "custom_thresholds required for CustomThresholds method")
            y_prob = s.get("y_prob")
            if y_prob is None:
                _, y_prob = get_predictions(model, X)
            thresholds = {k: float(v) for k, v in req.custom_thresholds.items()}
            y_after = mitigate_custom_thresholds(y_prob, A, thresholds)

        else:
            raise HTTPException(400, f"Unknown method: {req.method}")

        # Evaluate before/after
        eval_result = evaluate_before_after(y, y_before, y_after, A, req.method)

        # Domain assumption heuristic
        cols_lower = [c.lower() for c in X.columns]
        is_credit = any(kw in c for c in cols_lower for kw in ["credit", "loan", "balance", "default"])
        domain = "credit" if is_credit else "hiring"

        # Calculate ROI projection
        detect_report = s.get("detect_report", {})
        before_di = detect_report.get("dpd", 0.85)  # proxy
        before_dpd = detect_report.get("dpd", 0.0)
        before_eod = detect_report.get("eod", 0.0)
        before_acc = detect_report.get("performance", {}).get("accuracy", 0.90) * 100

        after_dpd = eval_result.get("demographic_parity_difference", 0.0)
        after_eod = eval_result.get("equalized_odds_difference", 0.0)
        # simplistic heuristic for after_di based on dpd
        after_di = max(0.0, min(1.0, 1.0 - after_dpd))
        after_acc = eval_result.get("accuracy", 0.90) * 100

        before_compliant = before_di >= 0.80 and before_dpd <= 0.10
        after_compliant = after_di >= 0.80 and after_dpd <= 0.10

        roi_projection = ComplianceCostCalculator.calculate_roi(
            before_severity="low" if before_compliant else "high",
            after_severity="low" if after_compliant else "high",
            domain=domain,
            disparate_impact_before=before_di, disparate_impact_after=after_di,
            dpd_before=before_dpd, dpd_after=after_dpd,
            eod_before=before_eod, eod_after=after_eod,
            fairness_score_before=before_acc, fairness_score_after=after_acc
        )
        eval_result["roi_projection"] = roi_projection

        # Save corrected model if available
        corrected_model_path = None
        if corrected_model is not None:
            session_dir = get_session_dir(req.session_id)
            corrected_model_path = os.path.join(session_dir, "corrected_model.pkl")
            export_corrected_model(
                corrected_model,
                corrected_model_path,
                metadata={
                    "method": req.method,
                    "constraint": req.constraint,
                    "metrics": eval_result,
                },
            )

        # Generate report
        detect_report = s.get("detect_report", {})
        report_prefix = os.path.join(get_session_dir(req.session_id), "bias_report")
        try:
            generate_bias_report(
                detect_report, eval_result, req.sensitive_col,
                report_prefix, req.method,
            )
        except Exception as report_exc:
            logger.warning(f"Report generation failed: {report_exc}")

        # Update session
        s["mitigation_eval"] = eval_result
        s["corrected_model_path"] = corrected_model_path
        s["corrected_model"] = corrected_model
        s["report_prefix"] = report_prefix

        return {
            **eval_result,
            "corrected_model_available": corrected_model_path is not None,
            "report_available": True,
            "tradeoff_table": TRADEOFF_TABLE,
        }

    except HTTPException:
        raise
    except Exception as exc:
        logger.exception(f"Mitigation failed: {exc}")
        raise HTTPException(status_code=500, detail=f"Mitigation failed: {exc}")


# ═══════════════════════════════════════════════
# /gemini-suggestions — AI-powered bias analysis
# ═══════════════════════════════════════════════
class SuggestionsRequest(BaseModel):
    session_id: str
    label_col: str
    sensitive_col: str


@router.post("/gemini-suggestions")
async def gemini_suggestions(req: SuggestionsRequest):
    if req.session_id not in SESSION_STORE:
        raise HTTPException(status_code=404, detail="Session not found")

    s = SESSION_STORE[req.session_id]
    report = s.get("detect_report")
    if not report:
        raise HTTPException(status_code=400, detail="Run /detect first before requesting suggestions")

    try:
        result = await get_gemini_suggestions(report, req.sensitive_col, req.label_col)
        return result
    except Exception as exc:
        logger.exception(f"Gemini suggestions failed: {exc}")
        raise HTTPException(status_code=500, detail=f"Failed to generate suggestions: {exc}")


# ═══════════════════════════════════════════════
# /download-model — Download corrected model .pkl
# ═══════════════════════════════════════════════
@router.get("/download-model/{session_id}")
async def download_model(session_id: str):
    if session_id not in SESSION_STORE:
        raise HTTPException(status_code=404, detail="Session not found")

    s = SESSION_STORE[session_id]
    model_path = s.get("corrected_model_path")
    if not model_path or not os.path.exists(model_path):
        raise HTTPException(status_code=404, detail="No corrected model available. Run /mitigate first.")

    return FileResponse(
        model_path,
        media_type="application/octet-stream",
        filename="corrected_model.pkl",
    )


# ═══════════════════════════════════════════════
# /download-report — Download audit report JSON
# ═══════════════════════════════════════════════
@router.get("/download-report/{session_id}")
async def download_report(session_id: str):
    if session_id not in SESSION_STORE:
        raise HTTPException(status_code=404, detail="Session not found")

    s = SESSION_STORE[session_id]
    report_prefix = s.get("report_prefix")
    if not report_prefix:
        raise HTTPException(status_code=404, detail="No report available. Run /mitigate first.")

    json_path = f"{report_prefix}.json"
    if not os.path.exists(json_path):
        raise HTTPException(status_code=404, detail="Report file not found.")

    return FileResponse(
        json_path,
        media_type="application/json",
        filename="fairsight_bias_audit.json",
    )


# ═══════════════════════════════════════════════
# /intersectional — Intersectional fairness analysis
# ═══════════════════════════════════════════════
class IntersectionalRequest(BaseModel):
    session_id: str
    label_col: str
    sensitive_cols: List[str]


@router.post("/intersectional")
async def intersectional(req: IntersectionalRequest):
    if req.session_id not in SESSION_STORE:
        raise HTTPException(status_code=404, detail="Session not found")

    s = SESSION_STORE[req.session_id]
    df = pd.read_csv(s["data_path"])
    y = df[req.label_col]
    y_pred = s.get("y_pred")
    if y_pred is None:
        raise HTTPException(400, "Run /detect first")

    res = compute_intersectional_metrics(y, y_pred, df, req.sensitive_cols)
    return {"intersectional_metrics": res}


# ═══════════════════════════════════════════════
# Legacy: /export/report
# ═══════════════════════════════════════════════
@router.post("/export/report")
async def export_report(req: DetectRequest):
    s = SESSION_STORE.get(req.session_id)
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")

    prefix = os.path.join(get_session_dir(req.session_id), "report")
    before = s.get("detect_report", {})
    after = s.get("mitigation_eval", {})

    j_path, _ = generate_bias_report(before, after, req.sensitive_col, prefix)
    return FileResponse(j_path, media_type="application/json")
