"""
compliance_engine.py — Domain-Specific Regulatory Compliance Engine
Maps fairness metrics to ECOA/FCRA (Financial Credit) and EEOC/NYC 144 (Hiring) regulations.
Generates violation reports with specific regulatory citations and remediation steps.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional
from datetime import datetime

logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════════
# Regulatory Framework Definitions
# ═══════════════════════════════════════════════

FINANCIAL_REGULATIONS = {
    "ECOA": {
        "full_name": "Equal Credit Opportunity Act",
        "code": "15 U.S.C. § 1691",
        "agency": "CFPB",
        "description": "Prohibits discrimination in credit transactions based on race, color, religion, national origin, sex, marital status, or age.",
        "protected_classes": ["race", "color", "religion", "national_origin", "sex", "marital_status", "age"],
        "thresholds": {
            "disparate_impact": 0.80,
            "demographic_parity_difference": 0.10,
        },
        "max_fine_per_violation": 10000,
        "class_action_multiplier": 500000,
    },
    "FCRA": {
        "full_name": "Fair Credit Reporting Act",
        "code": "15 U.S.C. § 1681",
        "agency": "FTC / CFPB",
        "description": "Requires accurate and fair credit reporting. Adverse action notices must explain specific reasons for denial.",
        "requirements": ["adverse_action_notice", "accuracy", "dispute_resolution"],
    },
    "SR_11_7": {
        "full_name": "OCC/Fed SR 11-7 Model Risk Management",
        "code": "SR 11-7",
        "agency": "OCC / Federal Reserve",
        "description": "Requires validation and ongoing monitoring of models used in banking decisions.",
        "requirements": ["model_validation", "ongoing_monitoring", "documentation", "independent_review"],
    },
    "CFPB_ECOA_BUFFER": {
        "full_name": "CFPB Enforcement Precedent",
        "code": "CFPB Bulletin 2022-03",
        "agency": "CFPB",
        "description": "CFPB has signaled that use of AI/ML in credit decisions requires explainability and non-discrimination testing.",
        "precedent_fines": [
            {"entity": "Ally Financial", "amount": 98000000, "year": 2013},
            {"entity": "Honda Finance", "amount": 25000000, "year": 2015},
            {"entity": "National City Bank", "amount": 35400000, "year": 2014},
        ],
    },
}

HIRING_REGULATIONS = {
    "EEOC_TITLE_VII": {
        "full_name": "Title VII of the Civil Rights Act of 1964",
        "code": "42 U.S.C. § 2000e",
        "agency": "EEOC",
        "description": "Prohibits employment discrimination based on race, color, religion, sex, or national origin.",
        "four_fifths_rule": 0.80,
        "protected_classes": ["race", "color", "religion", "sex", "national_origin"],
    },
    "ADEA": {
        "full_name": "Age Discrimination in Employment Act",
        "code": "29 U.S.C. § 621",
        "agency": "EEOC",
        "description": "Protects individuals 40+ from age-based employment discrimination.",
        "protected_age_threshold": 40,
    },
    "NYC_LOCAL_LAW_144": {
        "full_name": "NYC Local Law 144 (Automated Employment Decision Tools)",
        "code": "NYC Admin. Code § 20-870",
        "agency": "NYC DCWP",
        "description": "Requires annual bias audits of automated employment decision tools (AEDTs) used in NYC hiring.",
        "requirements": [
            "Annual independent bias audit",
            "Published audit results on employer website",
            "Notice to candidates that AEDT is being used",
            "Accommodations for alternative selection process",
        ],
        "effective_date": "2023-07-05",
        "audit_frequency": "annual",
        "penalty_per_violation": 1500,
    },
    "ADA": {
        "full_name": "Americans with Disabilities Act",
        "code": "42 U.S.C. § 12101",
        "agency": "EEOC",
        "description": "Prohibits discrimination against qualified individuals with disabilities in employment.",
    },
}


# ═══════════════════════════════════════════════
# Cost Calculator Models
# ═══════════════════════════════════════════════

class ComplianceCostCalculator:
    """Actuarial model for estimating bias-related financial exposure."""

    # Settlement data from DOJ/CFPB/EEOC precedent
    LITIGATION_BASE_COSTS = {
        "low": {"min": 50000, "max": 250000, "probability": 0.15},
        "moderate": {"min": 250000, "max": 750000, "probability": 0.35},
        "high": {"min": 500000, "max": 1500000, "probability": 0.55},
        "severe": {"min": 1000000, "max": 5000000, "probability": 0.75},
    }

    REGULATORY_FINE_MODELS = {
        "credit": {
            "base_fine": 500000,
            "per_violation_multiplier": 100,
            "cfpb_enforcement_factor": 2.5,
        },
        "hiring": {
            "base_fine": 100000,
            "per_violation_multiplier": 1500,  # NYC LL144
            "eeoc_class_action_factor": 3.0,
        },
    }

    REPUTATION_DAMAGE_MODEL = {
        "customer_churn_rate": {
            "low": 0.01,
            "moderate": 0.03,
            "high": 0.07,
            "severe": 0.12,
        },
        "brand_recovery_months": {
            "low": 3,
            "moderate": 6,
            "high": 12,
            "severe": 24,
        },
    }

    @classmethod
    def calculate_total_exposure(
        cls,
        severity: str,
        domain: str,
        disparate_impact: float,
        dpd: float,
        eod: float,
        portfolio_size: int = 10000,
        avg_transaction_value: float = 25000.0,
        affected_group_pct: float = 0.20,
    ) -> Dict[str, Any]:
        """Calculate total financial exposure from bias."""
        severity = severity.lower() if severity else "moderate"
        domain = domain.lower() if domain else "credit"

        # 1. Litigation Risk
        litigation = cls._calc_litigation_risk(severity, portfolio_size, affected_group_pct)

        # 2. Regulatory Fines
        regulatory = cls._calc_regulatory_fines(
            severity, domain, portfolio_size, affected_group_pct, disparate_impact
        )

        # 3. Reputation/Brand Damage
        reputation = cls._calc_reputation_damage(
            severity, portfolio_size, avg_transaction_value
        )

        # 4. Opportunity Cost (false negatives on qualified applicants)
        opportunity = cls._calc_opportunity_cost(
            dpd, portfolio_size, avg_transaction_value, affected_group_pct
        )

        total = (
            litigation["expected_cost"]
            + regulatory["expected_fine"]
            + reputation["estimated_revenue_loss"]
            + opportunity["estimated_loss"]
        )

        return {
            "total_annual_exposure": round(total, 2),
            "litigation_risk": litigation,
            "regulatory_fines": regulatory,
            "reputation_damage": reputation,
            "opportunity_cost": opportunity,
            "severity": severity,
            "domain": domain,
            "inputs": {
                "disparate_impact": disparate_impact,
                "dpd": dpd,
                "eod": eod,
                "portfolio_size": portfolio_size,
                "avg_transaction_value": avg_transaction_value,
            },
            "calculation_methodology": "Actuarial model based on DOJ/CFPB/EEOC settlement precedent data",
        }

    @classmethod
    def _calc_litigation_risk(
        cls, severity: str, portfolio_size: int, affected_pct: float
    ) -> Dict[str, Any]:
        costs = cls.LITIGATION_BASE_COSTS.get(severity, cls.LITIGATION_BASE_COSTS["moderate"])
        scale_factor = min(5.0, portfolio_size / 5000)
        min_cost = costs["min"] * scale_factor
        max_cost = costs["max"] * scale_factor
        probability = costs["probability"]
        expected = (min_cost + max_cost) / 2 * probability
        affected_individuals = int(portfolio_size * affected_pct)

        return {
            "min_cost": round(min_cost, 2),
            "max_cost": round(max_cost, 2),
            "probability": probability,
            "expected_cost": round(expected, 2),
            "affected_individuals": affected_individuals,
            "case_type": "Class action" if affected_individuals > 100 else "Individual suit",
            "precedent_reference": "Based on DOJ/CFPB settlement data 2013-2025",
        }

    @classmethod
    def _calc_regulatory_fines(
        cls, severity: str, domain: str, portfolio_size: int,
        affected_pct: float, disparate_impact: float,
    ) -> Dict[str, Any]:
        model = cls.REGULATORY_FINE_MODELS.get(domain, cls.REGULATORY_FINE_MODELS["credit"])
        affected = int(portfolio_size * affected_pct)
        base = model["base_fine"]
        per_violation = model["per_violation_multiplier"] * affected

        severity_multiplier = {"low": 0.5, "moderate": 1.0, "high": 2.0, "severe": 3.5}.get(severity, 1.0)
        di_penalty = max(0, (0.80 - disparate_impact) * 10)  # Higher penalty for lower DI

        expected_fine = (base + per_violation) * severity_multiplier * (1 + di_penalty)
        applicable_regs = list(FINANCIAL_REGULATIONS.keys()) if domain == "credit" else list(HIRING_REGULATIONS.keys())

        return {
            "base_fine": round(base, 2),
            "per_violation_component": round(per_violation, 2),
            "severity_multiplier": severity_multiplier,
            "expected_fine": round(expected_fine, 2),
            "applicable_regulations": applicable_regs,
            "enforcement_agency": "CFPB" if domain == "credit" else "EEOC / NYC DCWP",
        }

    @classmethod
    def _calc_reputation_damage(
        cls, severity: str, portfolio_size: int, avg_value: float,
    ) -> Dict[str, Any]:
        churn = cls.REPUTATION_DAMAGE_MODEL["customer_churn_rate"].get(severity, 0.03)
        recovery = cls.REPUTATION_DAMAGE_MODEL["brand_recovery_months"].get(severity, 6)
        affected_customers = int(portfolio_size * churn)
        revenue_loss = affected_customers * avg_value * 0.1  # 10% of transaction value as margin

        return {
            "churn_rate": churn,
            "affected_customers": affected_customers,
            "estimated_revenue_loss": round(revenue_loss, 2),
            "brand_recovery_months": recovery,
            "impact_description": f"Estimated {churn*100:.1f}% customer churn over {recovery} months",
        }

    @classmethod
    def _calc_opportunity_cost(
        cls, dpd: float, portfolio_size: int, avg_value: float, affected_pct: float,
    ) -> Dict[str, Any]:
        # False negatives on qualified applicants from disadvantaged groups
        false_neg_rate = abs(dpd) * affected_pct
        missed_approvals = int(portfolio_size * false_neg_rate)
        loss_per_missed = avg_value * 0.05  # 5% margin on each missed approval
        total_loss = missed_approvals * loss_per_missed

        return {
            "false_negative_rate": round(false_neg_rate, 4),
            "missed_qualified_applicants": missed_approvals,
            "estimated_loss": round(total_loss, 2),
            "description": f"{missed_approvals} qualified applicants from disadvantaged groups incorrectly rejected",
        }

    @classmethod
    def calculate_roi(
        cls,
        before_severity: str,
        after_severity: str,
        domain: str,
        disparate_impact_before: float,
        disparate_impact_after: float,
        dpd_before: float,
        dpd_after: float,
        eod_before: float,
        eod_after: float,
        fairness_score_before: float,
        fairness_score_after: float,
        portfolio_size: int = 10000,
        avg_transaction_value: float = 25000.0,
    ) -> Dict[str, Any]:
        """Calculate ROI of bias mitigation."""
        before = cls.calculate_total_exposure(
            before_severity, domain, disparate_impact_before,
            dpd_before, eod_before, portfolio_size, avg_transaction_value,
        )
        after = cls.calculate_total_exposure(
            after_severity, domain, disparate_impact_after,
            dpd_after, eod_after, portfolio_size, avg_transaction_value,
        )

        savings = before["total_annual_exposure"] - after["total_annual_exposure"]
        pct_reduction = (savings / before["total_annual_exposure"] * 100) if before["total_annual_exposure"] > 0 else 0

        return {
            "before": {
                "total_exposure": before["total_annual_exposure"],
                "fairness_score": fairness_score_before,
                "disparate_impact": disparate_impact_before,
                "severity": before_severity,
                "breakdown": {
                    "litigation": before["litigation_risk"]["expected_cost"],
                    "regulatory": before["regulatory_fines"]["expected_fine"],
                    "reputation": before["reputation_damage"]["estimated_revenue_loss"],
                    "opportunity": before["opportunity_cost"]["estimated_loss"],
                },
            },
            "after": {
                "total_exposure": after["total_annual_exposure"],
                "fairness_score": fairness_score_after,
                "disparate_impact": disparate_impact_after,
                "severity": after_severity,
                "breakdown": {
                    "litigation": after["litigation_risk"]["expected_cost"],
                    "regulatory": after["regulatory_fines"]["expected_fine"],
                    "reputation": after["reputation_damage"]["estimated_revenue_loss"],
                    "opportunity": after["opportunity_cost"]["estimated_loss"],
                },
            },
            "savings": {
                "total_annual_savings": round(savings, 2),
                "percentage_reduction": round(pct_reduction, 1),
                "fairness_improvement": round(fairness_score_after - fairness_score_before, 2),
            },
            "recommendation": (
                "Strong ROI — mitigation investment justified"
                if pct_reduction > 50
                else "Moderate ROI — mitigation recommended"
                if pct_reduction > 20
                else "Marginal ROI — evaluate cost-benefit carefully"
            ),
        }


# ═══════════════════════════════════════════════
# Compliance Violation Detector
# ═══════════════════════════════════════════════

class ComplianceViolationDetector:
    """Detect specific regulatory violations from fairness metrics."""

    @classmethod
    def detect_violations(
        cls,
        domain: str,
        sensitive_column: str,
        disparate_impact: float,
        dpd: float,
        eod: float,
        fairness_score: float,
        group_metrics: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """Detect all applicable regulatory violations."""
        domain = domain.lower() if domain else "credit"
        violations = []
        compliant_items = []

        if domain == "credit":
            violations, compliant_items = cls._check_credit_violations(
                sensitive_column, disparate_impact, dpd, eod, fairness_score, group_metrics
            )
        else:
            violations, compliant_items = cls._check_hiring_violations(
                sensitive_column, disparate_impact, dpd, eod, fairness_score, group_metrics
            )

        total_checks = len(violations) + len(compliant_items)
        compliance_rate = len(compliant_items) / total_checks * 100 if total_checks > 0 else 100

        return {
            "domain": domain,
            "sensitive_column": sensitive_column,
            "total_checks": total_checks,
            "violations_found": len(violations),
            "compliant_items": len(compliant_items),
            "compliance_rate": round(compliance_rate, 1),
            "overall_status": "COMPLIANT" if not violations else "NON-COMPLIANT",
            "violations": violations,
            "compliant": compliant_items,
            "audit_timestamp": datetime.utcnow().isoformat(),
        }

    @classmethod
    def _check_credit_violations(
        cls, sensitive_col, di, dpd, eod, score, groups
    ) -> tuple:
        violations = []
        compliant = []

        # ECOA Disparate Impact (4/5ths rule)
        if di < 0.80:
            violations.append({
                "regulation": "ECOA",
                "section": "15 U.S.C. § 1691(a)",
                "violation_type": "Disparate Impact",
                "description": f"Selection rate ratio ({di:.3f}) falls below the 4/5ths (80%) threshold",
                "severity": "HIGH" if di < 0.60 else "MODERATE",
                "metric_value": round(di, 4),
                "threshold": 0.80,
                "remediation": "Apply threshold optimization or reweighing to equalize selection rates across protected groups",
                "legal_reference": "Griggs v. Duke Power Co., 401 U.S. 424 (1971)",
            })
        else:
            compliant.append({
                "regulation": "ECOA",
                "check": "Disparate Impact (4/5ths rule)",
                "status": "PASS",
                "value": round(di, 4),
                "threshold": 0.80,
            })

        # ECOA Demographic Parity
        if dpd > 0.10:
            violations.append({
                "regulation": "ECOA",
                "section": "Reg B, 12 CFR § 1002",
                "violation_type": "Demographic Parity Disparity",
                "description": f"Approval rate difference ({dpd:.4f}) exceeds 10% threshold across {sensitive_col} groups",
                "severity": "HIGH" if dpd > 0.20 else "MODERATE",
                "metric_value": round(dpd, 4),
                "threshold": 0.10,
                "remediation": "Review credit scoring model for proxy variables correlated with protected attributes",
            })
        else:
            compliant.append({
                "regulation": "ECOA",
                "check": "Demographic Parity",
                "status": "PASS",
                "value": round(dpd, 4),
                "threshold": 0.10,
            })

        # FCRA Adverse Action
        if eod > 0.10:
            violations.append({
                "regulation": "FCRA",
                "section": "15 U.S.C. § 1681m(a)",
                "violation_type": "Equalized Odds Violation",
                "description": f"Error rates differ significantly ({eod:.4f}) across {sensitive_col} groups — adverse actions may disproportionately affect protected classes",
                "severity": "HIGH" if eod > 0.20 else "MODERATE",
                "metric_value": round(eod, 4),
                "threshold": 0.10,
                "remediation": "Equalize TPR/FPR across groups; ensure adverse action notices accurately reflect model factors",
            })
        else:
            compliant.append({
                "regulation": "FCRA",
                "check": "Equalized Odds (Error Rate Parity)",
                "status": "PASS",
                "value": round(eod, 4),
                "threshold": 0.10,
            })

        # SR 11-7 Model Risk
        if score < 75:
            violations.append({
                "regulation": "SR 11-7",
                "section": "OCC 2011-12",
                "violation_type": "Model Risk — Inadequate Fairness Validation",
                "description": f"Overall fairness score ({score:.1f}%) indicates unacceptable model risk",
                "severity": "HIGH",
                "metric_value": round(score, 2),
                "threshold": 75.0,
                "remediation": "Conduct independent model review; implement ongoing monitoring per SR 11-7 requirements",
            })
        else:
            compliant.append({
                "regulation": "SR 11-7",
                "check": "Model Fairness Validation",
                "status": "PASS",
                "value": round(score, 2),
                "threshold": 75.0,
            })

        # Redlining Indicator (proxy check)
        cls._check_redlining_indicators(sensitive_col, groups, violations, compliant)

        return violations, compliant

    @classmethod
    def _check_hiring_violations(
        cls, sensitive_col, di, dpd, eod, score, groups
    ) -> tuple:
        violations = []
        compliant = []

        # EEOC 4/5ths Rule
        if di < 0.80:
            violations.append({
                "regulation": "EEOC / Title VII",
                "section": "42 U.S.C. § 2000e-2",
                "violation_type": "4/5ths Rule Violation",
                "description": f"Hiring rate ratio ({di:.3f}) falls below the EEOC 4/5ths (80%) threshold for {sensitive_col}",
                "severity": "HIGH" if di < 0.60 else "MODERATE",
                "metric_value": round(di, 4),
                "threshold": 0.80,
                "remediation": "Review selection criteria; conduct job-relatedness validation per Uniform Guidelines (29 CFR Part 1607)",
                "legal_reference": "Uniform Guidelines on Employee Selection Procedures (1978)",
            })
        else:
            compliant.append({
                "regulation": "EEOC / Title VII",
                "check": "4/5ths Rule (Adverse Impact)",
                "status": "PASS",
                "value": round(di, 4),
                "threshold": 0.80,
            })

        # NYC Local Law 144
        violations.append({
            "regulation": "NYC Local Law 144",
            "section": "NYC Admin. Code § 20-871(b)",
            "violation_type": "AEDT Audit Requirement",
            "description": "Annual bias audit must be conducted by an independent auditor and results published",
            "severity": "INFO",
            "metric_value": None,
            "threshold": None,
            "remediation": "This audit satisfies the LL144 bias audit requirement. Publish summary results on employer website within 6 months.",
        }) if score > 0 else None  # Always flag LL144 as informational

        # ADEA Age Check
        sensitive_lower = sensitive_col.lower()
        if "age" in sensitive_lower:
            age_groups = [g for g in groups if g.get("group", "")]
            older_groups = []
            younger_groups = []
            for g in age_groups:
                group_name = str(g.get("group", "")).lower()
                if any(x in group_name for x in ["40", "50", "60", "older", "senior"]):
                    older_groups.append(g)
                else:
                    younger_groups.append(g)

            if older_groups and younger_groups:
                avg_older_sr = sum(g.get("selection_rate", 0) for g in older_groups) / len(older_groups) if older_groups else 0
                avg_younger_sr = sum(g.get("selection_rate", 0) for g in younger_groups) / len(younger_groups) if younger_groups else 0

                if avg_younger_sr > 0 and (avg_older_sr / avg_younger_sr) < 0.80:
                    violations.append({
                        "regulation": "ADEA",
                        "section": "29 U.S.C. § 623",
                        "violation_type": "Age Discrimination Indicator",
                        "description": f"Selection rate for 40+ age group ({avg_older_sr:.3f}) is significantly lower than younger groups ({avg_younger_sr:.3f})",
                        "severity": "HIGH",
                        "metric_value": round(avg_older_sr / avg_younger_sr if avg_younger_sr > 0 else 0, 4),
                        "threshold": 0.80,
                        "remediation": "Review age-correlated features (years of experience requirements, graduation year filters); validate job-relatedness",
                    })

        # Hiring Funnel Leakage
        if dpd > 0.10:
            violations.append({
                "regulation": "EEOC / Title VII",
                "section": "Uniform Guidelines § 1607.4(D)",
                "violation_type": "Selection Rate Disparity",
                "description": f"Significant disparity in selection rates ({dpd:.4f}) across {sensitive_col} groups indicates hiring funnel leakage",
                "severity": "HIGH" if dpd > 0.20 else "MODERATE",
                "metric_value": round(dpd, 4),
                "threshold": 0.10,
                "remediation": "Analyze each hiring stage separately; implement structured interviews and blind resume review",
            })

        return violations, compliant

    @classmethod
    def _check_redlining_indicators(cls, sensitive_col, groups, violations, compliant):
        """Check for potential redlining patterns in geographic data."""
        geo_keywords = ["zip", "postal", "region", "state", "county", "area", "location", "city"]
        if any(kw in sensitive_col.lower() for kw in geo_keywords):
            if groups and len(groups) > 2:
                rates = [g.get("selection_rate", 0) for g in groups]
                if rates:
                    max_rate = max(rates)
                    min_rate = min(rates)
                    ratio = min_rate / max_rate if max_rate > 0 else 1.0
                    if ratio < 0.70:
                        violations.append({
                            "regulation": "ECOA / Fair Housing Act",
                            "section": "42 U.S.C. § 3605",
                            "violation_type": "Potential Redlining",
                            "description": f"Geographic selection rate disparity ({ratio:.3f}) suggests potential redlining pattern across {sensitive_col}",
                            "severity": "CRITICAL",
                            "metric_value": round(ratio, 4),
                            "threshold": 0.70,
                            "remediation": "Conduct geographic lending pattern analysis; review for proxy discrimination through ZIP codes",
                        })
                        return
            compliant.append({
                "regulation": "ECOA / Fair Housing Act",
                "check": "Redlining Pattern Check",
                "status": "PASS",
                "value": None,
            })


# ═══════════════════════════════════════════════
# Counterfactual Fairness Explorer
# ═══════════════════════════════════════════════

class CounterfactualExplorer:
    """What-if simulation: what would happen if protected attributes were different?"""

    @classmethod
    def simulate(
        cls,
        group_metrics: List[Dict[str, Any]],
        current_di: float,
        current_dpd: float,
        current_eod: float,
        domain: str = "credit",
    ) -> Dict[str, Any]:
        """Simulate fairness outcomes under different scenarios."""
        scenarios = []

        # Scenario 1: Perfect Parity
        scenarios.append({
            "name": "Perfect Demographic Parity",
            "description": "All groups have equal selection rates",
            "simulated_di": 1.0,
            "simulated_dpd": 0.0,
            "simulated_eod": current_eod * 0.3,
            "fairness_score": 95.0,
            "accuracy_cost": "2-5% decrease expected",
            "feasibility": "Achievable with threshold optimization",
        })

        # Scenario 2: 4/5ths Rule Compliance
        scenarios.append({
            "name": "Regulatory Minimum (4/5ths Rule)",
            "description": "Disparate impact meets the 0.80 threshold",
            "simulated_di": 0.82,
            "simulated_dpd": current_dpd * 0.5,
            "simulated_eod": current_eod * 0.6,
            "fairness_score": 82.0,
            "accuracy_cost": "1-3% decrease expected",
            "feasibility": "Most practical — recommended starting point",
        })

        # Scenario 3: No Intervention
        scenarios.append({
            "name": "No Intervention (Current State)",
            "description": "Current model without any bias correction",
            "simulated_di": current_di,
            "simulated_dpd": current_dpd,
            "simulated_eod": current_eod,
            "fairness_score": max(0, 100 - current_dpd * 40 - current_eod * 35 - max(0, 0.80 - current_di) * 50),
            "accuracy_cost": "None",
            "feasibility": "Current state — risk of litigation",
        })

        # Scenario 4: Aggressive Correction
        scenarios.append({
            "name": "Aggressive Correction",
            "description": "Near-perfect equalization of all fairness metrics",
            "simulated_di": 0.95,
            "simulated_dpd": 0.02,
            "simulated_eod": 0.03,
            "fairness_score": 97.0,
            "accuracy_cost": "5-8% decrease expected",
            "feasibility": "Significant accuracy tradeoff — evaluate business impact",
        })

        # Calculate cost impact for each scenario
        calc = ComplianceCostCalculator()
        for scenario in scenarios:
            sev = "low" if scenario["simulated_di"] >= 0.80 else "high"
            exposure = calc.calculate_total_exposure(
                severity=sev, domain=domain,
                disparate_impact=scenario["simulated_di"],
                dpd=scenario["simulated_dpd"],
                eod=scenario["simulated_eod"],
            )
            scenario["projected_annual_exposure"] = exposure["total_annual_exposure"]

        return {
            "current_state": {
                "disparate_impact": current_di,
                "dpd": current_dpd,
                "eod": current_eod,
            },
            "scenarios": scenarios,
            "recommendation": "Regulatory Minimum (4/5ths Rule)" if current_di < 0.80 else "Perfect Demographic Parity",
        }


# ═══════════════════════════════════════════════
# Bias Drift Detection (CUSUM)
# ═══════════════════════════════════════════════

class BiasDriftDetector:
    """CUSUM-based bias drift detection for real-time monitoring."""

    @classmethod
    def detect_drift(
        cls,
        historical_di_values: List[float],
        threshold: float = 0.05,
        slack: float = 0.02,
    ) -> Dict[str, Any]:
        """Apply CUSUM algorithm to detect bias metric drift."""
        if len(historical_di_values) < 3:
            return {
                "drift_detected": False,
                "message": "Insufficient data for drift detection (minimum 3 data points required)",
                "data_points": len(historical_di_values),
            }

        # Calculate CUSUM
        mean = sum(historical_di_values[:max(5, len(historical_di_values) // 3)]) / max(5, len(historical_di_values) // 3)
        cusum_pos = [0.0]
        cusum_neg = [0.0]
        drift_points = []

        for i, val in enumerate(historical_di_values):
            deviation = val - mean
            cusum_pos.append(max(0, cusum_pos[-1] + deviation - slack))
            cusum_neg.append(min(0, cusum_neg[-1] + deviation + slack))

            if cusum_pos[-1] > threshold or abs(cusum_neg[-1]) > threshold:
                drift_points.append({
                    "index": i,
                    "value": val,
                    "direction": "increasing_bias" if cusum_pos[-1] > threshold else "decreasing_bias",
                    "cusum_value": cusum_pos[-1] if cusum_pos[-1] > threshold else cusum_neg[-1],
                })

        return {
            "drift_detected": len(drift_points) > 0,
            "baseline_mean": round(mean, 4),
            "drift_points": drift_points,
            "cusum_positive": [round(v, 4) for v in cusum_pos[1:]],
            "cusum_negative": [round(v, 4) for v in cusum_neg[1:]],
            "threshold": threshold,
            "total_observations": len(historical_di_values),
            "current_value": historical_di_values[-1] if historical_di_values else None,
            "alert_level": (
                "CRITICAL" if len(drift_points) >= 3
                else "WARNING" if len(drift_points) >= 1
                else "NORMAL"
            ),
        }


# ═══════════════════════════════════════════════
# Bias Source Attribution
# ═══════════════════════════════════════════════

class BiasSourceAttributor:
    """Attribute bias to specific sources: label, feature, or sampling."""

    @classmethod
    def attribute(
        cls,
        group_metrics: List[Dict[str, Any]],
        dpd: float,
        eod: float,
        disparate_impact: float,
        explainability_data: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Determine the most likely sources of observed bias."""
        sources = []

        # 1. Label Bias (different base rates indicate label bias)
        if group_metrics:
            selection_rates = [g.get("selection_rate", 0) for g in group_metrics]
            if max(selection_rates) > 0:
                rate_ratio = min(selection_rates) / max(selection_rates)
                if rate_ratio < 0.70:
                    sources.append({
                        "source": "Label Bias",
                        "confidence": "high",
                        "contribution_pct": 45,
                        "description": "Significant difference in positive label rates across groups suggests historical labeling bias",
                        "evidence": f"Selection rate ratio: {rate_ratio:.3f} (min/max across groups)",
                        "remediation": "Review labeling criteria; consider rebalancing labels or applying sampling correction",
                    })
                elif rate_ratio < 0.85:
                    sources.append({
                        "source": "Label Bias",
                        "confidence": "medium",
                        "contribution_pct": 25,
                        "description": "Moderate difference in label distribution across groups",
                        "evidence": f"Selection rate ratio: {rate_ratio:.3f}",
                        "remediation": "Audit label generation process for systemic patterns",
                    })

        # 2. Feature Bias (proxy features)
        if explainability_data and explainability_data.get("global_feature_importance"):
            top_features = explainability_data["global_feature_importance"][:5]
            proxy_suspects = []
            for feat in top_features:
                name = feat.get("feature", "").lower()
                if any(kw in name for kw in ["zip", "postal", "address", "school", "name", "neighborhood"]):
                    proxy_suspects.append(feat["feature"])

            if proxy_suspects:
                sources.append({
                    "source": "Feature Bias (Proxy Discrimination)",
                    "confidence": "high",
                    "contribution_pct": 35,
                    "description": f"Proxy features detected: {', '.join(proxy_suspects)}",
                    "evidence": "These features may encode protected attribute information",
                    "remediation": "Remove or decorrelate proxy features; apply feature fairness constraints",
                })

        # 3. Sampling Bias
        if group_metrics:
            counts = [g.get("count", 0) for g in group_metrics]
            if counts and max(counts) > 0:
                imbalance = min(counts) / max(counts) if max(counts) > 0 else 1.0
                if imbalance < 0.30:
                    sources.append({
                        "source": "Sampling Bias",
                        "confidence": "high",
                        "contribution_pct": 30,
                        "description": f"Severe group size imbalance ({min(counts)} vs {max(counts)}) may cause unreliable metrics for minority groups",
                        "evidence": f"Group size ratio: {imbalance:.3f}",
                        "remediation": "Collect more data for underrepresented groups; apply oversampling or stratified training",
                    })
                elif imbalance < 0.50:
                    sources.append({
                        "source": "Sampling Bias",
                        "confidence": "medium",
                        "contribution_pct": 20,
                        "description": "Moderate group size imbalance may affect metric reliability",
                        "evidence": f"Group size ratio: {imbalance:.3f}",
                        "remediation": "Consider stratified cross-validation; monitor minority group metrics separately",
                    })

        # Default if no specific source identified
        if not sources:
            sources.append({
                "source": "Model Architecture",
                "confidence": "low",
                "contribution_pct": 100,
                "description": "Bias may originate from model architecture or training process rather than data",
                "evidence": "No clear data-level bias source identified",
                "remediation": "Consider in-processing fairness constraints during model training",
            })

        # Normalize contribution percentages
        total = sum(s["contribution_pct"] for s in sources)
        if total > 0:
            for s in sources:
                s["contribution_pct"] = round(s["contribution_pct"] / total * 100, 1)

        return {
            "sources": sorted(sources, key=lambda x: x["contribution_pct"], reverse=True),
            "primary_source": sources[0]["source"] if sources else "Unknown",
            "total_sources_identified": len(sources),
        }
