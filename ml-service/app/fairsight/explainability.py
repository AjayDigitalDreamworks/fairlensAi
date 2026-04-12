import os
import numpy as np
import shap
import matplotlib.pyplot as plt

def explain_bias_with_shap(model, X_test, feature_names, sensitive_features, group_labels=None):
    """
    Computes SHAP values and plots bar charts per group. 
    IMPORTANT: shows which features drive disparity between groups.
    """
    # Create explainer - depending on model type
    try:
        explainer = shap.Explainer(model, X_test)
        shap_values = explainer(X_test)
    except Exception:
        # Fallback for models without direct Explainer support
        explainer = shap.KernelExplainer(model.predict, shap.sample(X_test, 100))
        shap_values = explainer.shap_values(X_test)
        
    v = shap_values.values if hasattr(shap_values, 'values') else shap_values
    
    # ensure it's 2D (if binary class and model outputs just one prob margin)
    if len(v.shape) > 2:
        v = v[:, :, 1] # Take positive class
        
    sensitive_features = np.array(sensitive_features)
    groups = np.unique(sensitive_features)
    
    fig, axes = plt.subplots(1, len(groups), figsize=(6 * len(groups), 5), sharey=True)
    if len(groups) == 1:
        axes = [axes]
        
    for idx, g in enumerate(groups):
        mask = (sensitive_features == g)
        group_shap = v[mask]
        
        # Calculate mean absolute SHAP value per feature
        mean_shap = np.abs(group_shap).mean(axis=0)
        
        # Sort features by importance
        sorted_indices = np.argsort(mean_shap)
        sorted_features = np.array(feature_names)[sorted_indices]
        sorted_shap = mean_shap[sorted_indices]
        
        # Plot
        ax = axes[idx]
        title = group_labels[g] if group_labels and g in group_labels else f"Group: {g}"
        ax.barh(sorted_features[-10:], sorted_shap[-10:], color='teal')
        ax.set_title(title)
        ax.set_xlabel("Mean |SHAP| (Impact)")
        
    plt.tight_layout()
    import uuid
    output_path = f"shap_group_comparison_{uuid.uuid4().hex[:8]}.png"
    plt.savefig(output_path)
    plt.close()
    
    return output_path
