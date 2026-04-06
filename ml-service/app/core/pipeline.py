"""Production-grade ML pipeline with proper splitting, tuning, calibration, and evaluation.

Design decisions:
- Stratified 70/15/15 split to prevent data leakage
- RandomizedSearchCV for hyperparameter tuning (fit on train, score on val)
- Isotonic calibration on validation set (more flexible than Platt scaling)
- scale_pos_weight for class imbalance (safer than SMOTE for fairness — SMOTE
  creates synthetic rows that can leak sensitive attribute patterns)
- Full evaluation suite on held-out test set
"""
from __future__ import annotations

import os
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import RandomizedSearchCV, StratifiedKFold, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

from app.core import (
    MAX_CATEGORY_LEVELS,
    MAX_TRAIN_ROWS,
    PREDICTION_BATCH_ROWS,
    RANDOM_SEED,
    TEST_RATIO,
    TRAIN_RATIO,
    VAL_RATIO,
    apply_category_compactors,
    fit_category_compactors,
    normalize_binary,
    sample_frame,
)

try:
    from xgboost import XGBClassifier
    XGBOOST_AVAILABLE = True
    XGBOOST_IMPORT_ERROR = ""
except Exception as exc:
    XGBClassifier = None  # type: ignore[assignment]
    XGBOOST_AVAILABLE = False
    XGBOOST_IMPORT_ERROR = str(exc)


# ---------------------------------------------------------------------------
# Hyperparameter search space for XGBoost
# ---------------------------------------------------------------------------
XGBOOST_PARAM_DISTRIBUTIONS = {
    "model__n_estimators": [100, 200, 300, 400, 500],
    "model__max_depth": [3, 4, 5, 6, 7, 8],
    "model__learning_rate": [0.01, 0.03, 0.05, 0.08, 0.1, 0.15],
    "model__subsample": [0.7, 0.8, 0.9, 1.0],
    "model__colsample_bytree": [0.6, 0.7, 0.8, 0.9, 1.0],
    "model__reg_lambda": [0.1, 0.5, 1.0, 2.0, 5.0],
    "model__reg_alpha": [0.0, 0.1, 0.5, 1.0],
    "model__min_child_weight": [1, 3, 5, 7],
}


def compute_scale_pos_weight(y: pd.Series) -> float:
    """Compute class weight ratio for imbalanced binary classification.

    Unlike the original (which floored at 1.0), this returns the true ratio
    so both majority-positive and majority-negative datasets are handled.
    """
    positives = int((y == 1).sum())
    negatives = int((y == 0).sum())
    if positives <= 0 or negatives <= 0:
        return 1.0
    return negatives / positives


def build_preprocessor(X: pd.DataFrame) -> Tuple[ColumnTransformer, List[str], List[str]]:
    """Build a ColumnTransformer that handles numeric and categorical features.

    Returns (preprocessor, numeric_cols, categorical_cols).
    """
    numeric_cols = X.select_dtypes(include=[np.number]).columns.tolist()
    categorical_cols = [col for col in X.columns if col not in numeric_cols]

    preprocessor = ColumnTransformer(
        transformers=[
            (
                "num",
                Pipeline([("imputer", SimpleImputer(strategy="median"))]),
                numeric_cols,
            ),
            (
                "cat",
                Pipeline([
                    ("imputer", SimpleImputer(strategy="most_frequent")),
                    ("onehot", OneHotEncoder(
                        handle_unknown="ignore",
                        max_categories=MAX_CATEGORY_LEVELS + 1,
                    )),
                ]),
                categorical_cols,
            ),
        ],
        remainder="drop",
    )
    return preprocessor, numeric_cols, categorical_cols


def build_base_pipeline(X: pd.DataFrame, y: pd.Series) -> Pipeline:
    """Build an XGBoost pipeline WITHOUT calibration (used for tuning)."""
    if not XGBOOST_AVAILABLE or XGBClassifier is None:
        raise RuntimeError(f"XGBoost runtime is unavailable: {XGBOOST_IMPORT_ERROR}")

    preprocessor, _, _ = build_preprocessor(X)
    spw = compute_scale_pos_weight(y)

    return Pipeline([
        ("preprocessor", preprocessor),
        ("model", XGBClassifier(
            objective="binary:logistic",
            eval_metric="logloss",
            tree_method="hist",
            n_jobs=max(1, (os.cpu_count() or 2) - 1),
            random_state=RANDOM_SEED,
            scale_pos_weight=spw,
            # Defaults — will be overridden by tuning
            n_estimators=200,
            max_depth=5,
            learning_rate=0.05,
        )),
    ])


def stratified_split(
    X: pd.DataFrame,
    y: pd.Series,
    sensitive_columns: List[str],
) -> Tuple[
    pd.DataFrame, pd.DataFrame, pd.DataFrame,
    pd.Series, pd.Series, pd.Series,
]:
    """Stratified 70/15/15 train/validation/test split.

    Stratification is on the target variable to preserve class distribution.
    Encoders will be fit ONLY on X_train to prevent data leakage.
    """
    # First split: 70% train, 30% temp
    X_train, X_temp, y_train, y_temp = train_test_split(
        X, y,
        test_size=(VAL_RATIO + TEST_RATIO),
        stratify=y,
        random_state=RANDOM_SEED,
    )

    # Second split: 50/50 of the 30% → 15% val, 15% test
    relative_test = TEST_RATIO / (VAL_RATIO + TEST_RATIO)
    X_val, X_test, y_val, y_test = train_test_split(
        X_temp, y_temp,
        test_size=relative_test,
        stratify=y_temp,
        random_state=RANDOM_SEED,
    )

    return X_train, X_val, X_test, y_train, y_val, y_test


def tune_hyperparameters(
    pipeline: Pipeline,
    X_train: pd.DataFrame,
    y_train: pd.Series,
    sample_weights: Optional[np.ndarray] = None,
    n_iter: int = 20,
) -> Pipeline:
    """Tune XGBoost hyperparameters using RandomizedSearchCV with stratified K-fold.

    Uses 3-fold CV on training data only — no validation/test leakage.
    """
    cv = StratifiedKFold(n_splits=3, shuffle=True, random_state=RANDOM_SEED)

    search = RandomizedSearchCV(
        estimator=pipeline,
        param_distributions=XGBOOST_PARAM_DISTRIBUTIONS,
        n_iter=n_iter,
        scoring="roc_auc",
        cv=cv,
        random_state=RANDOM_SEED,
        n_jobs=1,  # pipeline already uses parallel XGBoost
        refit=True,
        error_score="raise",
    )

    fit_params = {}
    if sample_weights is not None:
        fit_params["model__sample_weight"] = sample_weights

    search.fit(X_train, y_train, **fit_params)
    return search.best_estimator_


def calibrate_model(
    pipeline: Pipeline,
    X_val: pd.DataFrame,
    y_val: pd.Series,
) -> CalibratedClassifierCV:
    """Apply isotonic calibration using the validation set.

    Isotonic regression is chosen over Platt scaling because:
    - It doesn't assume a sigmoid shape for the calibration curve
    - XGBoost probabilities can have non-monotonic calibration errors
    - It's more flexible for arbitrary probability distributions
    """
    calibrated = CalibratedClassifierCV(
        estimator=pipeline,
        method="isotonic",
        cv="prefit",  # pipeline is already fitted
    )
    calibrated.fit(X_val, y_val)
    return calibrated


def evaluate_model(
    model: Any,
    X_test: pd.DataFrame,
    y_test: pd.Series,
) -> Dict[str, Any]:
    """Full evaluation suite on held-out test set.

    Returns accuracy, precision, recall, F1, ROC-AUC, and confusion matrix.
    """
    y_pred = model.predict(X_test)
    y_proba = model.predict_proba(X_test)[:, 1]

    cm = confusion_matrix(y_test, y_pred)
    tn, fp, fn, tp = cm.ravel() if cm.size == 4 else (0, 0, 0, 0)

    return {
        "accuracy": round(float(accuracy_score(y_test, y_pred)), 4),
        "precision": round(float(precision_score(y_test, y_pred, zero_division=0)), 4),
        "recall": round(float(recall_score(y_test, y_pred, zero_division=0)), 4),
        "f1_score": round(float(f1_score(y_test, y_pred, zero_division=0)), 4),
        "roc_auc": round(float(roc_auc_score(y_test, y_proba)), 4),
        "confusion_matrix": {
            "true_negatives": int(tn),
            "false_positives": int(fp),
            "false_negatives": int(fn),
            "true_positives": int(tp),
        },
        "test_set_size": int(len(y_test)),
        "positive_rate_test": round(float(y_test.mean()), 4),
    }


def predict_in_batches(model: Any, X: pd.DataFrame) -> np.ndarray:
    """Score large datasets in batches to avoid memory issues."""
    batches: List[np.ndarray] = []
    for start in range(0, len(X), PREDICTION_BATCH_ROWS):
        chunk = X.iloc[start: start + PREDICTION_BATCH_ROWS]
        batches.append(model.predict_proba(chunk)[:, 1])
    return np.concatenate(batches) if batches else np.array([])


def train_production_pipeline(
    df: pd.DataFrame,
    target_column: str,
    positive_label: Any,
    sensitive_columns: List[str],
    apply_reweighing: bool = True,
) -> Dict[str, Any]:
    """End-to-end production ML pipeline.

    1. Prepare features and target
    2. Sample if dataset is very large
    3. Stratified 70/15/15 split
    4. Fit category compactors on TRAIN ONLY (no leakage)
    5. Hyperparameter tuning via RandomizedSearchCV on train
    6. Calibrate probabilities on validation set
    7. Evaluate on held-out test set
    8. Score entire dataset with calibrated model

    Returns a bundle with model, predictions, evaluation metrics, and metadata.
    """
    from app.fairness.metrics import compute_reweighing_weights

    # Prepare X and y
    X = df.drop(columns=[target_column])
    y = normalize_binary(df[target_column], positive_label)

    # Sample if too large — preserve stratification
    combined = pd.concat([X, y.rename("__target__")], axis=1)
    combined = sample_frame(combined, MAX_TRAIN_ROWS, "__target__")
    X_sampled = combined.drop(columns=["__target__"])
    y_sampled = combined["__target__"]

    # Stratified split — CRITICAL: prevents data leakage
    X_train, X_val, X_test, y_train, y_val, y_test = stratified_split(
        X_sampled, y_sampled, sensitive_columns,
    )

    # Fit category compactors on TRAINING DATA ONLY
    compactors = fit_category_compactors(X_train)
    X_train = apply_category_compactors(X_train, compactors)
    X_val = apply_category_compactors(X_val, compactors)
    X_test = apply_category_compactors(X_test, compactors)

    # Compute reweighing weights on training data
    reweighing_summary: Dict[str, Any]
    if apply_reweighing:
        sample_weights, reweighing_summary = compute_reweighing_weights(
            X_train, y_train, sensitive_columns,
        )
        weight_array = sample_weights.to_numpy()
    else:
        weight_array = None
        reweighing_summary = {
            "applied": False,
            "strategy": "none",
            "group_columns": [],
            "notes": ["Reweighing was intentionally disabled."],
        }

    # Build and tune pipeline
    base_pipeline = build_base_pipeline(X_train, y_train)
    tuned_pipeline = tune_hyperparameters(
        base_pipeline, X_train, y_train,
        sample_weights=weight_array,
        n_iter=20,
    )

    # Calibrate on validation set
    calibrated_model = calibrate_model(tuned_pipeline, X_val, y_val)

    # Evaluate on held-out test set — NEVER seen during training or tuning
    evaluation = evaluate_model(calibrated_model, X_test, y_test)

    # Score the entire original dataset
    X_full = apply_category_compactors(X, compactors)
    probabilities = predict_in_batches(calibrated_model, X_full)
    predictions = (probabilities >= 0.5).astype(int)

    # Extract best hyperparameters
    best_params = {}
    if hasattr(tuned_pipeline, "named_steps"):
        model_step = tuned_pipeline.named_steps.get("model")
        if model_step is not None:
            best_params = {
                "n_estimators": getattr(model_step, "n_estimators", None),
                "max_depth": getattr(model_step, "max_depth", None),
                "learning_rate": getattr(model_step, "learning_rate", None),
                "subsample": getattr(model_step, "subsample", None),
                "colsample_bytree": getattr(model_step, "colsample_bytree", None),
                "reg_lambda": getattr(model_step, "reg_lambda", None),
                "reg_alpha": getattr(model_step, "reg_alpha", None),
                "min_child_weight": getattr(model_step, "min_child_weight", None),
                "scale_pos_weight": getattr(model_step, "scale_pos_weight", None),
            }

    numeric_cols = X_train.select_dtypes(include=[np.number]).columns.tolist()
    categorical_cols = [c for c in X_train.columns if c not in numeric_cols]

    return {
        "pipeline": tuned_pipeline,
        "calibrated_model": calibrated_model,
        "compactors": compactors,
        "feature_columns": X.columns.tolist(),
        "numeric_columns": numeric_cols,
        "categorical_columns": categorical_cols,
        "predictions": predictions,
        "probabilities": probabilities,
        "prediction_scores": probabilities,
        "evaluation": evaluation,
        "best_hyperparameters": best_params,
        "reweighing_summary": reweighing_summary,
        "training_rows_used": int(len(X_train)),
        "validation_rows_used": int(len(X_val)),
        "test_rows_used": int(len(X_test)),
        "total_sampled": int(len(X_sampled)),
        "model_source": "xgboost_training_model",
        "calibration_method": "isotonic",
        "explanation_basis": f"Trained on target column '{target_column}' with stratified split, HP tuning, and isotonic calibration.",
        # Keep test set for fairness validation
        "X_test": X_test,
        "y_test": y_test,
        "X_train": X_train,
        "y_train": y_train,
    }
