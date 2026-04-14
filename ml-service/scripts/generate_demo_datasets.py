import pandas as pd
import numpy as np
import os

def generate_hiring_dataset(n_samples=12000):
    np.random.seed(42)
    
    # Demographics
    gender = np.random.choice(['Male', 'Female'], p=[0.6, 0.4], size=n_samples)
    race = np.random.choice(['White', 'Black', 'Hispanic', 'Asian'], p=[0.55, 0.15, 0.20, 0.10], size=n_samples)
    age = np.random.normal(loc=35, scale=8, size=n_samples).astype(int)
    age = np.clip(age, 22, 65)

    # Features
    years_experience = np.random.normal(loc=age-22, scale=3).astype(int)
    years_experience = np.clip(years_experience, 0, 40)
    
    # Plant Bias: University rank is biased by race/gender due to systemic historical factors
    uni_prob = np.random.uniform(0, 1, size=n_samples)
    uni_boost = np.where(gender == 'Male', 0.1, 0.0) + np.where(race == 'White', 0.1, 0.0)
    university_tier = pd.cut(uni_prob + uni_boost, bins=[-np.inf, 0.4, 0.8, np.inf], labels=['Tier 3', 'Tier 2', 'Tier 1'])

    skills_score = np.random.normal(loc=70, scale=15, size=n_samples)
    skills_score = np.clip(skills_score + (years_experience * 1.5), 0, 100)

    # Plant Bias: Phone screen score naturally penalizes non-majority groups due to "cultural fit" proxy
    cultural_fit_penalty = np.where(gender == 'Female', -5, 0) + np.where(age > 45, -8, 0) + np.where(race != 'White', -4, 0)
    phone_screen_score = np.clip(skills_score + cultural_fit_penalty + np.random.normal(0, 5, n_samples), 0, 100)
    
    # Outcomes: Hire if phone screen > 75 and skills > 70
    hired = ((phone_screen_score > 75) & (skills_score > 70)).astype(int)

    df = pd.DataFrame({
        'Applicant_ID': range(1000, 1000+n_samples),
        'Gender': gender,
        'Race': race,
        'Age': age,
        'Years_Experience': years_experience,
        'University_Tier': university_tier,
        'Skills_Score': skills_score.round(1),
        'Phone_Screen_Score': phone_screen_score.round(1),
        'Hired': hired
    })
    
    return df

def generate_credit_dataset(n_samples=10000):
    np.random.seed(101)
    
    # Demographics
    gender = np.random.choice(['Male', 'Female'], p=[0.5, 0.5], size=n_samples)
    marital_status = np.random.choice(['Single', 'Married', 'Divorced'], p=[0.4, 0.5, 0.1], size=n_samples)
    income = np.random.lognormal(mean=11.0, sigma=0.5, size=n_samples).round(-3)

    # Credit specific
    debt_to_income = np.random.normal(loc=0.35, scale=0.1, size=n_samples)
    debt_to_income = np.clip(debt_to_income, 0.05, 0.80)
    
    # Plant Bias: Credit score computation historically favored married men
    credit_score_base = 650 + (income / 1000) * 0.5 - (debt_to_income * 200)
    credit_score_bias = np.where(gender == 'Female', -20, 0) + np.where(marital_status == 'Single', -15, 0)
    credit_score = np.clip(credit_score_base + credit_score_bias + np.random.normal(0, 30, n_samples), 300, 850).astype(int)

    # Loan specific
    loan_amount = np.random.uniform(5000, 50000, size=n_samples).round(-2)
    
    # Outcome: Default if DTI > 0.45 or Credit Score < 620
    # The bank's model will predict Default, but the true default rate is heavily proxied
    default_trigger = (debt_to_income > 0.45) | (credit_score < 620)
    default = np.where(default_trigger, np.random.choice([0, 1], p=[0.2, 0.8], size=n_samples), np.random.choice([0, 1], p=[0.9, 0.1], size=n_samples))
    
    # For fair lending, target is usually Approval (1) vs Denial (0)
    # Bank approves if credit score > 650
    approved = (credit_score > 640).astype(int)

    df = pd.DataFrame({
        'Application_ID': range(5000, 5000+n_samples),
        'Gender': gender,
        'Marital_Status': marital_status,
        'Income': income,
        'Debt_To_Income': debt_to_income.round(2),
        'Credit_Score': credit_score,
        'Loan_Amount': loan_amount,
        'Defaulted': default,
        'Approved': approved
    })
    
    return df

if __name__ == "__main__":
    os.makedirs("../data", exist_ok=True)
    
    print("Generating High-Stakes Hiring Demo Dataset...")
    hiring_df = generate_hiring_dataset()
    hiring_df.to_csv("../data/demo_hiring_biased.csv", index=False)
    print(f"-> Saved {len(hiring_df)} rows to data/demo_hiring_biased.csv")
    
    print("Generating Financial Credit Demo Dataset...")
    credit_df = generate_credit_dataset()
    credit_df.to_csv("../data/demo_credit_biased.csv", index=False)
    print(f"-> Saved {len(credit_df)} rows to data/demo_credit_biased.csv")
    
    print("Done! Use these for the hackathon demo.")
