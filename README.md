# FairSight AI: Production-Grade Fairness Auditing & Mitigation Suite

[![Built for Google Hackathon](https://img.shields.io/badge/Built%20for-Google%20Hackathon-blue.svg)](https://hackathons.google.com)
[![Stack: React/FastAPI/Node](https://img.shields.io/badge/Stack-React%20%7C%20FastAPI%20%7C%20Node.js-green.svg)]()
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)]()

> **The ultimate toolkit for mathematically-grounded AI fairness auditing, bias mitigation, and human-in-the-loop explainability.**

FairSight AI transforms complex mathematical fairness audits into intuitive, actionable dashboards. Designed for modern ML Ops, it bridges the gap between raw data bias and ethically-sound model deployment.

---

## 🚀 Vision & Key Features

FairSight AI is more than just a metric dashboard; it's an end-to-end **Bias Correction Pipeline**.

- **💎 Triple-Tier Analysis:** Detect binary, multi-class, and intersectional bias across complex demographic slices.
- **⚡ Proactive Mitigation:** Apply state-of-the-art algorithms including **Fairlearn Exponentiated Gradient** and **AIF360 Adversarial Debiasing**.
- **🧠 SHAP-Powered Explainability:** Understand *why* your model is biased with global feature importance and correlation mapping.
- **✨ Gemini Narrative Engine:** (Optional) Integrated Google Gemini AI to provide natural language interpretations of complex fairness reports.
- **💾 Production-Ready Persistence:** Full MongoDB history and binary artifact management for long-haul compliance tracking.

---

## 🛠 Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React 18, Vite, Tailwind CSS, Lucide, Recharts (Sapphire Theme) |
| **Orchestration** | Node.js, Express, Mongoose (MongoDB) |
| **ML Engine** | Python 3.11, FastAPI, Scikit-learn, TensorFlow |
| **Fairness Core** | Fairlearn, IBM AIF360, SHAP, Apache Spark (Sampling) |

---

## 🚦 Quick Start (Local Development)

The project is architected as three decoupled microservices.

### 1️⃣ Prerequisites
- Node.js v20+
- Python 3.11+
- MongoDB instance (local or Atlas)

### 2️⃣ Installation

Clone the repo and install dependencies for all tiers:

```bash
# 1. ML Service
cd ml-service && pip install -r requirements.txt

# 2. Backend
cd ../backend && npm install

# 3. Frontend
cd ../frontend && npm install
```

### 3️⃣ Running the Suite

Run each service in a separate terminal:

**ML Engine (Port 8000)**
```bash
cd ml-service
uvicorn app.main:app --reload --port 8000
```

**Backend API (Port 4000)**
```bash
cd backend
npm run dev
```

**Frontend Dashboard (Port 5173)**
```bash
cd frontend
npm run dev
```

---

## 🐳 Docker Orchestration (Easiest Method)

Deploy the entire stack (including MongoDB) using a single command:

```bash
docker-compose up --build
```
- **Dashboard:** `http://localhost:5173`
- **Backend API:** `http://localhost:4000`
- **ML Insights:** `http://localhost:8000`

---

## 📖 How it Works: The Audit Flow

1. **Upload:** User provides a `.pkl` / `.joblib` / `.h5` model and a reference dataset.
2. **Detection:** The FastAPI engine calculates **Demographic Parity** and **Equal Opportunity** differences.
3. **Explanation:** SHAP values are extracted to map the features driving bias.
4. **Mitigation:** The "Mitigation Toolkit" allows users to wrap their models with fairness constraints (e.g., Threshold Optimization).
5. **Artifact Export:** Download the corrected model and a machine-readable JSON Audit Report for compliance.

---

## 🛡 Ethical Guardrails
*FairSight AI is a diagnostic tool and does not guarantee "perfect" fairness. It follows the principles of Disparate Impact (80% rule) and requires human-in-the-loop oversight for final deployments.*

---
**Developed for the Google Hackathon Series.**
