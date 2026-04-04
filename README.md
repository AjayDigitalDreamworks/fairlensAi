# FairAI Production Suite

A full-stack fairness auditing platform built from your uploaded frontend and integrated with:
- React + Vite frontend
- Express backend
- Python FastAPI ML service
- XGBoost surrogate modeling
- Apache Spark assisted large-dataset sampling
- Training-time reweighing for supervised fairness repair
- Intersectional fairness analysis across combined sensitive groups
- detection layer
- explanation layer
- root-cause layer
- correction recommendation layer
- mitigation preview
- Docker and CI setup

## Architecture

- `frontend/` React + Vite app
- `backend/` Express API and persistence layer
- `ml-service/` FastAPI model and fairness analysis engine
  Runs the fairness pipeline with XGBoost-based supervised surrogate predictions and optional Spark acceleration for large sampled workloads.

pip install fairlearn
pip install tensorflow
pip install inFairness
Install Java 17 as well if you want the local Spark acceleration path outside Docker.

## Local run

### 1) ML service
```bash
cd ml-service
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### 2) Backend
```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

### 3) Frontend
```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Frontend: http://localhost:8080
Backend: http://localhost:4000/api/v1/health
ML service: http://localhost:8000/health

## API flow

1. Frontend uploads file to Express backend.
2. Express forwards the file and selected columns to FastAPI.
3. FastAPI auto-detects domain, target, prediction, and sensitive columns when possible.
4. FastAPI computes fairness metrics, explanations, proxy-risk causes, corrected dataset output, and analysis logs.
5. Express stores the analysis, persists downloadable artifacts, and returns it to the frontend.
6. Frontend keeps the latest analysis and local history for dashboard/report pages.
7. Mitigation preview calls back through Express to FastAPI.

## Notes

- This is a strong production-style foundation, but not a fully hardened enterprise deployment.
- Authentication, rate limiting, observability, and true retraining pipelines are not fully implemented.
- Persistence currently uses a JSON file so the app runs out of the box without MongoDB.
