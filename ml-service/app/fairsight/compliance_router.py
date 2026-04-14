"""
compliance_router.py — API endpoints for compliance, cost calculation, and real-time monitoring.
Exposes the compliance engine, cost calculator, counterfactual explorer,
bias drift detection, and bias source attribution via REST + WebSocket.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
import random
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

from .compliance_engine import (
    ComplianceCostCalculator,
    ComplianceViolationDetector,
    CounterfactualExplorer,
    BiasDriftDetector,
    BiasSourceAttributor,
    FINANCIAL_REGULATIONS,
    HIRING_REGULATIONS,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/fairsight/compliance", tags=["Compliance & Cost"])


# ═══════════════════════════════════════════════
# Request Models
# ═══════════════════════════════════════════════

class CostCalculationRequest(BaseModel):
    severity: str = "moderate"
    domain: str = "credit"
    disparate_impact: float = 0.75
    dpd: float = 0.15
    eod: float = 0.12
    portfolio_size: int = 10000
    avg_transaction_value: float = 25000.0
    affected_group_pct: float = 0.20


class ROICalculationRequest(BaseModel):
    domain: str = "credit"
    portfolio_size: int = 10000
    avg_transaction_value: float = 25000.0
    before_severity: str = "high"
    after_severity: str = "low"
    disparate_impact_before: float = 0.72
    disparate_impact_after: float = 0.88
    dpd_before: float = 0.18
    dpd_after: float = 0.04
    eod_before: float = 0.15
    eod_after: float = 0.05
    fairness_score_before: float = 68.0
    fairness_score_after: float = 91.0


class ComplianceCheckRequest(BaseModel):
    domain: str = "credit"
    sensitive_column: str = "Gender"
    disparate_impact: float = 0.75
    dpd: float = 0.15
    eod: float = 0.12
    fairness_score: float = 72.0
    group_metrics: List[Dict[str, Any]] = Field(default_factory=list)


class CounterfactualRequest(BaseModel):
    domain: str = "credit"
    disparate_impact: float = 0.75
    dpd: float = 0.15
    eod: float = 0.12
    group_metrics: List[Dict[str, Any]] = Field(default_factory=list)


class DriftDetectionRequest(BaseModel):
    historical_values: List[float] = Field(default_factory=list)
    threshold: float = 0.05
    slack: float = 0.02


class BiasAttributionRequest(BaseModel):
    group_metrics: List[Dict[str, Any]] = Field(default_factory=list)
    dpd: float = 0.15
    eod: float = 0.12
    disparate_impact: float = 0.75
    explainability_data: Optional[Dict[str, Any]] = None


# ═══════════════════════════════════════════════
# REST Endpoints
# ═══════════════════════════════════════════════

@router.post("/cost-calculator")
async def calculate_cost(req: CostCalculationRequest) -> Dict[str, Any]:
    """Calculate total financial exposure from bias."""
    try:
        result = ComplianceCostCalculator.calculate_total_exposure(
            severity=req.severity,
            domain=req.domain,
            disparate_impact=req.disparate_impact,
            dpd=req.dpd,
            eod=req.eod,
            portfolio_size=req.portfolio_size,
            avg_transaction_value=req.avg_transaction_value,
            affected_group_pct=req.affected_group_pct,
        )
        return {"status": "success", **result}
    except Exception as exc:
        logger.exception(f"Cost calculation failed: {exc}")
        return {"status": "error", "message": str(exc)}


@router.post("/roi")
async def calculate_roi(req: ROICalculationRequest) -> Dict[str, Any]:
    """Calculate ROI of bias mitigation."""
    try:
        result = ComplianceCostCalculator.calculate_roi(
            before_severity=req.before_severity,
            after_severity=req.after_severity,
            domain=req.domain,
            disparate_impact_before=req.disparate_impact_before,
            disparate_impact_after=req.disparate_impact_after,
            dpd_before=req.dpd_before,
            dpd_after=req.dpd_after,
            eod_before=req.eod_before,
            eod_after=req.eod_after,
            fairness_score_before=req.fairness_score_before,
            fairness_score_after=req.fairness_score_after,
            portfolio_size=req.portfolio_size,
            avg_transaction_value=req.avg_transaction_value,
        )
        return {"status": "success", **result}
    except Exception as exc:
        logger.exception(f"ROI calculation failed: {exc}")
        return {"status": "error", "message": str(exc)}


@router.post("/check-violations")
async def check_violations(req: ComplianceCheckRequest) -> Dict[str, Any]:
    """Detect regulatory violations from fairness metrics."""
    try:
        result = ComplianceViolationDetector.detect_violations(
            domain=req.domain,
            sensitive_column=req.sensitive_column,
            disparate_impact=req.disparate_impact,
            dpd=req.dpd,
            eod=req.eod,
            fairness_score=req.fairness_score,
            group_metrics=req.group_metrics,
        )
        return {"status": "success", **result}
    except Exception as exc:
        logger.exception(f"Compliance check failed: {exc}")
        return {"status": "error", "message": str(exc)}


@router.post("/counterfactual")
async def counterfactual_analysis(req: CounterfactualRequest) -> Dict[str, Any]:
    """Run counterfactual fairness what-if simulation."""
    try:
        result = CounterfactualExplorer.simulate(
            group_metrics=req.group_metrics,
            current_di=req.disparate_impact,
            current_dpd=req.dpd,
            current_eod=req.eod,
            domain=req.domain,
        )
        return {"status": "success", **result}
    except Exception as exc:
        logger.exception(f"Counterfactual analysis failed: {exc}")
        return {"status": "error", "message": str(exc)}


@router.post("/drift-detection")
async def detect_drift(req: DriftDetectionRequest) -> Dict[str, Any]:
    """Run CUSUM drift detection on historical fairness values."""
    try:
        result = BiasDriftDetector.detect_drift(
            historical_di_values=req.historical_values,
            threshold=req.threshold,
            slack=req.slack,
        )
        return {"status": "success", **result}
    except Exception as exc:
        logger.exception(f"Drift detection failed: {exc}")
        return {"status": "error", "message": str(exc)}


@router.post("/bias-attribution")
async def attribute_bias(req: BiasAttributionRequest) -> Dict[str, Any]:
    """Attribute bias to specific sources (label, feature, sampling)."""
    try:
        result = BiasSourceAttributor.attribute(
            group_metrics=req.group_metrics,
            dpd=req.dpd,
            eod=req.eod,
            disparate_impact=req.disparate_impact,
            explainability_data=req.explainability_data,
        )
        return {"status": "success", **result}
    except Exception as exc:
        logger.exception(f"Bias attribution failed: {exc}")
        return {"status": "error", "message": str(exc)}


@router.get("/regulations/{domain}")
async def get_regulations(domain: str) -> Dict[str, Any]:
    """Get applicable regulations for a domain."""
    domain = domain.lower()
    if domain == "credit":
        return {"domain": "credit", "regulations": FINANCIAL_REGULATIONS}
    elif domain == "hiring":
        return {"domain": "hiring", "regulations": HIRING_REGULATIONS}
    else:
        return {
            "domain": domain,
            "regulations": {**FINANCIAL_REGULATIONS, **HIRING_REGULATIONS},
        }


# ═══════════════════════════════════════════════
# WebSocket Real-Time Monitoring
# ═══════════════════════════════════════════════

class FairnessMonitorState:
    """Simulates real-time fairness monitoring with realistic drift patterns."""

    def __init__(self, domain: str = "credit"):
        self.domain = domain
        self.tick = 0
        self.base_di = 0.82 + random.uniform(-0.03, 0.03)
        self.base_dpd = 0.08 + random.uniform(-0.02, 0.02)
        self.base_eod = 0.06 + random.uniform(-0.02, 0.02)
        self.base_accuracy = 0.89 + random.uniform(-0.02, 0.02)
        self.base_fairness = 85.0 + random.uniform(-5.0, 5.0)
        self.drift_active = False
        self.drift_start_tick = random.randint(15, 30)
        self.history_di = []

    def get_snapshot(self) -> Dict[str, Any]:
        """Generate a realistic fairness monitoring snapshot."""
        self.tick += 1

        # Simulate gradual drift after certain ticks
        drift_factor = 0
        if self.tick >= self.drift_start_tick:
            self.drift_active = True
            drift_factor = min(0.15, (self.tick - self.drift_start_tick) * 0.005)

        noise = random.gauss(0, 0.008)
        di = max(0.50, min(1.0, self.base_di - drift_factor + noise))
        dpd = max(0.0, min(0.40, self.base_dpd + drift_factor * 0.8 + random.gauss(0, 0.005)))
        eod = max(0.0, min(0.35, self.base_eod + drift_factor * 0.6 + random.gauss(0, 0.004)))
        accuracy = max(0.70, min(0.99, self.base_accuracy - drift_factor * 0.2 + random.gauss(0, 0.003)))
        fairness = max(0, min(100, self.base_fairness - drift_factor * 100 + random.gauss(0, 1.5)))

        self.history_di.append(di)

        # Run drift detection
        drift_result = BiasDriftDetector.detect_drift(self.history_di[-50:]) if len(self.history_di) >= 3 else {"drift_detected": False, "alert_level": "NORMAL"}

        # Determine compliance status
        ecoa_compliant = di >= 0.80
        dpd_compliant = dpd <= 0.10
        overall_compliant = ecoa_compliant and dpd_compliant

        # Calculate current cost exposure
        severity = "low" if overall_compliant else ("high" if di < 0.70 else "moderate")
        cost = ComplianceCostCalculator.calculate_total_exposure(
            severity=severity, domain=self.domain,
            disparate_impact=di, dpd=dpd, eod=eod,
        )

        return {
            "timestamp": time.time(),
            "tick": self.tick,
            "metrics": {
                "disparate_impact": round(di, 4),
                "dpd": round(dpd, 4),
                "eod": round(eod, 4),
                "accuracy": round(accuracy, 4),
                "fairness_score": round(fairness, 2),
            },
            "compliance": {
                "ecoa_4_5ths": ecoa_compliant,
                "dpd_threshold": dpd_compliant,
                "overall": overall_compliant,
                "status": "COMPLIANT" if overall_compliant else "NON-COMPLIANT",
            },
            "drift": {
                "detected": drift_result.get("drift_detected", False),
                "alert_level": drift_result.get("alert_level", "NORMAL"),
            },
            "cost_exposure": {
                "total": cost["total_annual_exposure"],
                "litigation": cost["litigation_risk"]["expected_cost"],
                "regulatory": cost["regulatory_fines"]["expected_fine"],
            },
            "model_health": {
                "status": "HEALTHY" if overall_compliant and not drift_result.get("drift_detected") else (
                    "DEGRADED" if drift_result.get("drift_detected") else "AT_RISK"
                ),
                "uptime_pct": 99.7,
                "predictions_today": self.tick * 127 + random.randint(50, 200),
            },
        }


# Active WebSocket monitors
_monitors: Dict[str, FairnessMonitorState] = {}


@router.websocket("/ws/monitor/{domain}")
async def websocket_monitor(websocket: WebSocket, domain: str):
    """Real-time fairness monitoring via WebSocket (updates every 2 seconds)."""
    await websocket.accept()
    monitor_id = f"{domain}_{id(websocket)}"
    _monitors[monitor_id] = FairnessMonitorState(domain=domain)
    logger.info(f"WebSocket monitor started: {monitor_id}")

    try:
        while True:
            snapshot = _monitors[monitor_id].get_snapshot()
            await websocket.send_json(snapshot)
            await asyncio.sleep(2)
    except WebSocketDisconnect:
        logger.info(f"WebSocket monitor disconnected: {monitor_id}")
    except Exception as exc:
        logger.error(f"WebSocket error: {exc}")
    finally:
        _monitors.pop(monitor_id, None)


# ═══════════════════════════════════════════════
# Demo Data Endpoint (for hackathon demo)
# ═══════════════════════════════════════════════

@router.get("/demo-data/{domain}")
async def get_demo_data(domain: str) -> Dict[str, Any]:
    """Get pre-built demo data for hackathon demonstration."""
    if domain.lower() == "credit":
        return {
            "domain": "credit",
            "scenario": "Auto Loan Approval AI Model",
            "description": "Credit scoring model used for auto loan approvals showing disparate impact on race",
            "metrics": {
                "disparate_impact": 0.72,
                "dpd": 0.18,
                "eod": 0.15,
                "fairness_score": 68.0,
                "accuracy": 0.87,
            },
            "severity": "high",
            "group_metrics": [
                {"group": "White", "count": 5200, "selection_rate": 0.68, "tpr": 0.82, "fpr": 0.15, "accuracy": 0.88},
                {"group": "Black", "count": 2300, "selection_rate": 0.49, "tpr": 0.65, "fpr": 0.22, "accuracy": 0.81},
                {"group": "Hispanic", "count": 1800, "selection_rate": 0.52, "tpr": 0.69, "fpr": 0.19, "accuracy": 0.83},
                {"group": "Asian", "count": 700, "selection_rate": 0.71, "tpr": 0.84, "fpr": 0.12, "accuracy": 0.90},
            ],
            "cost_exposure": ComplianceCostCalculator.calculate_total_exposure(
                severity="high", domain="credit",
                disparate_impact=0.72, dpd=0.18, eod=0.15,
                portfolio_size=10000, avg_transaction_value=32000,
            ),
            "violations": ComplianceViolationDetector.detect_violations(
                domain="credit", sensitive_column="Race",
                disparate_impact=0.72, dpd=0.18, eod=0.15,
                fairness_score=68.0,
                group_metrics=[
                    {"group": "White", "selection_rate": 0.68},
                    {"group": "Black", "selection_rate": 0.49},
                    {"group": "Hispanic", "selection_rate": 0.52},
                    {"group": "Asian", "selection_rate": 0.71},
                ],
            ),
            "roi_projection": ComplianceCostCalculator.calculate_roi(
                before_severity="high", after_severity="low",
                domain="credit",
                disparate_impact_before=0.72, disparate_impact_after=0.88,
                dpd_before=0.18, dpd_after=0.04,
                eod_before=0.15, eod_after=0.05,
                fairness_score_before=68.0, fairness_score_after=91.0,
                portfolio_size=10000, avg_transaction_value=32000,
            ),
        }
    else:
        return {
            "domain": "hiring",
            "scenario": "Technical Hiring AI Resume Screener",
            "description": "AI-powered resume screening tool showing gender bias in engineering hiring pipeline",
            "metrics": {
                "disparate_impact": 0.67,
                "dpd": 0.22,
                "eod": 0.18,
                "fairness_score": 62.0,
                "accuracy": 0.85,
            },
            "severity": "high",
            "group_metrics": [
                {"group": "Male", "count": 4800, "selection_rate": 0.45, "tpr": 0.78, "fpr": 0.18, "accuracy": 0.86},
                {"group": "Female", "count": 3200, "selection_rate": 0.30, "tpr": 0.61, "fpr": 0.25, "accuracy": 0.80},
                {"group": "Non-Binary", "count": 500, "selection_rate": 0.28, "tpr": 0.58, "fpr": 0.27, "accuracy": 0.78},
            ],
            "hiring_funnel": {
                "stages": ["Applied", "Screened", "Interviewed", "Offered", "Hired"],
                "data": {
                    "Male": [4800, 3840, 1920, 960, 720],
                    "Female": [3200, 2240, 896, 384, 256],
                    "Non-Binary": [500, 325, 115, 45, 28],
                },
                "conversion_rates": {
                    "Male": {"screen": 0.80, "interview": 0.50, "offer": 0.50, "hire": 0.75},
                    "Female": {"screen": 0.70, "interview": 0.40, "offer": 0.43, "hire": 0.67},
                    "Non-Binary": {"screen": 0.65, "interview": 0.35, "offer": 0.39, "hire": 0.62},
                },
            },
            "cost_exposure": ComplianceCostCalculator.calculate_total_exposure(
                severity="high", domain="hiring",
                disparate_impact=0.67, dpd=0.22, eod=0.18,
                portfolio_size=8500, avg_transaction_value=85000,
            ),
            "violations": ComplianceViolationDetector.detect_violations(
                domain="hiring", sensitive_column="Gender",
                disparate_impact=0.67, dpd=0.22, eod=0.18,
                fairness_score=62.0,
                group_metrics=[
                    {"group": "Male", "selection_rate": 0.45},
                    {"group": "Female", "selection_rate": 0.30},
                    {"group": "Non-Binary", "selection_rate": 0.28},
                ],
            ),
            "roi_projection": ComplianceCostCalculator.calculate_roi(
                before_severity="high", after_severity="low",
                domain="hiring",
                disparate_impact_before=0.67, disparate_impact_after=0.85,
                dpd_before=0.22, dpd_after=0.06,
                eod_before=0.18, eod_after=0.05,
                fairness_score_before=62.0, fairness_score_after=89.0,
                portfolio_size=8500, avg_transaction_value=85000,
            ),
        }
