"""
bias_mitigation.py — Full Bias Mitigation Module
Provides multiple mitigation strategies:
  - ThresholdOptimizer (post-processing, Fairlearn)
  - ExponentiatedGradient (in-processing, Fairlearn)
  - AIF360 Reweighing (pre-processing)
  - Custom per-group thresholds (manual)
  - Automated selection based on severity
"""

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from fairlearn.postprocessing import ThresholdOptimizer
from fairlearn.reductions import ExponentiatedGradient, EqualizedOdds, DemographicParity
import logging

logger = logging.getLogger(__name__)

try:
    from aif360.datasets import BinaryLabelDataset
    from aif360.algorithms.preprocessing import Reweighing
    from aif360.algorithms.inprocessing import AdversarialDebiasing
    from aif360.algorithms.postprocessing import EqOddsPostprocessing
    import tensorflow.compat.v1 as tf
    AIF360_AVAILABLE = True
except ImportError:
    AIF360_AVAILABLE = False
    logger.warning("AIF360 not available. Reweighing, AdversarialDebiasing, and EqOdds mitigations will be unavailable.")


# ─────────────────────────────────────────────
# Post-Processing: ThresholdOptimizer (Fairlearn)
# ─────────────────────────────────────────────
def mitigate_threshold_optimizer(model, X_train, y_train, A_train,
                                  constraint='equalized_odds',
                                  objective='balanced_accuracy_score'):
    """
    Post-process model predictions with per-group threshold optimization.
    No retraining required — adjusts decision thresholds per group.

    Args:
        model: Pre-trained sklearn model (must have predict_proba)
        X_train: Training features
        y_train: Training labels
        A_train: Training sensitive features
        constraint: 'equalized_odds' | 'demographic_parity'
        objective: 'balanced_accuracy_score' | 'accuracy_score'

    Returns:
        ThresholdOptimizer — fitted optimizer
    """
    metric = 'equalized_odds' if constraint == 'equalized_odds' else 'demographic_parity'
    optimizer = ThresholdOptimizer(
        estimator=model,
        constraints=metric,
        objective=objective,
        prefit=True,
    )
    optimizer.fit(X_train, y_train, sensitive_features=A_train)
    logger.info(f"ThresholdOptimizer fitted with {constraint} constraint.")
    return optimizer


# ─────────────────────────────────────────────
# In-Processing: ExponentiatedGradient (Fairlearn)
# ─────────────────────────────────────────────
def mitigate_exponentiated_gradient(X_train, y_train, A_train,
                                     constraint='equalized_odds', eps=0.01):
    """
    Retrain with fairness constraint via Exponentiated Gradient.
    Wraps a LogisticRegression base estimator.

    Args:
        X_train: Training features
        y_train: Training labels
        A_train: Training sensitive features
        constraint: 'equalized_odds' | 'demographic_parity'
        eps: Constraint violation tolerance (smaller = stricter fairness)

    Returns:
        ExponentiatedGradient — fitted mitigator
    """
    base_estimator = LogisticRegression(max_iter=1000, solver='lbfgs')

    if constraint == 'equalized_odds':
        fairness_constraint = EqualizedOdds(difference_bound=eps)
    else:
        fairness_constraint = DemographicParity(difference_bound=eps)

    mitigator = ExponentiatedGradient(
        estimator=base_estimator,
        constraints=fairness_constraint,
        eps=eps,
    )
    mitigator.fit(X_train, y_train, sensitive_features=A_train)
    logger.info(f"ExponentiatedGradient fitted with {constraint} constraint (eps={eps}).")
    return mitigator


# ─────────────────────────────────────────────
# Pre-Processing: AIF360 Reweighing
# ─────────────────────────────────────────────
def apply_reweighing(df_train, label_col, sensitive_col,
                     privileged_val=1, unprivileged_val=0):
    """
    AIF360 Reweighing (Pre-processing).
    Returns a transformed dataframe and sample weights.
    """
    if not AIF360_AVAILABLE:
        raise RuntimeError("AIF360 is not installed. Cannot apply Reweighing.")

    bld = BinaryLabelDataset(
        favorable_label=1,
        unfavorable_label=0,
        df=df_train,
        label_names=[label_col],
        protected_attribute_names=[sensitive_col],
        privileged_protected_attributes=[[privileged_val]],
        unprivileged_protected_attributes=[[unprivileged_val]],
    )

    reweighing = Reweighing(
        unprivileged_groups=[{sensitive_col: unprivileged_val}],
        privileged_groups=[{sensitive_col: privileged_val}],
    )

    bld_transformed = reweighing.fit_transform(bld)
    sample_weights = bld_transformed.instance_weights
    df_transformed = bld_transformed.convert_to_dataframe()[0]

    logger.info("AIF360 Reweighing applied successfully.")
    return df_transformed, sample_weights

# ─────────────────────────────────────────────
# In-Processing: AIF360 Adversarial Debiasing
# ─────────────────────────────────────────────
def apply_adversarial_debiasing(df_train, label_col, sensitive_col, 
                                privileged_val=1, unprivileged_val=0):
    """
    AIF360 Adversarial Debiasing (TensorFlow wrapper).
    Trains an adversary and predictor simultaneously.
    """
    if not AIF360_AVAILABLE:
        raise RuntimeError("AIF360/TensorFlow not available. Cannot apply AdversarialDebiasing.")
        
    tf.disable_eager_execution()
    
    # Needs a cleanly created session
    sess = tf.Session()
    
    bld = BinaryLabelDataset(
        favorable_label=1,
        unfavorable_label=0,
        df=df_train,
        label_names=[label_col],
        protected_attribute_names=[sensitive_col],
        privileged_protected_attributes=[[privileged_val]],
        unprivileged_protected_attributes=[[unprivileged_val]],
    )
    
    debiaser = AdversarialDebiasing(
        privileged_groups=[{sensitive_col: privileged_val}],
        unprivileged_groups=[{sensitive_col: unprivileged_val}],
        scope_name='debiased_classifier',
        debias=True,
        sess=sess,
        num_epochs=10 # Reduced for test iteration speeds
    )
    debiaser.fit(bld)
    logger.info("Adversarial Debiasing model fitted.")
    return debiaser, bld

# ─────────────────────────────────────────────
# Post-Processing: AIF360 Equalized Odds
# ─────────────────────────────────────────────
def apply_eq_odds_postprocessing(model, df_train, df_test, label_col, sensitive_col,
                                 privileged_val=1, unprivileged_val=0):
    """
    Adjusts output labels dynamically without retraining model internally.
    """
    if not AIF360_AVAILABLE:
        raise RuntimeError("AIF360 not available. Cannot apply EqOddsPostprocessing.")

    bld_train = BinaryLabelDataset(
        favorable_label=1, unfavorable_label=0, df=df_train,
        label_names=[label_col], protected_attribute_names=[sensitive_col],
        privileged_protected_attributes=[[privileged_val]],
        unprivileged_protected_attributes=[[unprivileged_val]],
    )
    
    bld_test = BinaryLabelDataset(
        favorable_label=1, unfavorable_label=0, df=df_test,
        label_names=[label_col], protected_attribute_names=[sensitive_col],
        privileged_protected_attributes=[[privileged_val]],
        unprivileged_protected_attributes=[[unprivileged_val]],
    )

    # Scikit learn model predicts over X
    X_train = df_train.drop(columns=[label_col])
    X_test = df_test.drop(columns=[label_col])
    
    train_pred = bld_train.copy(deepcopy=True)
    train_pred.labels = model.predict(X_train).reshape(-1,1)
    
    test_pred = bld_test.copy(deepcopy=True)
    test_pred.labels = model.predict(X_test).reshape(-1,1)
    
    eq_odds_pp = EqOddsPostprocessing(
        privileged_groups=[{sensitive_col: privileged_val}],
        unprivileged_groups=[{sensitive_col: unprivileged_val}],
        seed=42
    )
    eq_odds_pp = eq_odds_pp.fit(bld_test, test_pred)
    test_pred_adjusted = eq_odds_pp.predict(test_pred)
    
    logger.info("AIF360 Equalized Odds postprocessing applied.")
    return test_pred_adjusted.labels.ravel(), eq_odds_pp


# ─────────────────────────────────────────────
# Manual: Custom Per-Group Thresholds
# ─────────────────────────────────────────────
def mitigate_custom_thresholds(y_prob, sensitive_features, thresholds: dict):
    """
    Apply different decision thresholds per group.

    Args:
        y_prob: Probability scores from model
        sensitive_features: Array of group labels
        thresholds: Dict mapping group value -> float threshold
            Example: {0: 0.45, 1: 0.55}

    Returns:
        np.ndarray of adjusted predictions
    """
    y_pred = np.zeros(len(y_prob), dtype=int)
    sensitive_features = np.array(sensitive_features)

    for group_val, thresh in thresholds.items():
        mask = (sensitive_features == group_val)
        y_pred[mask] = (y_prob[mask] >= thresh).astype(int)

    logger.info(f"Custom thresholds applied: {thresholds}")
    return y_pred


# ─────────────────────────────────────────────
# Automated method selection
# ─────────────────────────────────────────────
def select_mitigation_method(bias_report, has_training_data=True,
                             is_deep_learning=False) -> dict:
    """
    Automated logic for picking a mitigation strategy based on bias severity.

    Returns a dict with method name, reason, and expected impact.
    """
    dpd = abs(bias_report.get('dpd', 0.0))
    eod = abs(bias_report.get('eod', 0.0))
    severity = max(dpd, eod)

    if not has_training_data:
        return {
            "method": "ThresholdOptimizer",
            "reason": "No training data available — post-processing is the only option.",
            "expected_accuracy_impact": "-1% to -3%",
            "expected_bias_reduction": "DPD: 60-80% reduction",
        }

    if severity <= 0.10:
        return {
            "method": "Reweighing",
            "reason": f"Low severity (max={severity:.3f}). Pre-processing reweighing is the least invasive approach.",
            "expected_accuracy_impact": "-0.5% to -2%",
            "expected_bias_reduction": "DPD: 40-60% reduction",
        }
    elif severity <= 0.20:
        return {
            "method": "ThresholdOptimizer",
            "reason": f"Moderate severity (max={severity:.3f}). Threshold optimization balances fairness and accuracy.",
            "expected_accuracy_impact": "-1% to -3%",
            "expected_bias_reduction": "DPD: 60-80% reduction",
        }
    else:
        if is_deep_learning:
            return {
                "method": "AdversarialDebiasing",
                "reason": f"Severe bias (max={severity:.3f}) in deep learning model. Adversarial debiasing recommended.",
                "expected_accuracy_impact": "-3% to -7%",
                "expected_bias_reduction": "DPD: 70-90% reduction",
            }
        else:
            return {
                "method": "ExponentiatedGradient",
                "reason": f"Severe bias (max={severity:.3f}). In-processing fairness-constrained retraining needed.",
                "expected_accuracy_impact": "-2% to -5%",
                "expected_bias_reduction": "DPD/EOD: 50-70% reduction",
            }


# ─────────────────────────────────────────────
# Trade-off analysis reference
# ─────────────────────────────────────────────
TRADEOFF_TABLE = [
    {"method": "ThresholdOptimizer", "accuracy_impact": "-1% to -3%", "bias_reduction": "DPD: 60-80%"},
    {"method": "ExponentiatedGradient", "accuracy_impact": "-2% to -5%", "bias_reduction": "DPD/EOD: 50-70%"},
    {"method": "AdversarialDebiasing", "accuracy_impact": "-3% to -7%", "bias_reduction": "DPD: 70-90%"},
    {"method": "CustomThresholds", "accuracy_impact": "-1% to -4%", "bias_reduction": "DPD: 40-60%"},
    {"method": "Reweighing", "accuracy_impact": "-0.5% to -2%", "bias_reduction": "DPD: 30-50%"},
    {"method": "EqOddsPostprocessing", "accuracy_impact": "-2% to -5%", "bias_reduction": "EOD: 60-80%"},
]
