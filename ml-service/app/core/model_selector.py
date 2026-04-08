from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import ExtraTreesClassifier, HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.feature_selection import VarianceThreshold
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    f1_score,
    log_loss,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import StratifiedKFold, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

try:
    from xgboost import XGBClassifier
    XGBOOST_AVAILABLE = True
    XGBOOST_IMPORT_ERROR = None
except Exception as exc:  # pragma: no cover
    XGBOOST_AVAILABLE = False
    XGBOOST_IMPORT_ERROR = str(exc)
    XGBClassifier = None  # type: ignore

try:
    from catboost import CatBoostClassifier
    CATBOOST_AVAILABLE = True
    CATBOOST_IMPORT_ERROR = None
except Exception as exc:  # pragma: no cover
    CATBOOST_AVAILABLE = False
    CATBOOST_IMPORT_ERROR = str(exc)
    CatBoostClassifier = None  # type: ignore

try:
    from lightgbm import LGBMClassifier
    LIGHTGBM_AVAILABLE = True
    LIGHTGBM_IMPORT_ERROR = None
except Exception as exc:  # pragma: no cover
    LIGHTGBM_AVAILABLE = False
    LIGHTGBM_IMPORT_ERROR = str(exc)
    LGBMClassifier = None  # type: ignore

try:
    import optuna
    OPTUNA_AVAILABLE = True
except Exception:  # pragma: no cover
    OPTUNA_AVAILABLE = False
    optuna = None  # type: ignore

from app.utils.column_inference import normalize_binary

RANDOM_SEED = 42
MIN_VALIDATION_ROWS = 40
MAX_SEARCH_ROWS = 12000


@dataclass
class CandidateSpec:
    name: str
    family: str
    estimator: Any
    notes: str


@dataclass
class ModelArtifacts:
    name: str
    family: str
    pipeline: Any
    probability_model: Any
    metrics: Dict[str, float]
    cv_metrics: Dict[str, float]
    threshold: float
    train_columns: List[str]
    categorical_columns: List[str]
    numeric_columns: List[str]
    notes: str


class WeightedEnsembleModel:
    def __init__(self, members: Sequence[Any], weights: Sequence[float]):
        self.members = list(members)
        self.weights = np.asarray(weights, dtype=float)
        weight_sum = float(self.weights.sum()) or 1.0
        self.weights = self.weights / weight_sum

    def predict_proba(self, X: pd.DataFrame) -> np.ndarray:
        probs = []
        for member in self.members:
            member_proba = member.predict_proba(X)
            if member_proba.ndim == 1:
                member_proba = np.column_stack([1.0 - member_proba, member_proba])
            probs.append(member_proba[:, 1])
        blended = np.average(np.vstack(probs), axis=0, weights=self.weights)
        blended = np.clip(blended, 1e-6, 1 - 1e-6)
        return np.column_stack([1.0 - blended, blended])


def _build_preprocessor(X: pd.DataFrame) -> Tuple[ColumnTransformer, List[str], List[str]]:
    categorical = [c for c in X.columns if not pd.api.types.is_numeric_dtype(X[c])]
    numeric = [c for c in X.columns if c not in categorical]
    pre = ColumnTransformer(
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
                        ("onehot", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
                    ]
                ),
                categorical,
            ),
        ],
        remainder="drop",
        sparse_threshold=0.0,
    )
    return pre, categorical, numeric


def _feature_screening(X: pd.DataFrame) -> Tuple[pd.DataFrame, Dict[str, Any]]:
    working = X.copy()
    dropped: Dict[str, List[str]] = {"all_missing": [], "constant": [], "identifier_like": []}

    for col in list(working.columns):
        series = working[col]
        if series.notna().sum() == 0:
            dropped["all_missing"].append(col)
            working = working.drop(columns=[col])
            continue
        unique_ratio = float(series.nunique(dropna=True)) / max(len(series), 1)
        lowered = col.lower()
        if unique_ratio > 0.98 and any(token in lowered for token in ["id", "uuid", "email", "phone"]):
            dropped["identifier_like"].append(col)
            working = working.drop(columns=[col])
            continue
        if series.nunique(dropna=True) <= 1:
            dropped["constant"].append(col)
            working = working.drop(columns=[col])

    if working.empty:
        raise ValueError("All candidate feature columns were filtered out during feature screening.")

    return working, {
        "input_feature_count": int(X.shape[1]),
        "retained_feature_count": int(working.shape[1]),
        "dropped_columns": dropped,
    }


def _candidate_models(class_weight_scale: float, n_rows: int) -> List[CandidateSpec]:
    specs: List[CandidateSpec] = [
        CandidateSpec(
            name="logistic_elasticnet",
            family="linear",
            estimator=LogisticRegression(
                max_iter=1200,
                class_weight="balanced",
                solver="saga",
                penalty="elasticnet",
                l1_ratio=0.2,
                C=0.8,
                random_state=RANDOM_SEED,
            ),
            notes="Linear baseline with elastic-net regularization and balanced classes.",
        ),
        CandidateSpec(
            name="hist_gradient_boosting",
            family="boosting",
            estimator=HistGradientBoostingClassifier(
                learning_rate=0.05,
                max_depth=8,
                max_iter=250,
                min_samples_leaf=20,
                random_state=RANDOM_SEED,
            ),
            notes="Fast histogram gradient boosting with strong nonlinear capacity.",
        ),
    ]

    external_boosters: List[CandidateSpec] = []
    if XGBOOST_AVAILABLE and XGBClassifier is not None:
        external_boosters.append(
            CandidateSpec(
                name="xgboost_tabular",
                family="boosting",
                estimator=XGBClassifier(
                    n_estimators=180 if n_rows >= 5000 else 240,
                    max_depth=5,
                    learning_rate=0.05,
                    subsample=0.85,
                    colsample_bytree=0.85,
                    reg_lambda=1.2,
                    min_child_weight=2,
                    objective="binary:logistic",
                    eval_metric="logloss",
                    scale_pos_weight=max(1.0, class_weight_scale),
                    random_state=RANDOM_SEED,
                    n_jobs=4,
                ),
                notes="XGBoost gradient boosting candidate tuned for imbalanced binary tabular data.",
            )
        )

    if LIGHTGBM_AVAILABLE and LGBMClassifier is not None:
        external_boosters.append(
            CandidateSpec(
                name="lightgbm_tabular",
                family="boosting",
                estimator=LGBMClassifier(
                    n_estimators=180 if n_rows >= 5000 else 240,
                    learning_rate=0.05,
                    num_leaves=31,
                    subsample=0.85,
                    colsample_bytree=0.85,
                    reg_lambda=1.0,
                    class_weight="balanced",
                    random_state=RANDOM_SEED,
                    verbosity=-1,
                ),
                notes="LightGBM candidate for efficient gradient-boosted decision trees.",
            )
        )

    if CATBOOST_AVAILABLE and CatBoostClassifier is not None and n_rows <= 15000:
        external_boosters.append(
            CandidateSpec(
                name="catboost_tabular",
                family="boosting",
                estimator=CatBoostClassifier(
                    iterations=160 if n_rows >= 5000 else 220,
                    depth=6,
                    learning_rate=0.05,
                    loss_function="Logloss",
                    eval_metric="AUC",
                    verbose=False,
                    random_seed=RANDOM_SEED,
                ),
                notes="CatBoost candidate for robust handling of high-cardinality categorical structure after encoding.",
            )
        )

    specs.extend(external_boosters[:2])

    if not external_boosters:
        specs.extend(
            [
                CandidateSpec(
                    name="random_forest_balanced",
                    family="bagging",
                    estimator=RandomForestClassifier(
                        n_estimators=180 if n_rows >= 5000 else 260,
                        max_depth=10,
                        min_samples_leaf=4,
                        class_weight="balanced_subsample",
                        random_state=RANDOM_SEED,
                        n_jobs=-1,
                    ),
                    notes="Bagged tree model with balanced subsampling for robust tabular baselines.",
                ),
                CandidateSpec(
                    name="extra_trees_balanced",
                    family="bagging",
                    estimator=ExtraTreesClassifier(
                        n_estimators=180 if n_rows >= 5000 else 260,
                        max_depth=None,
                        min_samples_leaf=2,
                        class_weight="balanced",
                        random_state=RANDOM_SEED,
                        n_jobs=-1,
                    ),
                    notes="High-variance tree ensemble that often performs well on mixed tabular data.",
                ),
            ]
        )

    return specs


def _safe_predict_proba(model: Any, X: pd.DataFrame) -> np.ndarray:
    if hasattr(model, "predict_proba"):
        proba = model.predict_proba(X)
        if np.ndim(proba) == 1:
            proba = np.column_stack([1.0 - np.asarray(proba), np.asarray(proba)])
        return np.asarray(proba, dtype=float)
    if hasattr(model, "decision_function"):
        decision = np.asarray(model.decision_function(X), dtype=float)
        probs = 1.0 / (1.0 + np.exp(-decision))
        return np.column_stack([1.0 - probs, probs])
    pred = np.asarray(model.predict(X), dtype=float)
    return np.column_stack([1.0 - pred, pred])


def _evaluate(y_true: np.ndarray, proba: np.ndarray, threshold: float = 0.5) -> Dict[str, float]:
    proba = np.clip(np.asarray(proba, dtype=float), 1e-6, 1 - 1e-6)
    pred = (proba >= threshold).astype(int)
    out = {
        "f1": float(f1_score(y_true, pred, zero_division=0)),
        "precision": float(precision_score(y_true, pred, zero_division=0)),
        "recall": float(recall_score(y_true, pred, zero_division=0)),
        "positive_rate": float(pred.mean()) if len(pred) else 0.0,
    }
    if len(np.unique(y_true)) > 1:
        out["roc_auc"] = float(roc_auc_score(y_true, proba))
        out["pr_auc"] = float(average_precision_score(y_true, proba))
        out["log_loss"] = float(log_loss(y_true, proba))
        out["brier"] = float(brier_score_loss(y_true, proba))
    else:
        out.update({"roc_auc": 0.5, "pr_auc": 0.5, "log_loss": 1.0, "brier": 1.0})
    return out


def _ranking_score(metrics: Dict[str, float]) -> float:
    return float(
        metrics.get("roc_auc", 0.0) * 0.42
        + metrics.get("pr_auc", 0.0) * 0.23
        + metrics.get("f1", 0.0) * 0.22
        + metrics.get("precision", 0.0) * 0.08
        - metrics.get("log_loss", 1.0) * 0.04
        - metrics.get("brier", 1.0) * 0.01
    )


def _choose_threshold(y_true: np.ndarray, proba: np.ndarray) -> float:
    best_t, best_score = 0.5, -1e9
    for threshold in np.linspace(0.2, 0.8, 25):
        metrics = _evaluate(y_true, proba, float(threshold))
        score = (
            metrics["f1"] * 0.55
            + metrics["recall"] * 0.20
            + metrics["precision"] * 0.15
            + metrics["roc_auc"] * 0.10
        )
        if score > best_score:
            best_score = score
            best_t = float(threshold)
    return best_t


def _sample_weights_for_reweighing(y: pd.Series, sensitive_frame: pd.DataFrame) -> np.ndarray:
    if sensitive_frame.empty:
        return np.ones(len(y), dtype=float)
    sens = sensitive_frame.astype(str).agg("|".join, axis=1)
    overall_y = y.value_counts(normalize=True).to_dict()
    overall_s = sens.value_counts(normalize=True).to_dict()
    joint = pd.crosstab(sens, y, normalize=True)
    weights = np.ones(len(y), dtype=float)
    for i, (group, label) in enumerate(zip(sens, y)):
        joint_prob = float(joint.loc[group, label]) if group in joint.index and label in joint.columns else 0.0
        desired = overall_s.get(group, 0.0) * overall_y.get(label, 0.0)
        if joint_prob > 0:
            weights[i] = np.clip(desired / joint_prob, 0.2, 5.0)
    return weights


def _build_pipeline(preprocessor: ColumnTransformer, estimator: Any) -> Pipeline:
    return Pipeline(
        [
            ("preprocess", clone(preprocessor)),
            ("variance", VarianceThreshold(threshold=0.0)),
            ("model", clone(estimator)),
        ]
    )


def _fit_pipeline(pipeline: Pipeline, X: pd.DataFrame, y: pd.Series, sample_weight: Optional[np.ndarray]) -> Pipeline:
    fit_kwargs: Dict[str, Any] = {}
    if sample_weight is not None:
        fit_kwargs["model__sample_weight"] = sample_weight
    pipeline.fit(X, y, **fit_kwargs)
    return pipeline


def _cross_validated_metrics(
    spec: CandidateSpec,
    preprocessor: ColumnTransformer,
    X: pd.DataFrame,
    y: pd.Series,
    sample_weights: np.ndarray,
) -> Dict[str, float]:
    if len(X) > MAX_SEARCH_ROWS:
        temp = X.copy()
        temp["__label__"] = y.to_numpy()
        temp["__position__"] = np.arange(len(temp))
        sampled = (
            temp.groupby("__label__", group_keys=False)
            .apply(lambda frame: frame.sample(min(len(frame), MAX_SEARCH_ROWS // max(y.nunique(), 1)), random_state=RANDOM_SEED))
        )
        positions = sampled["__position__"].astype(int).to_numpy()
        X = X.iloc[positions]
        y = y.iloc[positions]
        sample_weights = sample_weights[positions]
    n_splits = 2 if len(X) >= 3000 else 3
    splitter = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=RANDOM_SEED)
    fold_metrics: List[Dict[str, float]] = []

    for train_idx, valid_idx in splitter.split(X, y):
        X_train = X.iloc[train_idx]
        X_valid = X.iloc[valid_idx]
        y_train = y.iloc[train_idx]
        y_valid = y.iloc[valid_idx]
        weights_train = sample_weights[train_idx] if sample_weights is not None else None

        pipeline = _build_pipeline(preprocessor, spec.estimator)
        pipeline = _fit_pipeline(pipeline, X_train, y_train, weights_train)
        valid_proba = _safe_predict_proba(pipeline, X_valid)[:, 1]
        threshold = _choose_threshold(y_valid.to_numpy(), valid_proba)
        fold_metrics.append(_evaluate(y_valid.to_numpy(), valid_proba, threshold))

    summary: Dict[str, float] = {}
    for key in fold_metrics[0].keys():
        summary[key] = round(float(np.mean([fold[key] for fold in fold_metrics])), 6)
    summary["ranking_score"] = round(_ranking_score(summary), 6)
    return summary


def _fit_candidate(
    spec: CandidateSpec,
    preprocessor: ColumnTransformer,
    X_train: pd.DataFrame,
    y_train: pd.Series,
    X_val: pd.DataFrame,
    y_val: pd.Series,
    X_test: pd.DataFrame,
    y_test: pd.Series,
    sample_weights_train: np.ndarray,
    feature_columns: List[str],
    categorical_columns: List[str],
    numeric_columns: List[str],
    cv_metrics: Dict[str, float],
) -> ModelArtifacts:
    pipeline = _build_pipeline(preprocessor, spec.estimator)
    pipeline = _fit_pipeline(pipeline, X_train, y_train, sample_weights_train)

    val_proba = _safe_predict_proba(pipeline, X_val)[:, 1]
    threshold = _choose_threshold(y_val.to_numpy(), val_proba)
    test_proba = _safe_predict_proba(pipeline, X_test)[:, 1]
    test_metrics = _evaluate(y_test.to_numpy(), test_proba, threshold)
    test_metrics["ranking_score"] = round(_ranking_score(test_metrics), 6)

    return ModelArtifacts(
        name=spec.name,
        family=spec.family,
        pipeline=pipeline,
        probability_model=pipeline,
        metrics={k: round(float(v), 6) for k, v in test_metrics.items()},
        cv_metrics=cv_metrics,
        threshold=threshold,
        train_columns=feature_columns,
        categorical_columns=categorical_columns,
        numeric_columns=numeric_columns,
        notes=spec.notes,
    )


def _blend_top_models(
    models: Sequence[ModelArtifacts],
    X_test: pd.DataFrame,
    y_test: pd.Series,
) -> Optional[Dict[str, Any]]:
    if len(models) < 2:
        return None

    top_models = list(models[: min(3, len(models))])
    weights = np.asarray([max(model.metrics.get("ranking_score", 0.0), 1e-6) for model in top_models], dtype=float)
    ensemble = WeightedEnsembleModel([model.probability_model for model in top_models], weights)
    ensemble_proba = ensemble.predict_proba(X_test)[:, 1]

    thresholds = np.asarray([model.threshold for model in top_models], dtype=float)
    threshold = float(np.average(thresholds, weights=weights))
    metrics = _evaluate(y_test.to_numpy(), ensemble_proba, threshold)
    metrics["ranking_score"] = round(_ranking_score(metrics), 6)

    return {
        "name": "weighted_ensemble",
        "members": [model.name for model in top_models],
        "weights": [round(float(weight), 6) for weight in (weights / weights.sum())],
        "threshold": threshold,
        "metrics": {k: round(float(v), 6) for k, v in metrics.items()},
    }


def train_and_select_model(
    df: pd.DataFrame,
    target_column: str,
    sensitive_columns: List[str],
    positive_label: Any = 1,
) -> Dict[str, Any]:
    y = normalize_binary(df[target_column], positive_label)
    feature_df = df.drop(columns=[target_column], errors="ignore").copy()
    protected = set(sensitive_columns) | {"corrected_prediction", "corrected_probability"}
    X_raw = feature_df[[c for c in feature_df.columns if c not in protected]].copy()
    if X_raw.empty:
        raise ValueError("No usable feature columns available after excluding target, sensitive, and internal columns.")

    X, screening_summary = _feature_screening(X_raw)

    if y.nunique() < 2:
        raise ValueError("Target column is not binary after normalization.")

    X_train_val, X_test, y_train_val, y_test = train_test_split(
        X,
        y,
        test_size=0.20,
        stratify=y,
        random_state=RANDOM_SEED,
    )
    validation_size = max(MIN_VALIDATION_ROWS, int(round(len(X_train_val) * 0.18)))
    validation_ratio = min(0.30, max(validation_size / max(len(X_train_val), 1), 0.12))
    X_train, X_val, y_train, y_val = train_test_split(
        X_train_val,
        y_train_val,
        test_size=validation_ratio,
        stratify=y_train_val,
        random_state=RANDOM_SEED,
    )

    preprocessor, categorical_columns, numeric_columns = _build_preprocessor(X)
    pos_rate = float(y_train.mean())
    class_weight_scale = (1.0 - pos_rate) / max(pos_rate, 1e-6)
    sensitive_train = df.loc[X_train.index, [c for c in sensitive_columns if c in df.columns]].copy()
    sample_weights_train = _sample_weights_for_reweighing(y_train.reset_index(drop=True), sensitive_train.reset_index(drop=True))

    candidate_specs = _candidate_models(class_weight_scale)
    if not candidate_specs:
        raise RuntimeError("No trainable model candidates are available in the current environment.")

    results: List[ModelArtifacts] = []
    skipped_models: List[Dict[str, str]] = []
    for spec in candidate_specs:
        try:
            cv_metrics = _cross_validated_metrics(spec, preprocessor, X_train, y_train, sample_weights_train)
            fitted = _fit_candidate(
                spec=spec,
                preprocessor=preprocessor,
                X_train=X_train,
                y_train=y_train,
                X_val=X_val,
                y_val=y_val,
                X_test=X_test,
                y_test=y_test,
                sample_weights_train=sample_weights_train,
                feature_columns=list(X.columns),
                categorical_columns=categorical_columns,
                numeric_columns=numeric_columns,
                cv_metrics=cv_metrics,
            )
            results.append(fitted)
        except Exception as exc:
            skipped_models.append({"name": spec.name, "reason": str(exc)})

    if not results:
        raise RuntimeError(f"All candidate models failed to train. Skipped: {skipped_models}")

    ranked = sorted(
        results,
        key=lambda item: (
            item.metrics.get("ranking_score", 0.0),
            item.cv_metrics.get("ranking_score", 0.0),
            item.metrics.get("roc_auc", 0.0),
            item.metrics.get("f1", 0.0),
        ),
        reverse=True,
    )
    best = ranked[0]

    ensemble_result = _blend_top_models(
        ranked,
        X_test=X_test,
        y_test=y_test,
    )

    final_model_name = best.name
    final_threshold = best.threshold
    final_probabilities = _safe_predict_proba(best.probability_model, X)[:, 1]
    ensemble_summary = None

    if ensemble_result and ensemble_result["metrics"]["ranking_score"] > best.metrics["ranking_score"] + 0.01:
        final_model_name = ensemble_result["name"]
        final_threshold = ensemble_result["threshold"]
        final_probabilities = WeightedEnsembleModel(
            [model.probability_model for model in ranked[: min(3, len(ranked))]],
            ensemble_result["weights"],
        ).predict_proba(X)[:, 1]
        ensemble_summary = {
            "selected": True,
            "members": ensemble_result["members"],
            "weights": ensemble_result["weights"],
            "test_metrics": ensemble_result["metrics"],
            "explainability_anchor_model": best.name,
        }
    else:
        ensemble_summary = {
            "selected": False,
            "members": ensemble_result["members"] if ensemble_result else [],
            "weights": ensemble_result["weights"] if ensemble_result else [],
            "test_metrics": ensemble_result["metrics"] if ensemble_result else {},
            "explainability_anchor_model": best.name,
        }

    final_predictions = (final_probabilities >= final_threshold).astype(int)

    return {
        "selected_model": final_model_name,
        "predictions": final_predictions.tolist(),
        "probabilities": final_probabilities.tolist(),
        "threshold": round(float(final_threshold), 6),
        "evaluation": {
            "selected_model": final_model_name,
            "selected_anchor_model": best.name,
            "selected_metrics": best.metrics,
            "selected_cv_metrics": best.cv_metrics,
            "candidate_count": len(results),
            "candidates": [
                {
                    "name": model.name,
                    "family": model.family,
                    "notes": model.notes,
                    "test_metrics": model.metrics,
                    "cv_metrics": model.cv_metrics,
                    "threshold": round(float(model.threshold), 6),
                }
                for model in ranked
            ],
            "skipped_models": skipped_models,
            "ensemble": ensemble_summary,
            "feature_screening": screening_summary,
            "train_rows": int(len(X_train)),
            "validation_rows": int(len(X_val)),
            "test_rows": int(len(X_test)),
        },
        "model_artifact": best.probability_model,
        "raw_pipeline": best.pipeline,
        "feature_columns": best.train_columns,
        "categorical_columns": best.categorical_columns,
        "numeric_columns": best.numeric_columns,
        "reweighing_summary": {
            "applied": True,
            "strategy": "sample_weight_reweighing",
            "provider": "custom_fast_path",
            "sensitive_columns": sensitive_columns,
            "sample_weight_min": round(float(sample_weights_train.min()), 4),
            "sample_weight_max": round(float(sample_weights_train.max()), 4),
            "sample_weight_mean": round(float(sample_weights_train.mean()), 4),
        },
    }
