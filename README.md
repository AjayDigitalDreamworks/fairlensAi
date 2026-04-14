# 🏦 FairSight AI: Financial Compliance Copilot for AI Systems

[![Built for Google Hackathon](https://img.shields.io/badge/Built%20for-Google%20Hackathon-blue.svg)](https://hackathons.google.com)
[![Stack: React/FastAPI/Node](https://img.shields.io/badge/Stack-React%20%7C%20FastAPI%20%7C%20Node.js-green.svg)]()
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)]()

> **Turn abstract AI bias metrics into domain-specific, dollar-denominated risk.** 

Every year, US companies lose over **$500 million** to AI discrimination lawsuits. FairSight AI is the first compliance copilot that monitors ML models in real-time, maps bias directly to **ECOA** (Financial Credit) and **EEOC/NYC Local Law 144** (Hiring) regulations, and fixes violations in one click.

---

## 🏆 Top 1% Hackathon Product Positioning

Generic fairness tools tell you: *"Your model has 0.15 Demographic Parity Difference (DPD)."*
**FairSight AI** tells you: *"Your model exposes you to **$2.3M** in ECOA litigation risk. Applying the recommended correction saves **$1.8M/year** while maintaining 94% accuracy."*

### Key Differentiators:
1. 💰 **Bias Cost Calculator:** An actuarial engine that calculates Litigation Risk, Regulatory Fines (CFPB/FTC), Reputation Damage, and Opportunity Cost.
2. 🏛️ **Domain-Specific Compliance:** Built-in mapping for Financial Credit (ECOA, FCRA, SR 11-7) and Hiring (EEOC Title VII, ADEA, NYC LL144).
3. ⚡ **Real-Time Fairness Monitor:** WebSocket-powered monitoring with CUSUM drift detection to catch bias creep before an auditor does.

---

## 🚀 The Feature System

- **Dashboard:** Instantly assess group selection rates, Disparate Impact (4/5ths rule), and Equalized Odds.
- **ROI Impact Analysis:** Compare projected risk exposure *before* and *after* bias mitigation.
- **Regulatory Violation Engine:** Check real-time compliance passing rates and generate specific legal citations for failures.
- **Counterfactual Explorer:** Run dynamic "what-if" simulations against Perfect Parity vs. Regulatory Minimums.
- **Bias Source Attribution:** Pinpoint whether bias comes from Historical Labels, Sampling Imbalance, or Proxy Features.
- **Auto-Mitigation:** One-click application of Threshold Optimization, Reweighing, or Adversarial Debiasing.

---

## 🛠 Tech Stack & Architecture

FairSight AI operates on a **3-Tier Microservices Architecture**, built for parallelized fairness computation of 50K+ row datasets in sub-10 seconds.

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React 18, Vite, Tailwind CSS, Lucide, Recharts |
| **Gateway/API** | Node.js, Express, Mongoose (MongoDB) |
| **ML Engine / Compliance** | Python 3.11, FastAPI, Fairlearn, IBM AIF360, WebSockets |

---

## 🚦 Quick Start

### 1️⃣ Prerequisites
- Node.js v20+
- Python 3.11+
- MongoDB instance (local or Atlas)

### 2️⃣ Installation & Setup

Clone the repo and install dependencies:

```bash
# 1. ML Service
cd ml-service && pip install -r requirements.txt

# 2. Backend
cd ../backend && npm install

# 3. Frontend
cd ../frontend && npm install
```

### 3️⃣ Running the Suite Locally
Run each service in a separate terminal:

**ML Engine & Compliance Tracker (Port 8000)**
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

*(Alternatively, use `docker-compose up --build` to orchestrate everything automatically).*

---

## 🎬 90-Second Demo Walkthrough 

1. **Upload & Detect:** Go to "Dataset Analyzer". The system flags an ECOA disparate impact violation against a protected class.
2. **Cost Impact (The Wow Moment):** Navigate to the **Cost Calculator** tab. FairSight reveals a $2.3M annual risk projection with detailed breakdown graphics.
3. **Counterfactual Exploration:** Switch to the **Compliance Dashboard** to see simulations of the 4/5ths rule vs Perfect Parity.
4. **One-Click Fix:** Apply automated threshold optimization. The ROI chart dynamically updates, showing risk reduced from $2.3M down to $180K (a 92% reduction).
5. **Real-Time Monitor:** Showcase the **Live Monitor**, demonstrating WebSocket CUSUM bias drift detection catching threshold anomalies in under 2 seconds.

---

## 🛡 Ethical Guardrails
*FairSight AI is an actuarial and diagnostic tool representing simulated economic risks based on CFPB/DOJ historical datasets. It facilitates human-in-the-loop oversight but does not replace formal legal counsel for official compliance reporting.*
