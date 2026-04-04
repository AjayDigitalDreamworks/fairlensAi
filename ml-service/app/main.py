from __future__ import annotations

import io
import json
import os
from datetime import datetime, timedelta
from itertools import combinations
from threading import Lock
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

try:
    from xgboost import XGBClassifier

    XGBOOST_AVAILABLE = True
    XGBOOST_IMPORT_ERROR = ""
except Exception as exc:  # pragma: no cover - import-time environment specific
    XGBClassifier = None  # type: ignore[assignment]
    XGBOOST_AVAILABLE = False
    XGBOOST_IMPORT_ERROR = str(exc)

try:
    from pyspark.sql import SparkSession
    from pyspark.sql import functions as spark_functions
    from pyspark.sql.window import Window

    PYSPARK_AVAILABLE = True
    PYSPARK_IMPORT_ERROR = ""
except Exception as exc:  # pragma: no cover - import-time environment specific
    SparkSession = None  # type: ignore[assignment]
    Window = None  # type: ignore[assignment]
    spark_functions = None  # type: ignore[assignment]
    PYSPARK_AVAILABLE = False
    PYSPARK_IMPORT_ERROR = str(exc)

SERVICE_VERSION = "1.3.0"

app = FastAPI(title="FairAI ML Service", version=SERVICE_VERSION)

COMMON_TARGET_NAMES = [
    "target",
    "label",
    "outcome",
    "approved",
    "selected",
    "decision",
    "hired",
    "default",
    "churn",
    "status",
]
COMMON_PREDICTION_NAMES = [
    "corrected_prediction",
    "corrected_probability",
    "prediction",
    "predicted",
    "score",
    "model_prediction",
    "y_pred",
    "risk_score",
]
COMMON_SENSITIVE_NAMES = [
    "gender",
    "sex",
    "race",
    "ethnicity",
    "age",
    "age_group",
    "religion",
    "marital_status",
    "location",
    "region",
    "disability",
]
DOMAIN_HINTS = {
    "hiring": ["candidate", "resume", "hiring", "salary", "selected", "interview", "department"],
    "finance": ["loan", "credit", "interest", "income", "default", "limit", "balance"],
    "healthcare": ["patient", "diagnosis", "treatment", "admission", "clinical", "hospital", "disease"],
}

LARGE_DATASET_ROWS = 250_000
MAX_TRAIN_ROWS = 120_000
MAX_PROXY_SCAN_ROWS = 50_000
MAX_CATEGORY_LEVELS = 25
PREDICTION_BATCH_ROWS = 100_000
RANDOM_SEED = 42
MAX_INTERSECTIONAL_COMPONENTS = 3
MAX_INTERSECTIONAL_FINDINGS = 4
REWEIGHING_WEIGHT_CLIP_MIN = 0.35
REWEIGHING_WEIGHT_CLIP_MAX = 4.0
MIN_REWEIGHING_CELL_COUNT = 5
SPARK_ENABLED = os.getenv("FAIRAI_SPARK_ENABLED", "true").strip().lower() not in {"0", "false", "no"}
SPARK_MASTER = os.getenv("FAIRAI_SPARK_MASTER", "local[*]")
SPARK_APP_NAME = "FairAI-ML-Service"
SPARK_SHUFFLE_PARTITIONS = os.getenv("FAIRAI_SPARK_SHUFFLE_PARTITIONS", "8")
SPARK_DRIVER_HOST = os.getenv("FAIRAI_SPARK_DRIVER_HOST", "127.0.0.1")
SPARK_DRIVER_BIND_ADDRESS = os.getenv("FAIRAI_SPARK_DRIVER_BIND_ADDRESS", "0.0.0.0")

_SPARK_SESSION: Any = None
_SPARK_SESSION_LOCK = Lock()
_SPARK_RUNTIME_ERROR: Optional[str] = None


class MitigationPreviewRequest(BaseModel):
    domain: str = "general"
    strategy: str = "reweighing"
    fairness_summary: Dict[str, Any]
    sensitive_findings: List[Dict[str, Any]]
    recommendations: List[Dict[str, Any]]


@app.get("/health")
def health() -> Dict[str, Any]:
    return {
        "ok": True,
        "service": "ml-service",
        "version": SERVICE_VERSION,
        "correction_engine": "advanced_hybrid",
        "surrogate_model": "xgboost",
        "fairness_extensions": ["intersectional_fairness", "training_reweighing"],
        "xgboost_available": XGBOOST_AVAILABLE,
        "xgboost_import_error": XGBOOST_IMPORT_ERROR or None,
        "spark": spark_runtime_status(),
    }


@app.post("/analyze/file")
async def analyze_file(
    file: UploadFile = File(...),
    domain: str = Form("auto"),
    target_column: str = Form(""),
    prediction_column: str = Form(""),
    sensitive_columns: str = Form("[]"),
    positive_label: str = Form("1"),
) -> Dict[str, Any]:
    try:
        sensitive = json.loads(sensitive_columns) if sensitive_columns else []
    except json.JSONDecodeError:
        sensitive = [item.strip() for item in sensitive_columns.split(",") if item.strip()]

    content = await file.read()
    df = load_dataframe(file.filename or "data.csv", content)
    if df.empty:
        raise HTTPException(status_code=400, detail="Uploaded dataset is empty.")

    return analyze_dataframe(
        df=df,
        requested_domain=domain or "auto",
        target_column=target_column or None,
        prediction_column=prediction_column or None,
        sensitive_columns=sensitive,
        positive_label=parse_positive_label(positive_label),
        source_name=file.filename or "uploaded-dataset",
    )


@app.post("/mitigate/preview")
def mitigation_preview(payload: MitigationPreviewRequest) -> Dict[str, Any]:
    current_score = float(payload.fairness_summary.get("overall_fairness_score", 0))
    strategy = payload.strategy.lower()
    strategy_lift = {
        "reweighing": 8,
        "threshold_optimization": 6,
        "adversarial_debiasing": 12,
        "resampling": 7,
    }.get(strategy, 5)

    projected_score = min(100.0, current_score + strategy_lift)
    findings = []
    for item in payload.sensitive_findings:
        current = float(item.get("fairness_score", 0))
        improved = min(100.0, current + strategy_lift)
        findings.append(
            {
                **item,
                "projected_fairness_score": round(improved, 2),
                "projected_disparate_impact": round(min(1.0, float(item.get("disparate_impact", 0)) + (strategy_lift / 100)), 3),
            }
        )

    steps = [
        "Rebalance or reweight training data for impacted groups.",
        "Audit proxy features with high correlation to sensitive attributes.",
        "Revalidate group thresholds before production deployment.",
        "Run fairness gate in CI/CD before each release.",
    ]
    if strategy == "adversarial_debiasing":
        steps.insert(0, "Train a debiased representation model with adversarial loss.")

    return {
        "strategy": strategy,
        "current_score": round(current_score, 2),
        "projected_score": round(projected_score, 2),
        "projected_improvement": round(projected_score - current_score, 2),
        "group_projection": findings,
        "execution_steps": steps,
        "operational_notes": [
            "Preview is heuristic and should be validated on a holdout set.",
            "A fairness score above 95 depends on the actual dataset, group imbalance, and target quality.",
        ],
    }


def spark_runtime_status() -> Dict[str, Any]:
    return {
        "configured": SPARK_ENABLED,
        "available": PYSPARK_AVAILABLE,
        "session_active": _SPARK_SESSION is not None,
        "import_error": PYSPARK_IMPORT_ERROR or None,
        "runtime_error": _SPARK_RUNTIME_ERROR,
    }


def get_spark_session() -> Any:
    global _SPARK_RUNTIME_ERROR, _SPARK_SESSION

    if not SPARK_ENABLED or not PYSPARK_AVAILABLE:
        return None
    if _SPARK_SESSION is not None:
        return _SPARK_SESSION
    if _SPARK_RUNTIME_ERROR:
        return None

    with _SPARK_SESSION_LOCK:
        if _SPARK_SESSION is not None:
            return _SPARK_SESSION
        if _SPARK_RUNTIME_ERROR:
            return None

        try:
            session = (
                SparkSession.builder.appName(SPARK_APP_NAME)
                .master(SPARK_MASTER)
                .config("spark.ui.enabled", "false")
                .config("spark.sql.shuffle.partitions", SPARK_SHUFFLE_PARTITIONS)
                .config("spark.sql.execution.arrow.pyspark.enabled", "true")
                .config("spark.driver.host", SPARK_DRIVER_HOST)
                .config("spark.driver.bindAddress", SPARK_DRIVER_BIND_ADDRESS)
                .getOrCreate()
            )
            session.sparkContext.setLogLevel("ERROR")
            _SPARK_SESSION = session
        except Exception as exc:  # pragma: no cover - depends on Java/Spark runtime
            _SPARK_RUNTIME_ERROR = str(exc)
            return None

    return _SPARK_SESSION


def prepare_pandas_for_spark(df: pd.DataFrame) -> pd.DataFrame:
    prepared = df.copy()
    for column in prepared.columns:
        if pd.api.types.is_string_dtype(prepared[column]) or pd.api.types.is_object_dtype(prepared[column]):
            prepared[column] = prepared[column].astype(object).where(prepared[column].notna(), None)
    return prepared


def spark_sample_frame(df: pd.DataFrame, max_rows: int, stratify_column: Optional[str] = None) -> Optional[pd.DataFrame]:
    if len(df) < LARGE_DATASET_ROWS:
        return None

    spark = get_spark_session()
    if spark is None:
        return None

    try:
        prepared = prepare_pandas_for_spark(df)
        spark_df = spark.createDataFrame(prepared)

        if stratify_column and stratify_column in prepared.columns:
            quotas = []
            normalized = prepared[stratify_column].astype("string").fillna("__MISSING__")
            for value, count in normalized.value_counts(dropna=False).items():
                take = max(1, int(round(max_rows * (int(count) / len(prepared)))))
                quotas.append((str(value), int(min(int(count), take))))

            quota_df = spark.createDataFrame(quotas, ["__strata__", "__quota__"])
            sampled = (
                spark_df.withColumn(
                    "__strata__",
                    spark_functions.coalesce(spark_functions.col(stratify_column).cast("string"), spark_functions.lit("__MISSING__")),
                )
                .join(quota_df, on="__strata__", how="left")
                .withColumn(
                    "__row_num__",
                    spark_functions.row_number().over(Window.partitionBy("__strata__").orderBy(spark_functions.rand(seed=RANDOM_SEED))),
                )
                .filter(spark_functions.col("__row_num__") <= spark_functions.col("__quota__"))
                .drop("__strata__", "__quota__", "__row_num__")
            )
        else:
            sample_fraction = min(1.0, max_rows / len(prepared))
            sampled = spark_df.sample(withReplacement=False, fraction=sample_fraction, seed=RANDOM_SEED).limit(max_rows)

        sampled_df = sampled.toPandas()
        if sampled_df.empty:
            return None
        if len(sampled_df) > max_rows:
            sampled_df = sampled_df.sample(max_rows, random_state=RANDOM_SEED)
        return sampled_df.reindex(columns=df.columns, fill_value=None)
    except Exception:  # pragma: no cover - Spark runtime failures are environment-specific
        return None


def load_dataframe(filename: str, content: bytes) -> pd.DataFrame:
    lower = filename.lower()
    buffer = io.BytesIO(content)
    if lower.endswith(".csv"):
        return pd.read_csv(buffer)
    if lower.endswith(".xlsx") or lower.endswith(".xls"):
        return pd.read_excel(buffer)
    if lower.endswith(".json"):
        return pd.read_json(buffer)
    if lower.endswith(".parquet"):
        return pd.read_parquet(buffer)
    raise HTTPException(status_code=400, detail="Unsupported file format. Use CSV, XLSX, JSON, or Parquet.")


def optimize_dataframe_memory(df: pd.DataFrame) -> pd.DataFrame:
    for column in df.select_dtypes(include=["int", "int64", "int32", "uint64", "uint32"]).columns:
        df[column] = pd.to_numeric(df[column], downcast="integer")
    for column in df.select_dtypes(include=["float", "float64", "float32"]).columns:
        df[column] = pd.to_numeric(df[column], downcast="float")
    for column in df.select_dtypes(include=["object"]).columns:
        unique_ratio = df[column].nunique(dropna=False) / max(1, len(df))
        if unique_ratio < 0.5:
            df[column] = df[column].astype("string")
    return df


def sample_frame(df: pd.DataFrame, max_rows: int, stratify_column: Optional[str] = None) -> pd.DataFrame:
    if len(df) <= max_rows:
        return df.copy()

    spark_sampled = spark_sample_frame(df, max_rows, stratify_column)
    if spark_sampled is not None and not spark_sampled.empty:
        return spark_sampled

    if stratify_column and stratify_column in df.columns:
        sampled_parts = []
        normalized = df[stratify_column].astype(str)
        for _, subset in df.groupby(normalized, dropna=False):
            fraction = len(subset) / len(df)
            take = max(1, int(round(max_rows * fraction)))
            sampled_parts.append(subset.sample(min(take, len(subset)), random_state=RANDOM_SEED))
        sampled = pd.concat(sampled_parts).drop_duplicates()
        if len(sampled) > max_rows:
            sampled = sampled.sample(max_rows, random_state=RANDOM_SEED)
        return sampled
    return df.sample(max_rows, random_state=RANDOM_SEED)


def fit_category_compactors(X: pd.DataFrame) -> Dict[str, set[str]]:
    compactors: Dict[str, set[str]] = {}
    for column in X.columns:
        if pd.api.types.is_numeric_dtype(X[column]):
            continue
        top_values = X[column].astype(str).value_counts().head(MAX_CATEGORY_LEVELS).index.tolist()
        if X[column].nunique(dropna=False) > MAX_CATEGORY_LEVELS:
            compactors[column] = set(top_values)
    return compactors


def apply_category_compactors(X: pd.DataFrame, compactors: Dict[str, set[str]]) -> pd.DataFrame:
    transformed = X.copy()
    for column, allowed in compactors.items():
        transformed[column] = transformed[column].astype(str).where(
            transformed[column].astype(str).isin(allowed),
            "__OTHER__",
        )
    return transformed


def build_intersectional_group_labels(df: pd.DataFrame, columns: List[str]) -> pd.Series:
    available = [column for column in columns if column in df.columns]
    if not available:
        return pd.Series(["__ALL__"] * len(df), index=df.index, dtype="string")

    combined = available[0] + "=" + df[available[0]].astype("string").fillna("__MISSING__")
    for column in available[1:]:
        combined = combined + " | " + column + "=" + df[column].astype("string").fillna("__MISSING__")
    return combined.astype("string")


def build_intersectional_findings(
    df: pd.DataFrame,
    sensitive_columns: List[str],
    prediction_column: str,
    target_column: Optional[str],
    positive_label: Any,
) -> List[Dict[str, Any]]:
    available = [column for column in sensitive_columns if column in df.columns][:MAX_INTERSECTIONAL_COMPONENTS]
    if len(available) < 2:
        return []

    combos = list(combinations(available, 2))
    if len(available) > 2:
        combos.append(tuple(available))

    findings: List[Dict[str, Any]] = []
    for combo in combos[:MAX_INTERSECTIONAL_FINDINGS]:
        intersectional_name = " x ".join(combo)
        temp_column = "__intersectional__" + "__".join(combo)
        frame = pd.DataFrame(
            {
                temp_column: build_intersectional_group_labels(df, list(combo)),
                prediction_column: df[prediction_column],
            },
            index=df.index,
        )
        if target_column and target_column in df.columns:
            frame[target_column] = df[target_column]

        finding = analyze_sensitive_column(frame, temp_column, prediction_column, target_column, positive_label)
        if len(finding.get("group_metrics", [])) < 2:
            continue

        finding["sensitive_column"] = intersectional_name
        finding["component_sensitive_columns"] = list(combo)
        finding["is_intersectional"] = True
        finding["notes"] = [
            *finding.get("notes", []),
            f"Intersectional slice built from {', '.join(combo)}.",
        ]
        findings.append(finding)

    return findings


def blend_fairness_score(primary_findings: List[Dict[str, Any]], intersectional_findings: List[Dict[str, Any]]) -> float:
    if not primary_findings and not intersectional_findings:
        return 100.0
    if not intersectional_findings:
        return round(float(np.mean([item["fairness_score"] for item in primary_findings])), 2)

    primary_average = float(np.mean([item["fairness_score"] for item in primary_findings])) if primary_findings else 100.0
    intersectional_average = float(np.mean([item["fairness_score"] for item in intersectional_findings]))
    worst_intersectional = float(min(item["fairness_score"] for item in intersectional_findings))
    blended = (primary_average * 0.55) + (intersectional_average * 0.25) + (worst_intersectional * 0.20)
    return round(max(0.0, min(100.0, blended)), 2)


def compute_reweighing_weights(X: pd.DataFrame, y: pd.Series, sensitive_columns: List[str]) -> Tuple[pd.Series, Dict[str, Any]]:
    available = [column for column in sensitive_columns if column in X.columns]
    default_weights = pd.Series(np.ones(len(y), dtype=float), index=y.index)

    if not available:
        return default_weights, {
            "applied": False,
            "strategy": "intersectional_reweighing",
            "group_columns": [],
            "notes": ["No sensitive columns were available for training-time reweighing."],
        }

    group_labels = build_intersectional_group_labels(X, available).astype(str)
    working = pd.DataFrame(
        {
            "__group__": group_labels,
            "__label__": y.astype(int),
        },
        index=y.index,
    )

    total = len(working)
    if total == 0:
        return default_weights, {
            "applied": False,
            "strategy": "intersectional_reweighing",
            "group_columns": available,
            "notes": ["Training sample was empty, so reweighing was skipped."],
        }

    group_counts = working["__group__"].value_counts()
    label_counts = working["__label__"].value_counts()
    joint_counts = working.groupby(["__group__", "__label__"]).size()
    weights = pd.Series(np.ones(total, dtype=float), index=working.index)

    for (group_name, label_value), joint_count in joint_counts.items():
        if joint_count <= 0:
            continue

        raw_weight = (group_counts[group_name] * label_counts[label_value]) / max(total * joint_count, 1)
        if joint_count < MIN_REWEIGHING_CELL_COUNT:
            raw_weight = (raw_weight + 1.0) / 2.0

        mask = (working["__group__"] == group_name) & (working["__label__"] == label_value)
        weights.loc[mask] = raw_weight

    weights = weights.clip(REWEIGHING_WEIGHT_CLIP_MIN, REWEIGHING_WEIGHT_CLIP_MAX)
    weights = weights / max(float(weights.mean()), 1e-9)
    dominant_group = str(group_counts.index[0]) if not group_counts.empty else "__UNKNOWN__"

    return weights, {
        "applied": True,
        "strategy": "intersectional_reweighing",
        "group_columns": available,
        "group_count": int(group_counts.shape[0]),
        "dominant_group": dominant_group,
        "weight_min": round(float(weights.min()), 4),
        "weight_max": round(float(weights.max()), 4),
        "weight_mean": round(float(weights.mean()), 4),
        "notes": [
            "Training-time reweighing balanced label frequencies across intersectional sensitive groups.",
        ],
    }


def analyze_dataframe(
    df: pd.DataFrame,
    requested_domain: str,
    target_column: Optional[str],
    prediction_column: Optional[str],
    sensitive_columns: List[str],
    positive_label: Any,
    source_name: str,
) -> Dict[str, Any]:
    df = optimize_dataframe_memory(df.copy())
    df.columns = [str(col).strip() for col in df.columns]
    resolved_domain = infer_domain(df, requested_domain)
    large_dataset_mode = len(df) >= LARGE_DATASET_ROWS
    precorrected_upload = "corrected_prediction" in df.columns or "correction_method" in df.columns

    inferred_target = target_column or infer_target_column(df)
    inferred_prediction = prediction_column or ("corrected_prediction" if "corrected_prediction" in df.columns else infer_prediction_column(df))
    inferred_sensitive = sensitive_columns or infer_sensitive_columns(df, resolved_domain)
    inferred_sensitive = [col for col in inferred_sensitive if col in df.columns]

    if not inferred_sensitive:
        inferred_sensitive = fallback_sensitive_columns(df)
    if not inferred_sensitive:
        raise HTTPException(status_code=400, detail="Unable to infer sensitive columns from the dataset.")

    score_series: Optional[pd.Series] = None
    used_surrogate_model = False
    score_column: Optional[str] = None
    reweighing_summary: Dict[str, Any] = {
        "applied": False,
        "strategy": "intersectional_reweighing",
        "group_columns": [],
        "notes": ["Reweighing was not used for this analysis path."],
    }
    training_rows_used = min(len(df), MAX_TRAIN_ROWS)
    proxy_scan_rows_used = min(len(df), MAX_PROXY_SCAN_ROWS)

    if inferred_prediction and inferred_prediction not in df.columns:
        inferred_prediction = None
    if inferred_target and inferred_target not in df.columns:
        inferred_target = None

    if not inferred_prediction:
        inferred_prediction = "_fairai_prediction"
        score_column = "_fairai_prediction_score"
        if inferred_target:
            df[inferred_prediction], score_series, reweighing_summary = generate_supervised_predictions(
                df,
                inferred_target,
                positive_label,
                inferred_sensitive,
            )
        else:
            df[inferred_prediction], score_series = generate_unsupervised_predictions(df, inferred_sensitive)
        df[score_column] = score_series
        used_surrogate_model = True
    elif is_probability_like(df[inferred_prediction]):
        score_column = inferred_prediction

    fairness_summary = {"overall_fairness_score": 100.0}
    findings = [analyze_sensitive_column(df, sensitive, inferred_prediction, inferred_target, positive_label) for sensitive in inferred_sensitive]
    intersectional_findings = build_intersectional_findings(
        df,
        inferred_sensitive,
        inferred_prediction,
        inferred_target,
        positive_label,
    )
    if findings:
        fairness_summary["overall_fairness_score"] = blend_fairness_score(findings, intersectional_findings)
        fairness_summary["risk_level"] = score_to_risk(fairness_summary["overall_fairness_score"])
        fairness_summary["intersectional_fairness_score"] = (
            round(float(np.mean([item["fairness_score"] for item in intersectional_findings])), 2)
            if intersectional_findings
            else None
        )

    root_causes = build_root_causes(df, inferred_sensitive, inferred_target, inferred_prediction)
    root_causes.extend(build_intersectional_root_causes(intersectional_findings))
    recommendations = build_recommendations(findings + intersectional_findings, root_causes, reweighing_summary)
    corrected_df, correction_summary = build_corrected_dataset(
        df,
        inferred_sensitive,
        inferred_prediction,
        inferred_target,
        positive_label,
        score_column,
    )
    corrected_csv = corrected_df.to_csv(index=False)
    corrected_findings = [
        analyze_sensitive_column(corrected_df, sensitive, "corrected_prediction", inferred_target, positive_label)
        for sensitive in inferred_sensitive
    ]
    corrected_intersectional_findings = build_intersectional_findings(
        corrected_df,
        inferred_sensitive,
        "corrected_prediction",
        inferred_target,
        positive_label,
    )
    corrected_score = (
        blend_fairness_score(corrected_findings, corrected_intersectional_findings)
        if corrected_findings
        else float(fairness_summary["overall_fairness_score"])
    )
    fairness_summary["corrected_fairness_score"] = corrected_score
    fairness_summary["overall_accuracy"] = round(
        compute_overall_accuracy(df, inferred_target, inferred_prediction, positive_label),
        4,
    )
    fairness_summary["corrected_accuracy"] = round(
        compute_overall_accuracy(corrected_df, inferred_target, "corrected_prediction", positive_label),
        4,
    )
    fairness_summary["disparate_impact"] = round(min((item["disparate_impact"] for item in findings), default=1.0), 4)
    fairness_summary["corrected_disparate_impact"] = round(
        min((item["disparate_impact"] for item in corrected_findings), default=1.0),
        4,
    )
    fairness_summary["intersectional_corrected_fairness_score"] = (
        round(float(np.mean([item["fairness_score"] for item in corrected_intersectional_findings])), 2)
        if corrected_intersectional_findings
        else None
    )
    fairness_summary["fairness_target"] = 95.0
    fairness_summary["fairness_target_met"] = corrected_score >= 95.0
    fairness_summary["fairness_target_gap"] = round(max(0.0, 95.0 - corrected_score), 2)
    spark_acceleration_active = large_dataset_mode and _SPARK_SESSION is not None
    explanation = build_explanation(
        resolved_domain,
        source_name,
        fairness_summary,
        findings,
        intersectional_findings,
        root_causes,
        reweighing_summary,
    )
    explainability = build_explainability(df, inferred_prediction, inferred_target, inferred_sensitive)
    analysis_log = build_analysis_log(
        source_name=source_name,
        requested_domain=requested_domain,
        resolved_domain=resolved_domain,
        target_column=inferred_target,
        prediction_column=inferred_prediction,
        sensitive_columns=inferred_sensitive,
        used_surrogate_model=used_surrogate_model,
        fairness_score=float(fairness_summary["overall_fairness_score"]),
        corrected_score=corrected_score,
        large_dataset_mode=large_dataset_mode,
        training_rows_used=training_rows_used,
        correction_summary=correction_summary,
        spark_acceleration_active=spark_acceleration_active,
        reweighing_applied=bool(reweighing_summary.get("applied")),
        intersectional_count=len(intersectional_findings),
    )
    report_markdown = build_report_markdown(
        source_name=source_name,
        resolved_domain=resolved_domain,
        fairness_summary=fairness_summary,
        findings=findings,
        intersectional_findings=intersectional_findings,
        corrected_findings=corrected_findings,
        corrected_intersectional_findings=corrected_intersectional_findings,
        root_causes=root_causes,
        recommendations=recommendations,
        analysis_log=analysis_log,
        explainability=explainability,
        correction_summary=correction_summary,
        reweighing_summary=reweighing_summary,
    )

    return {
        "metadata": {
            "rows": int(len(df)),
            "columns": df.columns.tolist(),
            "domain": resolved_domain,
            "source_name": source_name,
            "target_column": inferred_target,
            "prediction_column": inferred_prediction,
            "sensitive_columns": inferred_sensitive,
            "domain_auto_detected": requested_domain in ("", "auto"),
            "target_auto_detected": target_column in (None, ""),
            "prediction_auto_generated": used_surrogate_model,
            "sensitive_auto_detected": len(sensitive_columns) == 0,
            "large_dataset_mode": large_dataset_mode,
            "training_rows_used": training_rows_used,
            "proxy_scan_rows_used": proxy_scan_rows_used,
            "correction_method": correction_summary["method"],
            "precorrected_upload": precorrected_upload,
            "surrogate_model": "xgboost" if used_surrogate_model else "user_supplied_predictions",
            "spark_acceleration_active": spark_acceleration_active,
            "reweighing_applied": bool(reweighing_summary.get("applied")),
            "intersectional_analysis_enabled": bool(intersectional_findings),
            "intersectional_findings_count": len(intersectional_findings),
        },
        "detection": {
            "resolved_domain": resolved_domain,
            "target_column": inferred_target,
            "prediction_column": inferred_prediction,
            "sensitive_columns": inferred_sensitive,
            "positive_label": str(positive_label),
            "generated_target": inferred_target not in df.columns,
            "generated_prediction": used_surrogate_model,
            "notes": [
                "Domain auto-detected from column names." if requested_domain in ("", "auto") else f"Domain fixed to {resolved_domain}.",
                f"Sensitive columns inferred as {', '.join(inferred_sensitive)}.",
                "Prediction column generated with an XGBoost surrogate model." if used_surrogate_model else f"Used prediction column '{inferred_prediction}'.",
                "Training-time intersectional reweighing was applied to the XGBoost surrogate model."
                if reweighing_summary.get("applied")
                else "Training-time reweighing was not applied on this analysis path.",
                f"Intersectional fairness audit evaluated {len(intersectional_findings)} combined slices."
                if intersectional_findings
                else "Intersectional fairness audit was skipped because fewer than two sensitive columns were available.",
                "Large dataset mode enabled with Spark-assisted sampling and batched XGBoost scoring."
                if spark_acceleration_active
                else "Large dataset mode enabled with sampled training and batched scoring."
                if large_dataset_mode
                else "Standard dataset mode enabled.",
                f"Correction pipeline used {correction_summary['method']}.",
                "Uploaded file already contained a corrected prediction and was re-audited without re-correcting the same decisions." if precorrected_upload else "Uploaded file was corrected during this analysis run.",
            ],
        },
        "fairness_summary": fairness_summary,
        "sensitive_findings": findings,
        "intersectional_findings": intersectional_findings,
        "corrected_sensitive_findings": corrected_findings,
        "corrected_intersectional_findings": corrected_intersectional_findings,
        "root_causes": root_causes,
        "recommendations": recommendations,
        "explanation": explanation,
        "preview_scores_available": score_series is not None or score_column is not None,
        "analysis_log": analysis_log,
        "automation_summary": {
            "requested_domain": requested_domain,
            "resolved_domain": resolved_domain,
            "inferred_target_column": inferred_target,
            "inferred_prediction_column": inferred_prediction,
            "inferred_sensitive_columns": inferred_sensitive,
            "used_surrogate_model": used_surrogate_model,
            "large_dataset_mode": large_dataset_mode,
            "precorrected_upload": precorrected_upload,
            "spark_acceleration_active": spark_acceleration_active,
            "surrogate_model": "xgboost" if used_surrogate_model else "user_supplied_predictions",
            "intersectional_findings_count": len(intersectional_findings),
            "reweighing_summary": reweighing_summary,
            "correction_summary": correction_summary,
        },
        "explainability": explainability,
        "correction_summary": correction_summary,
        "corrected_csv": corrected_csv,
        "report_markdown": report_markdown,
        "artifacts": {
            "corrected_csv_available": True,
            "audit_pdf_available": True,
        },
    }


def infer_domain(df: pd.DataFrame, requested_domain: str) -> str:
    if requested_domain and requested_domain not in {"", "auto"}:
        return requested_domain
    joined = " ".join([str(col).lower() for col in df.columns])
    scores = {
        domain: sum(1 for hint in hints if hint in joined)
        for domain, hints in DOMAIN_HINTS.items()
    }
    best_domain = max(scores, key=scores.get)
    return best_domain if scores[best_domain] > 0 else "general"


def infer_target_column(df: pd.DataFrame) -> Optional[str]:
    lowered = {col.lower(): col for col in df.columns}
    for name in COMMON_TARGET_NAMES:
        if name in lowered:
            return lowered[name]
    candidates = []
    for col in df.columns:
        series = df[col].dropna()
        unique = series.nunique()
        if 2 <= unique <= 6 and len(series) > 0:
            score = 0
            if series.dtype.kind in {"i", "u", "b", "f"}:
                score += 2
            if any(token in col.lower() for token in COMMON_TARGET_NAMES):
                score += 3
            score += max(0, 6 - unique)
            candidates.append((score, col))
    return sorted(candidates, reverse=True)[0][1] if candidates else None


def infer_prediction_column(df: pd.DataFrame) -> Optional[str]:
    lowered = {col.lower(): col for col in df.columns}
    for name in COMMON_PREDICTION_NAMES:
        if name in lowered:
            return lowered[name]
    return None


def infer_sensitive_columns(df: pd.DataFrame, domain: str) -> List[str]:
    matches = [col for col in df.columns if col.lower() in COMMON_SENSITIVE_NAMES]
    if domain == "hiring":
        matches += [col for col in df.columns if col.lower() in {"education_level", "marital_status"}]
    return list(dict.fromkeys(matches))[:3]


def fallback_sensitive_columns(df: pd.DataFrame) -> List[str]:
    candidates = []
    for col in df.columns:
        series = df[col].dropna()
        unique = series.nunique()
        if 2 <= unique <= 10 and str(series.dtype) in {"object", "string"}:
            candidates.append(col)
    return candidates[:2]


def parse_positive_label(value: str) -> Any:
    value = value.strip()
    if value.isdigit():
        return int(value)
    try:
        return float(value)
    except ValueError:
        return value


def normalize_binary(series: pd.Series, positive_label: Any) -> pd.Series:
    positive_set = {str(positive_label).strip().lower(), "1", "true", "yes", "approved", "selected", "hired", "positive"}
    normalized = series.astype(str).str.strip().str.lower().isin(positive_set).astype(int)
    if normalized.nunique() < 2 and pd.api.types.is_numeric_dtype(series):
        numeric = pd.to_numeric(series, errors="coerce").fillna(0)
        return (numeric > 0).astype(int)
    return normalized


def is_probability_like(series: pd.Series) -> bool:
    if not pd.api.types.is_numeric_dtype(series):
        return False
    numeric = pd.to_numeric(series, errors="coerce").dropna()
    if numeric.empty:
        return False
    return float(numeric.min()) >= 0.0 and float(numeric.max()) <= 1.0


def generate_supervised_predictions(
    df: pd.DataFrame,
    target_column: str,
    positive_label: Any,
    sensitive_columns: List[str],
) -> tuple[pd.Series, pd.Series, Dict[str, Any]]:
    X = df.drop(columns=[target_column])
    y = normalize_binary(df[target_column], positive_label)
    sampled = sample_frame(pd.concat([X, y.rename(target_column)], axis=1), MAX_TRAIN_ROWS, target_column)
    X_train = sampled.drop(columns=[target_column])
    y_train = sampled[target_column]
    compactors = fit_category_compactors(X_train)
    X_train = apply_category_compactors(X_train, compactors)
    X_full = apply_category_compactors(X, compactors)
    sample_weights, reweighing_summary = compute_reweighing_weights(X_train, y_train, sensitive_columns)
    model = build_model_pipeline(X_train, y_train)
    model.fit(X_train, y_train, model__sample_weight=sample_weights.to_numpy())
    probabilities = predict_in_batches(model, X_full)
    predictions = (probabilities >= 0.5).astype(int)
    return pd.Series(predictions, index=df.index), pd.Series(probabilities, index=df.index), reweighing_summary


def generate_unsupervised_predictions(df: pd.DataFrame, sensitive_columns: List[str]) -> tuple[pd.Series, pd.Series]:
    feature_frame = df.drop(columns=sensitive_columns, errors="ignore")
    numeric = feature_frame.select_dtypes(include=[np.number]).copy()
    if numeric.empty:
        numeric_score = pd.Series(np.zeros(len(df)))
    else:
        numeric = numeric.fillna(numeric.median(numeric_only=True))
        centered = (numeric - numeric.mean()) / numeric.std(ddof=0).replace(0, 1)
        numeric_score = centered.sum(axis=1)

    categorical = [col for col in feature_frame.columns if col not in numeric.columns]
    categorical_score = pd.Series(np.zeros(len(df)), index=df.index, dtype=float)
    for col in categorical[:5]:
        freq = feature_frame[col].astype(str).value_counts(normalize=True)
        categorical_score += 1 - feature_frame[col].astype(str).map(freq).fillna(0)

    combined = numeric_score.add(categorical_score, fill_value=0)
    normalized = (combined - combined.min()) / max(1e-9, float(combined.max() - combined.min()))
    predictions = (normalized >= normalized.median()).astype(int)
    return predictions, normalized


def compute_scale_pos_weight(y: pd.Series) -> float:
    positives = int((y == 1).sum())
    negatives = int((y == 0).sum())
    if positives <= 0 or negatives <= 0:
        return 1.0
    return max(1.0, negatives / positives)


def build_model_pipeline(X: pd.DataFrame, y: pd.Series) -> Pipeline:
    if not XGBOOST_AVAILABLE or XGBClassifier is None:
        raise HTTPException(status_code=500, detail=f"XGBoost runtime is unavailable: {XGBOOST_IMPORT_ERROR}")

    numeric_cols = X.select_dtypes(include=[np.number]).columns.tolist()
    categorical_cols = [col for col in X.columns if col not in numeric_cols]
    scale_pos_weight = compute_scale_pos_weight(y)
    preprocessor = ColumnTransformer(
        transformers=[
            (
                "num",
                Pipeline([
                    ("imputer", SimpleImputer(strategy="median")),
                ]),
                numeric_cols,
            ),
            (
                "cat",
                Pipeline([
                    ("imputer", SimpleImputer(strategy="most_frequent")),
                    (
                        "onehot",
                        OneHotEncoder(
                            handle_unknown="ignore",
                            max_categories=MAX_CATEGORY_LEVELS + 1,
                        ),
                    ),
                ]),
                categorical_cols,
            ),
        ],
        remainder="drop",
    )
    return Pipeline([
        ("preprocessor", preprocessor),
        (
            "model",
            XGBClassifier(
                objective="binary:logistic",
                eval_metric="logloss",
                n_estimators=240,
                max_depth=6,
                learning_rate=0.05,
                subsample=0.9,
                colsample_bytree=0.8,
                reg_lambda=1.0,
                min_child_weight=1,
                tree_method="hist",
                n_jobs=max(1, (os.cpu_count() or 2) - 1),
                random_state=RANDOM_SEED,
                scale_pos_weight=scale_pos_weight,
            ),
        ),
    ])


def predict_in_batches(model: Pipeline, X: pd.DataFrame) -> np.ndarray:
    batches: List[np.ndarray] = []
    for start in range(0, len(X), PREDICTION_BATCH_ROWS):
        chunk = X.iloc[start : start + PREDICTION_BATCH_ROWS]
        batches.append(model.predict_proba(chunk)[:, 1])
    return np.concatenate(batches) if batches else np.array([])


def analyze_sensitive_column(df: pd.DataFrame, sensitive: str, prediction_column: str, target_column: Optional[str], positive_label: Any) -> Dict[str, Any]:
    frame = df[[sensitive, prediction_column] + ([target_column] if target_column else [])].copy()
    frame = frame.dropna(subset=[sensitive, prediction_column])
    if is_probability_like(frame[prediction_column]):
        frame[prediction_column] = (pd.to_numeric(frame[prediction_column], errors="coerce").fillna(0) >= 0.5).astype(int)
    else:
        frame[prediction_column] = normalize_binary(frame[prediction_column], positive_label)
    if target_column:
        frame[target_column] = normalize_binary(frame[target_column], positive_label)

    groups = frame[sensitive].astype(str).value_counts().head(5).index.tolist()
    if len(groups) < 2:
        return {
            "sensitive_column": sensitive,
            "fairness_score": 100.0,
            "risk_level": "low",
            "group_metrics": [],
            "demographic_parity_difference": 0.0,
            "disparate_impact": 1.0,
            "notes": ["Not enough distinct groups for comparison."],
        }

    baseline = groups[0]
    baseline_rate = frame.loc[frame[sensitive].astype(str) == baseline, prediction_column].mean()
    group_metrics = []
    disparities = []
    impacts = []
    accuracy_gap = []

    for group in groups:
        subset = frame.loc[frame[sensitive].astype(str) == group]
        selection_rate = float(subset[prediction_column].mean()) if len(subset) else 0.0
        metrics = {
            "group": group,
            "count": int(len(subset)),
            "selection_rate": round(selection_rate, 4),
        }
        disparities.append(abs(selection_rate - baseline_rate))
        impacts.append(selection_rate / baseline_rate if baseline_rate > 0 else 1.0)

        if target_column:
            tp = int(((subset[prediction_column] == 1) & (subset[target_column] == 1)).sum())
            tn = int(((subset[prediction_column] == 0) & (subset[target_column] == 0)).sum())
            fp = int(((subset[prediction_column] == 1) & (subset[target_column] == 0)).sum())
            fn = int(((subset[prediction_column] == 0) & (subset[target_column] == 1)).sum())
            tpr = safe_divide(tp, tp + fn)
            fpr = safe_divide(fp, fp + tn)
            fnr = safe_divide(fn, fn + tp)
            accuracy = safe_divide(tp + tn, len(subset))
            metrics.update({
                "true_positive_rate": round(tpr, 4),
                "false_positive_rate": round(fpr, 4),
                "false_negative_rate": round(fnr, 4),
                "accuracy": round(accuracy, 4),
            })
            accuracy_gap.append(accuracy)
        group_metrics.append(metrics)

    dp_diff = float(max(disparities)) if disparities else 0.0
    disparate_impact = float(min(impacts)) if impacts else 1.0
    accuracy_spread = float(max(accuracy_gap) - min(accuracy_gap)) if accuracy_gap else 0.0
    fairness_score = 100 - (dp_diff * 55) - (max(0.0, 0.8 - disparate_impact) * 100) - (accuracy_spread * 20)
    fairness_score = round(max(0.0, min(100.0, fairness_score)), 2)

    notes = []
    if disparate_impact < 0.8:
        notes.append("Disparate impact below the common 0.80 threshold.")
    if dp_diff > 0.15:
        notes.append("Large demographic parity gap detected.")
    if accuracy_spread > 0.1:
        notes.append("Model performance differs noticeably across groups.")

    return {
        "sensitive_column": sensitive,
        "baseline_group": baseline,
        "fairness_score": fairness_score,
        "risk_level": score_to_risk(fairness_score),
        "demographic_parity_difference": round(dp_diff, 4),
        "disparate_impact": round(disparate_impact, 4),
        "accuracy_spread": round(accuracy_spread, 4),
        "group_metrics": group_metrics,
        "notes": notes,
    }


def build_root_causes(df: pd.DataFrame, sensitive_columns: List[str], target_column: Optional[str], prediction_column: str) -> List[Dict[str, Any]]:
    causes: List[Dict[str, Any]] = []
    sampled = sample_frame(df, MAX_PROXY_SCAN_ROWS, target_column)
    for sensitive in sensitive_columns:
        value_counts = sampled[sensitive].astype(str).value_counts(normalize=True)
        minority_share = float(value_counts.min()) if len(value_counts) > 1 else 0.0
        if minority_share < 0.2:
            causes.append({
                "type": "representation_imbalance",
                "sensitive_column": sensitive,
                "severity": "high" if minority_share < 0.1 else "medium",
                "details": f"Smallest group share is {minority_share:.1%}, suggesting underrepresentation.",
            })

        proxy_scores = []
        for column in sampled.columns:
            if column in {sensitive, target_column, prediction_column}:
                continue
            if sampled[column].nunique(dropna=True) < 2:
                continue
            proxy = estimate_proxy_signal(sampled[column], sampled[sensitive])
            if proxy >= 0.35:
                proxy_scores.append((column, proxy))
        for column, proxy in sorted(proxy_scores, key=lambda item: item[1], reverse=True)[:3]:
            causes.append({
                "type": "proxy_feature_risk",
                "sensitive_column": sensitive,
                "feature": column,
                "severity": "medium" if proxy < 0.55 else "high",
                "details": f"Feature '{column}' shows strong association with '{sensitive}' ({proxy:.2f}).",
            })
    return causes


def build_intersectional_root_causes(intersectional_findings: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    causes: List[Dict[str, Any]] = []
    for finding in intersectional_findings:
        if finding["fairness_score"] >= 85 and finding["disparate_impact"] >= 0.8:
            continue

        causes.append({
            "type": "intersectional_disparity",
            "sensitive_column": finding["sensitive_column"],
            "severity": "high" if finding["fairness_score"] < 65 or finding["disparate_impact"] < 0.8 else "medium",
            "details": (
                f"Intersectional slice '{finding['sensitive_column']}' shows fairness {finding['fairness_score']} "
                f"and disparate impact {finding['disparate_impact']}."
            ),
        })

    return causes[:MAX_INTERSECTIONAL_FINDINGS]


def estimate_proxy_signal(feature: pd.Series, sensitive: pd.Series) -> float:
    data = pd.DataFrame({"feature": feature.astype(str), "sensitive": sensitive.astype(str)}).dropna()
    if len(data) > MAX_PROXY_SCAN_ROWS:
        data = data.sample(MAX_PROXY_SCAN_ROWS, random_state=RANDOM_SEED)
    if data.empty:
        return 0.0
    contingency = pd.crosstab(data["feature"], data["sensitive"])
    total = contingency.to_numpy().sum()
    if total == 0:
        return 0.0
    expected = np.outer(contingency.sum(axis=1), contingency.sum(axis=0)) / total
    observed = contingency.to_numpy()
    with np.errstate(divide="ignore", invalid="ignore"):
        chi_square = np.nansum((observed - expected) ** 2 / np.where(expected == 0, 1, expected))
    min_dim = min(contingency.shape) - 1
    if min_dim <= 0:
        return 0.0
    cramers_v = np.sqrt((chi_square / total) / min_dim)
    return float(min(cramers_v, 1.0))


def build_recommendations(
    findings: List[Dict[str, Any]],
    root_causes: List[Dict[str, Any]],
    reweighing_summary: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, Any]]:
    recommendations: List[Dict[str, Any]] = []
    for finding in findings:
        if finding["disparate_impact"] < 0.8:
            recommendations.append({
                "category": "data",
                "priority": "high",
                "title": f"Rebalance data for {finding['sensitive_column']}",
                "description": "Increase representation or apply reweighting for groups with lower positive outcomes.",
            })
        if finding["accuracy_spread"] > 0.1:
            recommendations.append({
                "category": "model",
                "priority": "medium",
                "title": f"Retrain model with fairness constraints on {finding['sensitive_column']}",
                "description": "Validate equal opportunity and reduce per-group error gaps before deployment.",
            })
        if finding.get("is_intersectional") and (finding["fairness_score"] < 85 or finding["disparate_impact"] < 0.8):
            recommendations.append({
                "category": "intersectional",
                "priority": "high" if finding["fairness_score"] < 65 else "medium",
                "title": f"Audit intersectional disparity: {finding['sensitive_column']}",
                "description": "Review combined demographic slices and validate mitigation on the worst-case intersectional groups.",
            })
    for cause in root_causes:
        if cause["type"] == "proxy_feature_risk":
            recommendations.append({
                "category": "feature",
                "priority": cause["severity"],
                "title": f"Audit proxy feature: {cause['feature']}",
                "description": cause["details"],
            })
        if cause["type"] == "representation_imbalance":
            recommendations.append({
                "category": "governance",
                "priority": cause["severity"],
                "title": f"Review sample coverage for {cause['sensitive_column']}",
                "description": cause["details"],
            })
        if cause["type"] == "intersectional_disparity":
            recommendations.append({
                "category": "intersectional",
                "priority": cause["severity"],
                "title": f"Strengthen intersectional mitigation for {cause['sensitive_column']}",
                "description": cause["details"],
            })
    if reweighing_summary and reweighing_summary.get("applied"):
        recommendations.append({
            "category": "training",
            "priority": "medium",
            "title": "Validate reweighing on a holdout set",
            "description": "Training-time intersectional reweighing is active; confirm calibration, fairness lift, and accuracy on unseen data.",
        })
    else:
        recommendations.append({
            "category": "training",
            "priority": "medium",
            "title": "Enable training-time reweighing when labels are available",
            "description": "Use label-aware reweighing to reduce imbalance across intersectional sensitive groups during supervised retraining.",
        })
    recommendations.append({
        "category": "ci_cd",
        "priority": "high",
        "title": "Add a fairness gate to CI/CD",
        "description": "Block deployment when fairness score drops below the release threshold.",
    })
    return unique_recommendations(recommendations)


def unique_recommendations(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    seen = set()
    unique = []
    for item in items:
        key = (item["category"], item["title"])
        if key not in seen:
            unique.append(item)
            seen.add(key)
    return unique


def build_explanation(
    domain: str,
    source_name: str,
    fairness_summary: Dict[str, Any],
    findings: List[Dict[str, Any]],
    intersectional_findings: List[Dict[str, Any]],
    root_causes: List[Dict[str, Any]],
    reweighing_summary: Dict[str, Any],
) -> Dict[str, Any]:
    worst = sorted(findings, key=lambda item: item["fairness_score"])[0] if findings else None
    worst_intersectional = sorted(intersectional_findings, key=lambda item: item["fairness_score"])[0] if intersectional_findings else None
    summary = (
        f"Analysis for {source_name} in the {domain} domain shows an overall fairness score of "
        f"{fairness_summary['overall_fairness_score']} and a corrected score of "
        f"{fairness_summary.get('corrected_fairness_score', fairness_summary['overall_fairness_score'])}."
    )
    if worst:
        summary += (
            f" The most affected attribute is '{worst['sensitive_column']}', with disparate impact "
            f"{worst['disparate_impact']} and demographic parity difference {worst['demographic_parity_difference']}."
        )
    if worst_intersectional:
        summary += (
            f" The weakest intersectional slice is '{worst_intersectional['sensitive_column']}', scoring "
            f"{worst_intersectional['fairness_score']}."
        )
    if root_causes:
        summary += " Likely drivers include representation imbalance and proxy-feature effects."
    if reweighing_summary.get("applied"):
        summary += " Training-time intersectional reweighing was applied to the surrogate model."
    if fairness_summary.get("overall_fairness_score") == fairness_summary.get("corrected_fairness_score"):
        summary += " The uploaded file appears to already contain the corrected decisions used for audit."
    if fairness_summary.get("fairness_target_met"):
        summary += " The corrected run meets the 95 fairness target."
    else:
        summary += f" The corrected run remains {fairness_summary.get('fairness_target_gap', 0)} points short of the 95 target."
    return {
        "executive_summary": summary,
        "plain_language": [
            "The system compares outcomes across sensitive groups instead of checking only overall accuracy.",
            "Intersectional fairness checks whether combined identities such as gender plus age group suffer larger disparities than each attribute alone.",
            "A low disparate impact means one group receives favorable outcomes much less often than the baseline group.",
            "Proxy-feature risk means a non-sensitive column may still carry hidden demographic information.",
            "Corrected fairness is the post-mitigation score shown on the dashboard and report.",
            "The correction engine now applies iterative parity repair after threshold tuning to stabilize re-audits.",
            "Supervised surrogate predictions now use XGBoost, Spark accelerates sampled large-dataset workloads when its runtime is available, and reweighing balances the training signal across intersectional groups.",
        ],
    }


def build_corrected_dataset(
    df: pd.DataFrame,
    sensitive_columns: List[str],
    prediction_column: str,
    target_column: Optional[str],
    positive_label: Any,
    score_column: Optional[str],
) -> Tuple[pd.DataFrame, Dict[str, Any]]:
    corrected = df.copy()

    if prediction_column == "corrected_prediction" and "corrected_prediction" in corrected.columns:
        if "corrected_probability" not in corrected.columns:
            corrected["corrected_probability"] = get_probability_series(
                corrected,
                "corrected_prediction",
                score_column,
                positive_label,
            )
        if "correction_note" not in corrected.columns:
            corrected["correction_note"] = "Re-audited existing corrected artifact"
        if "correction_method" not in corrected.columns:
            corrected["correction_method"] = "re_audit_existing_correction"
        return corrected, {
            "method": "re_audit_existing_correction",
            "notes": [
                "Uploaded file already contained corrected predictions, so the audit reused them directly.",
            ],
            "massaging": [],
            "thresholds": [],
            "fairness_target": 95.0,
        }

    base_probabilities = get_probability_series(corrected, prediction_column, score_column, positive_label)
    correction_summary: Dict[str, Any] = {
        "method": "advanced_iterative_hybrid",
        "notes": [
            "Correction uses threshold optimization, near-boundary relabeling, and iterative group parity repair.",
        ],
    }

    corrected["corrected_probability"] = base_probabilities
    corrected["corrected_prediction"] = (base_probabilities >= 0.5).astype(int)
    corrected["correction_note"] = "Baseline corrected prediction"

    massaging_actions = []
    for sensitive in sensitive_columns:
        corrected, massaging_meta = apply_massaging_correction(
            corrected,
            sensitive,
            "corrected_probability",
            target_column,
            positive_label,
        )
        massaging_actions.append(massaging_meta)

    thresholds_used = []
    for sensitive in sensitive_columns:
        corrected, threshold_meta = optimize_group_thresholds(
            corrected,
            sensitive,
            "corrected_probability",
            target_column,
            positive_label,
        )
        thresholds_used.append(threshold_meta)

    repair_rounds = []
    corrected = corrected.copy()
    for sensitive in sensitive_columns:
        corrected, repair_meta = iterative_fairness_repair(
            corrected,
            sensitive,
            "corrected_probability",
            target_column,
            positive_label,
        )
        repair_rounds.append(repair_meta)

    corrected["correction_method"] = correction_summary["method"]
    correction_summary["massaging"] = massaging_actions
    correction_summary["thresholds"] = thresholds_used
    correction_summary["repair_rounds"] = repair_rounds
    correction_summary["fairness_target"] = 95.0
    return corrected, correction_summary


def get_probability_series(
    df: pd.DataFrame,
    prediction_column: str,
    score_column: Optional[str],
    positive_label: Any,
) -> pd.Series:
    if score_column and score_column in df.columns and is_probability_like(df[score_column]):
        return pd.to_numeric(df[score_column], errors="coerce").fillna(0.0).clip(0.0, 1.0)
    if is_probability_like(df[prediction_column]):
        return pd.to_numeric(df[prediction_column], errors="coerce").fillna(0.0).clip(0.0, 1.0)
    return normalize_binary(df[prediction_column], positive_label).astype(float)


def apply_massaging_correction(
    df: pd.DataFrame,
    sensitive: str,
    probability_column: str,
    target_column: Optional[str],
    positive_label: Any,
) -> Tuple[pd.DataFrame, Dict[str, Any]]:
    working = df.copy()
    groups = working[sensitive].astype(str).value_counts().head(5).index.tolist()
    if len(groups) < 2:
        return working, {"sensitive_column": sensitive, "applied": False, "promoted": 0, "demoted": 0}

    baseline_group = groups[0]
    baseline_mask = working[sensitive].astype(str) == baseline_group
    baseline_rate = float(working.loc[baseline_mask, "corrected_prediction"].mean())
    promoted_total = 0
    demoted_total = 0

    for group in groups[1:]:
        group_mask = working[sensitive].astype(str) == group
        group_size = int(group_mask.sum())
        if group_size == 0:
            continue

        current_rate = float(working.loc[group_mask, "corrected_prediction"].mean())
        target_rate = min(0.98, baseline_rate)
        gap = max(0.0, target_rate - current_rate)
        flips_needed = int(round(gap * group_size))
        if flips_needed <= 0:
            continue

        promote_candidates = working.loc[
            group_mask & (working["corrected_prediction"] == 0),
            probability_column,
        ].sort_values(ascending=False)
        baseline_positive_rate = target_rate
        demote_candidates = working.loc[
            baseline_mask & (working["corrected_prediction"] == 1),
            probability_column,
        ].sort_values(ascending=True)

        promoted_idx = promote_candidates.head(flips_needed).index.tolist()
        demoted_idx = demote_candidates.head(min(len(promoted_idx), max(0, int(round((baseline_positive_rate - current_rate) * 0.35 * group_size))))).index.tolist()

        if promoted_idx:
            working.loc[promoted_idx, "corrected_prediction"] = 1
            working.loc[promoted_idx, "correction_note"] = f"Massaged toward parity for {sensitive}={group}"
            promoted_total += len(promoted_idx)
        if demoted_idx:
            working.loc[demoted_idx, "corrected_prediction"] = 0
            working.loc[demoted_idx, "correction_note"] = f"Massaged toward parity for {sensitive}={baseline_group}"
            demoted_total += len(demoted_idx)

    if target_column and target_column in working.columns:
        target_binary = normalize_binary(working[target_column], positive_label)
        low_confidence_mask = (working[probability_column].between(0.4, 0.6))
        correct_positive = low_confidence_mask & (target_binary == 1)
        working.loc[correct_positive, "corrected_prediction"] = 1

    return working, {
        "sensitive_column": sensitive,
        "applied": promoted_total > 0 or demoted_total > 0,
        "baseline_group": baseline_group,
        "promoted": promoted_total,
        "demoted": demoted_total,
    }


def optimize_group_thresholds(
    df: pd.DataFrame,
    sensitive: str,
    probability_column: str,
    target_column: Optional[str],
    positive_label: Any,
) -> Tuple[pd.DataFrame, Dict[str, Any]]:
    working = df.copy()
    groups = working[sensitive].astype(str).value_counts().head(5).index.tolist()
    if len(groups) < 2:
        return working, {"sensitive_column": sensitive, "applied": False}

    baseline_group = groups[0]
    baseline_mask = working[sensitive].astype(str) == baseline_group
    baseline_rate = float((working.loc[baseline_mask, probability_column] >= 0.5).mean())
    thresholds = [{"group": baseline_group, "threshold": 0.5}]
    target_rate = min(0.98, max(baseline_rate, 0.5))

    for group in groups[1:]:
        group_mask = working[sensitive].astype(str) == group
        if int(group_mask.sum()) == 0:
            continue
        best_threshold = 0.5
        best_loss = float("inf")
        group_probs = pd.to_numeric(working.loc[group_mask, probability_column], errors="coerce").fillna(0.0)
        group_target = normalize_binary(working.loc[group_mask, target_column], positive_label) if target_column else None

        for threshold in [0.6, 0.55, 0.5, 0.45, 0.4, 0.35, 0.3, 0.25, 0.2]:
            prediction = (group_probs >= threshold).astype(int)
            selection_rate = float(prediction.mean())
            fairness_gap = abs(selection_rate - target_rate)
            di_gap = abs(1.0 - safe_divide(selection_rate, baseline_rate if baseline_rate > 0 else 1.0))
            accuracy_penalty = 1 - float((prediction == group_target).mean()) if group_target is not None and len(group_target) > 0 else 0.0
            loss = fairness_gap + (di_gap * 0.25) + (accuracy_penalty * 0.3)
            if loss < best_loss:
                best_loss = loss
                best_threshold = threshold

        working.loc[group_mask, "corrected_prediction"] = (group_probs >= best_threshold).astype(int)
        working.loc[group_mask, "correction_note"] = f"Threshold tuned for {sensitive}={group}"
        thresholds.append({"group": group, "threshold": best_threshold})

    return working, {
        "sensitive_column": sensitive,
        "applied": True,
        "baseline_group": baseline_group,
        "thresholds": thresholds,
    }


def iterative_fairness_repair(
    df: pd.DataFrame,
    sensitive: str,
    probability_column: str,
    target_column: Optional[str],
    positive_label: Any,
    max_rounds: int = 3,
) -> Tuple[pd.DataFrame, Dict[str, Any]]:
    working = df.copy()
    groups = working[sensitive].astype(str).value_counts().head(5).index.tolist()
    if len(groups) < 2:
        return working, {"sensitive_column": sensitive, "applied": False, "rounds": 0, "flips": 0}

    target_binary = (
        normalize_binary(working[target_column], positive_label)
        if target_column and target_column in working.columns
        else None
    )
    total_flips = 0
    completed_rounds = 0

    for _ in range(max_rounds):
        rates = {
            group: float(working.loc[working[sensitive].astype(str) == group, "corrected_prediction"].mean())
            for group in groups
        }
        rate_values = list(rates.values())
        if not rate_values:
            break

        target_rate = float(np.clip(np.mean(rate_values), 0.35, 0.9))
        changed = False

        for group in groups:
            group_mask = working[sensitive].astype(str) == group
            group_size = int(group_mask.sum())
            if group_size == 0:
                continue

            current_rate = rates[group]
            rate_gap = target_rate - current_rate
            flips_needed = int(round(abs(rate_gap) * group_size))
            if flips_needed <= 0:
                continue

            if rate_gap > 0:
                candidates = working.loc[group_mask & (working["corrected_prediction"] == 0)].copy()
                if target_binary is not None:
                    candidates["_priority"] = (target_binary.loc[candidates.index] == 1).astype(int)
                    candidates = candidates.sort_values(["_priority", probability_column], ascending=[False, False])
                else:
                    candidates = candidates.sort_values(probability_column, ascending=False)
                chosen = candidates.head(flips_needed).index.tolist()
                if chosen:
                    working.loc[chosen, "corrected_prediction"] = 1
                    working.loc[chosen, "correction_note"] = f"Iterative fairness repair for {sensitive}={group}"
                    total_flips += len(chosen)
                    changed = True
            else:
                candidates = working.loc[group_mask & (working["corrected_prediction"] == 1)].copy()
                if target_binary is not None:
                    candidates["_priority"] = (target_binary.loc[candidates.index] == 0).astype(int)
                    candidates = candidates.sort_values(["_priority", probability_column], ascending=[False, True])
                else:
                    candidates = candidates.sort_values(probability_column, ascending=True)
                chosen = candidates.head(flips_needed).index.tolist()
                if chosen:
                    working.loc[chosen, "corrected_prediction"] = 0
                    working.loc[chosen, "correction_note"] = f"Iterative fairness repair for {sensitive}={group}"
                    total_flips += len(chosen)
                    changed = True

        completed_rounds += 1
        if not changed:
            break

    return working, {
        "sensitive_column": sensitive,
        "applied": total_flips > 0,
        "rounds": completed_rounds,
        "flips": total_flips,
    }


def build_explainability(df: pd.DataFrame, prediction_column: str, target_column: Optional[str], sensitive_columns: List[str]) -> Dict[str, Any]:
    top_features = []
    sampled = sample_frame(df, MAX_PROXY_SCAN_ROWS, target_column)
    for column in sampled.columns:
        if column in set(sensitive_columns + [prediction_column] + ([target_column] if target_column else [])):
            continue
        if sampled[column].nunique(dropna=True) < 2:
            continue
        score = 0.0
        reason = "proxy association"
        for sensitive in sensitive_columns:
            score = max(score, estimate_proxy_signal(sampled[column], sampled[sensitive]))
        top_features.append({"feature": column, "score": round(float(score), 3), "reason": reason})
    top_features = sorted(top_features, key=lambda item: item["score"], reverse=True)[:5]
    shap_style_summary = [
        {
            "feature": item["feature"],
            "impact": item["score"],
            "direction": "shifts",
            "summary": f"Feature '{item['feature']}' shows strong proxy-style influence in the local audit model.",
        }
        for item in top_features
    ]
    lime_style_example = [
        {
            "feature": item["feature"],
            "impact": item["score"],
            "direction": "shifts",
            "summary": f"Local explanation preview flagged '{item['feature']}' as a major contributor.",
        }
        for item in top_features[:3]
    ]
    return {
        "status": "surrogate",
        "methods_available": ["rule_based_proxy_scan", "surrogate_feature_ranking", "group_threshold_optimization", "massaging_correction"],
        "methods_unavailable": ["SHAP", "LIME"],
        "top_features": top_features,
        "shap_style_summary": shap_style_summary,
        "lime_style_example": lime_style_example,
        "note": "This environment exposes surrogate explainability with local hybrid mitigation. True SHAP/LIME pipelines are not installed in the local stack.",
    }


def build_analysis_log(
    source_name: str,
    requested_domain: str,
    resolved_domain: str,
    target_column: Optional[str],
    prediction_column: str,
    sensitive_columns: List[str],
    used_surrogate_model: bool,
    fairness_score: float,
    corrected_score: float,
    large_dataset_mode: bool,
    training_rows_used: int,
    correction_summary: Dict[str, Any],
    spark_acceleration_active: bool,
    reweighing_applied: bool,
    intersectional_count: int,
) -> List[Dict[str, Any]]:
    start = datetime.utcnow()
    rows = [
        ("Dataset intake", "completed", f"Loaded {source_name} and normalized headers."),
        ("Domain resolution", "completed", f"Requested domain '{requested_domain}' resolved to '{resolved_domain}'."),
        ("Column detection", "completed", f"Target={target_column or 'none'}, prediction={prediction_column}, sensitive={', '.join(sensitive_columns)}."),
        (
            "Scale orchestration",
            "completed",
            f"{'Large' if large_dataset_mode else 'Standard'} dataset mode active with "
            f"{'Spark-assisted ' if spark_acceleration_active else ''}sampled training capped at {training_rows_used} rows.",
        ),
        (
            "Prediction stage",
            "completed",
            "Generated XGBoost surrogate predictions." if used_surrogate_model else "Used supplied prediction column.",
        ),
        (
            "Training debiasing",
            "completed",
            "Applied intersectional reweighing during XGBoost training." if reweighing_applied else "Skipped training-time reweighing.",
        ),
        (
            "Intersectional audit",
            "completed",
            f"Evaluated {intersectional_count} intersectional fairness slices." if intersectional_count else "No intersectional slices were available for audit.",
        ),
        ("Fairness evaluation", "completed", f"Computed fairness score {fairness_score:.2f}."),
        ("Root-cause scan", "completed", "Evaluated representation imbalance and proxy-feature risk."),
        ("Correction engine", "completed", f"Applied {correction_summary['method']} and produced corrected fairness estimate {corrected_score:.2f}."),
        ("Artifact synthesis", "completed", "Prepared corrected CSV and report payload."),
    ]
    logs = []
    for index, (stage, status, message) in enumerate(rows):
        logs.append({
            "timestamp": (start + timedelta(seconds=index)).isoformat() + "Z",
            "stage": stage.lower().replace(" ", "_"),
            "title": stage,
            "detail": message,
            "status": "complete" if status == "completed" else status,
        })
    return logs


def compute_overall_accuracy(df: pd.DataFrame, target_column: Optional[str], prediction_column: str, positive_label: Any) -> float:
    if not target_column or target_column not in df.columns:
        return 0.0
    target = normalize_binary(df[target_column], positive_label)
    if is_probability_like(df[prediction_column]):
        prediction = (pd.to_numeric(df[prediction_column], errors="coerce").fillna(0) >= 0.5).astype(int)
    else:
        prediction = normalize_binary(df[prediction_column], positive_label)
    return float((target == prediction).mean())


def build_report_markdown(
    source_name: str,
    resolved_domain: str,
    fairness_summary: Dict[str, Any],
    findings: List[Dict[str, Any]],
    intersectional_findings: List[Dict[str, Any]],
    corrected_findings: List[Dict[str, Any]],
    corrected_intersectional_findings: List[Dict[str, Any]],
    root_causes: List[Dict[str, Any]],
    recommendations: List[Dict[str, Any]],
    analysis_log: List[Dict[str, Any]],
    explainability: Dict[str, Any],
    correction_summary: Dict[str, Any],
    reweighing_summary: Dict[str, Any],
) -> str:
    lines = [
        "# FairAI Audit Report",
        "",
        f"Dataset: {source_name}",
        f"Domain: {resolved_domain}",
        f"Overall fairness score: {fairness_summary['overall_fairness_score']}",
        f"Corrected fairness score: {fairness_summary['corrected_fairness_score']}",
        f"Fairness target: {fairness_summary['fairness_target']}",
        f"Target met: {fairness_summary['fairness_target_met']}",
        f"Risk level: {fairness_summary['risk_level']}",
        f"Intersectional fairness score: {fairness_summary.get('intersectional_fairness_score')}",
        f"Intersectional corrected fairness score: {fairness_summary.get('intersectional_corrected_fairness_score')}",
        "Surrogate model: xgboost",
        f"Training reweighing applied: {reweighing_summary.get('applied', False)}",
        f"Correction method: {correction_summary['method']}",
        "",
        "## Sensitive Findings",
    ]
    for finding in findings:
        lines.append(
            f"- {finding['sensitive_column']}: fairness {finding['fairness_score']}, DI {finding['disparate_impact']}, DP gap {finding['demographic_parity_difference']}"
        )
    lines.extend(["", "## Corrected Findings"])
    for finding in corrected_findings:
        lines.append(
            f"- {finding['sensitive_column']}: fairness {finding['fairness_score']}, DI {finding['disparate_impact']}, DP gap {finding['demographic_parity_difference']}"
        )
    lines.extend(["", "## Intersectional Findings"])
    for finding in intersectional_findings:
        lines.append(
            f"- {finding['sensitive_column']}: fairness {finding['fairness_score']}, DI {finding['disparate_impact']}, DP gap {finding['demographic_parity_difference']}"
        )
    lines.extend(["", "## Corrected Intersectional Findings"])
    for finding in corrected_intersectional_findings:
        lines.append(
            f"- {finding['sensitive_column']}: fairness {finding['fairness_score']}, DI {finding['disparate_impact']}, DP gap {finding['demographic_parity_difference']}"
        )
    lines.extend(["", "## Root Causes"])
    for cause in root_causes:
        lines.append(f"- {cause['type']}: {cause['details']}")
    lines.extend(["", "## Recommendations"])
    for rec in recommendations:
        lines.append(f"- {rec['title']}: {rec['description']}")
    lines.extend(["", "## Explainability"])
    for feature in explainability["top_features"]:
        lines.append(f"- {feature['feature']}: {feature['reason']} ({feature['score']})")
    lines.extend(["", "## Analysis Log"])
    for entry in analysis_log:
        lines.append(f"- {entry['title']}: {entry['detail']}")
    return "\n".join(lines)


def safe_divide(numerator: float, denominator: float) -> float:
    return float(numerator / denominator) if denominator else 0.0


def score_to_risk(score: float) -> str:
    if score >= 85:
        return "low"
    if score >= 65:
        return "medium"
    return "high"
