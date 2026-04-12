import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
import joblib

def create_sample_data():
    # Set seed for reproducibility
    np.random.seed(42)
    n_samples = 2000
    
    # Features
    # Age: 18 to 65
    age = np.random.randint(18, 65, n_samples)
    
    # Education Years: 8 to 20
    education_years = np.random.randint(8, 20, n_samples)
    
    # Sensitive Attribute: Gender (0 = Female, 1 = Male)
    gender = np.random.randint(0, 2, n_samples)
    
    # Create an artificial bias: 
    # Base probability of getting a loan / >50K income
    # Higher education and age help
    score = (education_years - 12) * 0.5 + (age - 35) * 0.05
    
    # Huge unfair advantage to males
    score += gender * 2.0
    
    # Add noise
    noise = np.random.randn(n_samples) * 1.5
    final_score = score + noise
    
    # Binary Label: >0 means favorable (1), <0 means unfavorable (0)
    label = (final_score > 0).astype(int)
    
    df = pd.DataFrame({
        'age': age,
        'education_years': education_years,
        'gender': gender,
        'target_label': label
    })
    
    return df

def generate_artefacts():
    print("Generating synthetic biased dataset...")
    df = create_sample_data()
    
    # Save the full CSV for testing
    csv_path = "sample_test_data.csv"
    df.to_csv(csv_path, index=False)
    print(f"Saved dataset to {csv_path}")
    
    # Prepare data for modeling
    X = df[['age', 'education_years', 'gender']]
    y = df['target_label']
    
    # Split
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.3, random_state=42)
    
    # Train heavily biased model
    print("Training biased RandomForestClassifier...")
    clf = RandomForestClassifier(n_estimators=50, max_depth=5, random_state=42)
    clf.fit(X_train, y_train)
    
    # Save model
    model_path = "sample_model.pkl"
    joblib.dump(clf, model_path)
    print(f"Saved model to {model_path}")
    
    print("Done! You can now upload 'sample_model.pkl' and 'sample_test_data.csv' to the FairSight AI platform.")

if __name__ == "__main__":
    generate_artefacts()
