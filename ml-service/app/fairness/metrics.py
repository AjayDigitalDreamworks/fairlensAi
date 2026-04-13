from __future__ import annotations

import logging
from typing import Any, Callable, Dict, List, Optional

import numpy as np
import pandas as pd
from sklearn.metrics import confusion_matrix

logger = logging.getLogger(__name__)

try:
    from fairlearn.metrics import MetricFrame, demographic_parity_difference, equalized_odds_difference, selection_rate
    FAIRLEARN_METRICS_AVAILABLE = True
except Exception:
    FAIRLEARN_METRICS_AVAILABLE = False
    MetricFrame = None  # type: ignore
    demographic_parity_difference = None  # type: ignore
    equalized_odds_difference = None  # type: ignore
    selection_rate = None  # type: ignore

from app.utils.column_inference import normalize_binary


def _safe_rate(num: float, den: float) -> float:
    return float(num / den) if den else 0.0


def _prepare_sensitive_series(df: pd.DataFrame, sensitive_column: str) -> pd.Series:
    raw = df[sensitive_column]
    lowered = sensitive_column.lower()
    logger.debug(f"[SENSITIVE_PREP] {sensitive_column}: dtype={raw.dtype}, unique_count={raw.nunique()}")
    
    if pd.api.types.is_numeric_dtype(raw):
        numeric = pd.to_numeric(raw, errors="coerce")
        unique_count = int(numeric.nunique(dropna=True))
        
        if "age" in lowered and unique_count > 8:
            logger.info(f"[SENSITIVE_BINNING] {sensitive_column}: Age binning (was {unique_count} values → age brackets)")
            binned = pd.cut(
                numeric,
                bins=[-np.inf, 24, 29, 34, 39, 49, np.inf],
                labels=["18-24", "25-29", "30-34", "35-39", "40-49", "50+"],
                include_lowest=True,
            )
            result = binned.astype(str).replace("nan", "missing")
            logger.debug(f"[SENSITIVE_BINNING_RESULT] Groups after binning: {result.unique()}")
            return result
            
        if unique_count > 12:
            try:
                bucket_count = min(5, max(3, unique_count // 8))
                logger.info(f"[SENSITIVE_BINNING] {sensitive_column}: Numeric quantile binning ({unique_count} → {bucket_count} bins)")
                binned = pd.qcut(numeric, q=bucket_count, duplicates="drop")
                result = binned.astype(str).replace("nan", "missing")
                logger.debug(f"[SENSITIVE_BINNING_RESULT] Groups after quantile binning: {result.nunique()}")
                return result
            except Exception as e:
                logger.warning(f"[SENSITIVE_BINNING_FAIL] {sensitive_column}: Quantile binning failed: {e}")
                pass
    
    result = raw.astype(str).replace("nan", "missing")
    logger.debug(f"[SENSITIVE_PREP_FINAL] {sensitive_column}: Using raw values with {result.nunique()} groups")
    return result


def _group_confusion(y_true: np.ndarray, y_pred: np.ndarray) -> Dict[str, float]:
    tn, fp, fn, tp = confusion_matrix(y_true, y_pred, labels=[0, 1]).ravel()
    return {
        "selection_rate": _safe_rate(tp + fp, tp + fp + tn + fn),
        "tpr": _safe_rate(tp, tp + fn),
        "fpr": _safe_rate(fp, fp + tn),
        "fnr": _safe_rate(fn, fn + tp),
        "accuracy": _safe_rate(tp + tn, tp + tn + fp + fn),
    }


def _risk_level_from_score(score: float) -> str:
    if score >= 90:
        return "low"
    if score >= 75:
        return "medium"
    return "high"


def _has_material_gap(dp_diff: float, eo_gap: float, accuracy_spread: float, disparate_impact: float) -> bool:
    return bool(
        dp_diff > 0.01
        or eo_gap > 0.01
        or accuracy_spread > 0.03
        or disparate_impact < 0.99
    )


def compute_structured_fairness_metrics(
    df: pd.DataFrame,
    sensitive_column: str,
    prediction_column: str,
    target_column: Optional[str],
    positive_label: Any = 1,
    skip_fairlearn: bool = False,
) -> Dict[str, Any]:
    if sensitive_column not in df.columns or prediction_column not in df.columns:
        raise ValueError("Missing sensitive or prediction column for fairness metrics.")
    y_pred = normalize_binary(df[prediction_column], positive_label)
    if target_column and target_column in df.columns:
        y_true = normalize_binary(df[target_column], positive_label)
    else:
        y_true = y_pred.copy()
    sensitive = _prepare_sensitive_series(df, sensitive_column)
    rows: List[Dict[str, Any]] = []
    for group, idx in sensitive.groupby(sensitive).groups.items():
        stats = _group_confusion(y_true.loc[idx].to_numpy(), y_pred.loc[idx].to_numpy())
        rows.append(
            {
                "group": str(group),
                "count": int(len(idx)),
                "selection_rate": round(stats["selection_rate"], 6),
                "tpr": round(stats["tpr"], 6),
                "fpr": round(stats["fpr"], 6),
                "fnr": round(stats["fnr"], 6),
                "accuracy": round(stats["accuracy"], 6),
                "true_positive_rate": round(stats["tpr"], 6),
                "false_positive_rate": round(stats["fpr"], 6),
                "false_negative_rate": round(stats["fnr"], 6),
            }
        )
    group_df = pd.DataFrame(rows)
    sr = group_df["selection_rate"] if not group_df.empty else pd.Series(dtype=float)
    tpr = group_df["tpr"] if not group_df.empty else pd.Series(dtype=float)
    fpr = group_df["fpr"] if not group_df.empty else pd.Series(dtype=float)
    disparate_impact = float(sr.min() / sr.max()) if len(sr) and float(sr.max()) > 0 else 1.0
    dp_diff = float(sr.max() - sr.min()) if len(sr) else 0.0
    tpr_gap = float(tpr.max() - tpr.min()) if len(tpr) else 0.0
    fpr_gap = float(fpr.max() - fpr.min()) if len(fpr) else 0.0
    eo_gap = max(tpr_gap, fpr_gap)
    accuracy_spread = float(group_df["accuracy"].max() - group_df["accuracy"].min()) if len(group_df) else 0.0
    worst_group = None
    baseline_group = None
    material_gap = _has_material_gap(dp_diff, eo_gap, accuracy_spread, disparate_impact)
    if not group_df.empty:
        group_df["fairness_penalty"] = (
            (group_df["selection_rate"] - sr.mean()).abs()
            + (group_df["tpr"] - tpr.mean()).abs()
            + (group_df["fpr"] - fpr.mean()).abs()
            + (group_df["accuracy"] - group_df["accuracy"].mean()).abs()
        )
        if material_gap:
            worst_group = group_df.sort_values("fairness_penalty", ascending=False).iloc[0]["group"]
        baseline_group = group_df.sort_values(["count", "accuracy"], ascending=[False, False]).iloc[0]["group"]
    fairness_score = max(
        0.0,
        100.0
        - (
            dp_diff * 40
            + eo_gap * 35
            + max(0.0, 0.8 - disparate_impact) * 50
            + accuracy_spread * 100
        ),
    )

    if group_df.empty:
        confidence = "low"
    else:
        min_group_size = int(group_df["count"].min())
        confidence = "high" if len(df) >= 1000 and min_group_size >= 30 else "medium" if len(df) >= 200 else "low"

    notes: List[str] = []
    logger.info(f"[FAIRNESS_CALC_{sensitive_column}] Groups: {len(group_df)} | DP_Diff: {dp_diff:.6f} | EO_Gap: {eo_gap:.6f} | DI: {disparate_impact:.6f} | AccSpread: {accuracy_spread:.6f}")
    logger.info(f"[FAIRNESS_SCORE_{sensitive_column}] Score components: DP*40={dp_diff*40:.2f} + EO*35={eo_gap*35:.2f} + DI*50={max(0.0, 0.8 - disparate_impact)*50:.2f} + AccSp*100={accuracy_spread*100:.2f}")
    logger.info(f"[FAIRNESS_SCORE_{sensitive_column}] Final score: {fairness_score:.4f} (confidence: {confidence})")

    risk_level = _risk_level_from_score(fairness_score)
    if disparate_impact < 0.8:
        notes.append(f"Disparate impact is below the 0.80 guideline for {sensitive_column}.")
    if dp_diff > 0.1:
        notes.append(f"Demographic parity gap is elevated for {sensitive_column}.")
    if eo_gap > 0.1:
        notes.append(f"Equalized odds gap suggests uneven error behavior across {sensitive_column} groups.")
    if accuracy_spread > 0.03:
        notes.append(f"Accuracy spread is high across {sensitive_column} groups.")
    if worst_group:
        notes.append(f"Worst-performing subgroup is {worst_group}.")
    if not notes:
        notes.append(f"No material fairness gap was detected for {sensitive_column}.")

    fairlearn_summary: Dict[str, Any] = {"available": FAIRLEARN_METRICS_AVAILABLE}
    if FAIRLEARN_METRICS_AVAILABLE and not skip_fairlearn:
        mf = MetricFrame(
            metrics={
                "selection_rate": selection_rate,
                "tpr": lambda yt, yp: _group_confusion(np.asarray(yt), np.asarray(yp))["tpr"],
                "fpr": lambda yt, yp: _group_confusion(np.asarray(yt), np.asarray(yp))["fpr"],
            },
            y_true=y_true,
            y_pred=y_pred,
            sensitive_features=sensitive,
        )
        fairlearn_summary = {
            "available": True,
            "demographic_parity_difference": round(float(demographic_parity_difference(y_true, y_pred, sensitive_features=sensitive)), 6),
            "equalized_odds_difference": round(float(equalized_odds_difference(y_true, y_pred, sensitive_features=sensitive)), 6),
            "by_group": {m: {str(k): round(float(v), 6) for k, v in series.to_dict().items()} for m, series in mf.by_group.items()},
        }

    return {
        "sensitive_column": sensitive_column,
        "component_sensitive_columns": [sensitive_column],
        "is_intersectional": False,
        "group_metrics": group_df.drop(columns=[c for c in ["fairness_penalty"] if c in group_df.columns]).to_dict(orient="records"),
        "disparate_impact": round(disparate_impact, 6),
        "demographic_parity_difference": round(dp_diff, 6),
        "equalized_odds_difference": round(eo_gap, 6),
        "tpr_gap": round(tpr_gap, 6),
        "fpr_gap": round(fpr_gap, 6),
        "accuracy_spread": round(accuracy_spread, 6),
        "subgroup_worst_case": worst_group,
        "baseline_group": baseline_group,
        "fairness_score": round(float(fairness_score), 4),
        "risk_level": risk_level,
        "confidence": confidence,
        "notes": notes,
        "fairlearn": fairlearn_summary,
    }


def compute_overall_fairness_summary(findings: List[Dict[str, Any]], intersectional: Optional[List[Dict[str, Any]]] = None) -> float:
    scores = [float(f["fairness_score"]) for f in findings]
    if intersectional:
        scores.extend(float(f["fairness_score"]) for f in intersectional)
    
    overall = round(float(np.mean(scores)), 4) if scores else 0.0
    logger.info(f"[FAIRNESS_SUMMARY] Individual scores: {scores} | Intersectional: {bool(intersectional)}")
    logger.info(f"[FAIRNESS_OVERALL] Overall fairness score: {overall} (mean of {len(scores)} components)")
    
    return overall


def build_intersectional_findings(
    df: pd.DataFrame,
    sensitive_columns: List[str],
    prediction_column: str,
    target_column: Optional[str],
    positive_label: Any = 1,
) -> List[Dict[str, Any]]:
    available = [c for c in sensitive_columns if c in df.columns]
    if len(available) < 2:
        return []
    pairs = []
    default_pairs = [("Gender", "Education"), ("Gender", "Age"), ("Age", "Education")]
    lowered = {c.lower(): c for c in available}
    for a, b in default_pairs:
        if a.lower() in lowered and b.lower() in lowered:
            pairs.append((lowered[a.lower()], lowered[b.lower()]))
    for i in range(len(available)):
        for j in range(i + 1, len(available)):
            pair = (available[i], available[j])
            if pair not in pairs:
                pairs.append(pair)
    out = []
    for a, b in pairs[:6]:
        combo = df[a].astype(str).fillna("missing") + " | " + df[b].astype(str).fillna("missing")
        temp = df.copy()
        col = f"__fairai_intersection__{a}__{b}"
        temp[col] = combo
        metrics = compute_structured_fairness_metrics(temp, col, prediction_column, target_column, positive_label, skip_fairlearn=True)
        metrics["sensitive_column"] = f"{a} x {b}"
        metrics["component_sensitive_columns"] = [a, b]
        metrics["is_intersectional"] = True
        out.append(metrics)
    return out


def build_root_causes(proxy_findings: List[Dict[str, Any]], explainability: Dict[str, Any], fairness_findings: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    notes: List[Dict[str, Any]] = []
    for proxy in proxy_findings[:5]:
        notes.append({
            "type": "proxy_feature",
            "summary": f"{proxy['feature']} is strongly associated with sensitive attribute {proxy['sensitive_column']}.",
            "sensitive_column": proxy["sensitive_column"],
            "feature": proxy["feature"],
            "severity": proxy.get("risk", "medium"),
            "details": f"{proxy['feature']} has association strength {proxy['association_strength']} with {proxy['sensitive_column']}.",
            "evidence": proxy,
        })
    for feat in explainability.get("global_feature_importance", [])[:5]:
        notes.append({
            "type": "model_driver",
            "summary": f"Model output is strongly influenced by {feat['feature']}.",
            "sensitive_column": "",
            "feature": feat["feature"],
            "severity": "medium",
            "details": feat.get("summary", f"{feat['feature']} is a major model driver."),
            "evidence": feat,
        })
    for finding in fairness_findings:
        if finding.get("subgroup_worst_case"):
            notes.append({
                "type": "worst_group",
                "summary": f"Worst subgroup for {finding['sensitive_column']} is {finding['subgroup_worst_case']}.",
                "sensitive_column": finding["sensitive_column"],
                "feature": "",
                "severity": finding.get("risk_level", "medium"),
                "details": f"Subgroup {finding['subgroup_worst_case']} is the worst-performing slice for {finding['sensitive_column']}.",
                "evidence": {
                    "sensitive_column": finding["sensitive_column"],
                    "subgroup_worst_case": finding["subgroup_worst_case"],
                },
            })
    return notes[:12]
