import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import OrdinalEncoder
import joblib
import os

def create_powerful_sample_data():
    """Generates a complex, large, and biased dataset for high-end fairness testing."""
    np.random.seed(42)
    n_samples = 50000
    
    print(f"Creating {n_samples} samples...")
    
    # 1. Base Features
    income = np.random.lognormal(mean=8.5, sigma=0.5, size=n_samples) # Avg ~5k/mo
    debt_to_income = np.clip(np.random.beta(a=2, b=5, size=n_samples), 0, 1)
    credit_history = np.random.gamma(shape=5, scale=2, size=n_samples) # Avg ~10 years
    education_levels = ['No Degree', 'High School', 'Bachelors', 'Masters', 'PhD']
    education = np.random.choice(education_levels, n_samples, p=[0.1, 0.4, 0.3, 0.15, 0.05])
    
    # 2. Sensitive Attributes
    genders = ['Male', 'Female', 'Non-Binary']
    gender = np.random.choice(genders, n_samples, p=[0.48, 0.48, 0.04])
    
    ethnicities = ['Group_A', 'Group_B', 'Group_C', 'Group_D']
    ethnicity = np.random.choice(ethnicities, n_samples, p=[0.4, 0.3, 0.2, 0.1])
    
    age_groups = ['Young', 'Adult', 'Senior']
    age_group = np.random.choice(age_groups, n_samples, p=[0.25, 0.60, 0.15])
    
    # 3. Proxy Attribute
    # Region 'South' is heavily populated by 'Group_C'
    regions = ['North', 'East', 'West', 'Central', 'South']
    region = []
    for eth in ethnicity:
        if eth == 'Group_C':
            region.append(np.random.choice(regions, p=[0.1, 0.1, 0.1, 0.1, 0.6]))
        else:
            region.append(np.random.choice(regions, p=[0.25, 0.25, 0.2, 0.25, 0.05]))
    region = np.array(region)
    
    # 4. Latent Score and Bias Implementation
    # Higher income, history, and education = higher score
    edu_map = {lvl: i for i, lvl in enumerate(education_levels)}
    edu_score = np.array([edu_map[e] for e in education])
    
    score = (np.log(income) - 8.5) * 2.0
    score += (credit_history - 10) * 0.1
    score -= (debt_to_income - 0.3) * 5.0
    score += (edu_score - 1) * 0.5
    
    # SYSTEMIC BIAS
    # Direct bias against Group_C
    score[ethnicity == 'Group_C'] -= 1.2
    
    # Intersectional bias: Young Females get a penalty
    young_female_idx = (gender == 'Female') & (age_group == 'Young')
    score[young_female_idx] -= 0.8
    
    # Add noise
    noise = np.random.randn(n_samples) * 1.2
    final_score = score + noise
    
    # Target label: Approved (1) or Denied (0)
    # Threshold chosen to give ~35% approval rate
    approval_threshold = np.percentile(final_score, 65)
    approved = (final_score >= approval_threshold).astype(int)
    
    df = pd.DataFrame({
        'monthly_income': income.round(2),
        'dti_ratio': debt_to_income.round(4),
        'credit_history_years': credit_history.round(1),
        'education': education,
        'region': region,
        'gender': gender,
        'ethnicity': ethnicity,
        'age_group': age_group,
        'approved': approved
    })
    
    return df

def generate_powerful_artefacts():
    print("Starting Powerful Sample Generation (Professional Grade)...")
    df = create_powerful_sample_data()
    
    output_dir = "complex_samples"
    os.makedirs(output_dir, exist_ok=True)
    
    # Save CSV
    csv_path = os.path.join(output_dir, "finance_audit_large.csv")
    df.to_csv(csv_path, index=False)
    print(f"Saved complex dataset to: {csv_path}")
    
    # 5. Train a "Powerful" Model (Surrogate)
    # This model will learn the biases we injected
    print("Training powerful HistGradientBoostingClassifier...")
    
    # Preprocessing
    X = df.drop(columns=['approved'])
    y = df['approved']
    
    # Encode categoricals for sklearn
    # Note: Modern HistGradientBoosting handles categoricals if we tell it to, 
    # but for compatibility we'll use simple ordinal encoding
    cat_cols = ['education', 'region', 'gender', 'ethnicity', 'age_group']
    encoder = OrdinalEncoder()
    X_encoded = X.copy()
    X_encoded[cat_cols] = encoder.fit_transform(X[cat_cols])
    
    X_train, X_test, y_train, y_test = train_test_split(X_encoded, y, test_size=0.2, random_state=42)
    
    # Higher complexity than the basic sample
    clf = HistGradientBoostingClassifier(
        max_iter=200, 
        max_depth=8, 
        l2_regularization=0.1,
        categorical_features=[X_encoded.columns.get_loc(c) for c in cat_cols],
        random_state=42
    )
    clf.fit(X_train, y_train)
    
    accuracy = clf.score(X_test, y_test)
    print(f"Model Accuracy on test set: {accuracy:.4f}")
    
    # Save Model
    model_path = os.path.join(output_dir, "finance_risk_model.pkl")
    # We save a wrapper that includes the encoder if we wanted to be perfect, 
    # but the platform usually expects raw models or handles encoding.
    # To be safe for the "FairSight" platform, we'll save just the model.
    joblib.dump(clf, model_path)
    
    print(f"Saved powerful model to: {model_path}")
    print("\n" + "="*50)
    print("INSTRUCTIONS FOR TESTING:")
    print(f"1. Open your browser and go to the FairLens AI dashboard.")
    print(f"2. Use the 'Upload' feature in the FairSight section.")
    print(f"3. Upload '{csv_path}'")
    print(f"4. Upload '{model_path}'")
    print(f"5. Observe how the system handles 50,000 rows, detects the proxy 'region',")
    print(f"   and identifies intersectional bias in Young Females.")
    print("="*50)

if __name__ == "__main__":
    generate_powerful_artefacts()
