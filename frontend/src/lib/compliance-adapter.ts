import type { AnalysisPayload, GroupMetric, SensitiveFinding } from "@/types/analysis";

type ComplianceDemo = {
  domain: string;
  scenario: string;
  description: string;
  metrics: {
    disparate_impact: number;
    dpd: number;
    eod: number;
    fairness_score: number;
    accuracy: number;
  };
  violations: {
    violations_found: number;
    compliance_rate: number;
    overall_status: string;
    violations: Array<{
      regulation: string;
      violation_type: string;
      severity: string;
      description: string;
      section?: string;
      remediation?: string;
    }>;
    compliant?: Array<{ regulation: string; check: string; status: string }>;
  };
  group_metrics: GroupMetric[];
  cost_exposure?: any;
  roi_projection?: any;
};

export function adaptAnalysisToComplianceDemo(analysis: AnalysisPayload, fallbackDomain: string): ComplianceDemo {
  const summary = analysis.result?.fairness_summary;
  const findings = [
    ...asArray<SensitiveFinding>(analysis.result?.sensitive_findings),
    ...asArray<SensitiveFinding>(analysis.result?.intersectional_findings),
  ].filter(Boolean);
  const worstFinding = getWorstFinding(findings);
  const domain = normalizeDomain(analysis.result?.metadata?.domain || analysis.input?.domain || fallbackDomain);
  const dpd = clamp01(worstFinding?.demographic_parity_difference ?? scoreToGap(summary?.overall_fairness_score));
  const disparateImpact = clampRatio(summary?.disparate_impact ?? worstFinding?.disparate_impact ?? 1 - dpd);
  const eod = clamp01((worstFinding as any)?.equalized_odds_difference ?? (worstFinding as any)?.tpr_gap ?? dpd * 0.8);
  const fairnessScore = Number(summary?.overall_fairness_score ?? 0);
  const accuracy = Number(summary?.overall_accuracy ?? averageAccuracy(worstFinding?.group_metrics) ?? 0.87);
  const violations = buildComplianceFromMetrics(domain, disparateImpact, dpd, eod, fairnessScore, worstFinding);

  return {
    domain,
    scenario: `Latest Audit: ${analysis.input?.fileName ?? analysis.id}`,
    description: `Mapped from FairLens analysis generated ${new Date(analysis.createdAt).toLocaleDateString()}`,
    metrics: {
      disparate_impact: disparateImpact,
      dpd,
      eod,
      fairness_score: fairnessScore,
      accuracy,
    },
    violations,
    group_metrics: asArray<GroupMetric>(worstFinding?.group_metrics),
    cost_exposure: (analysis.result as any)?.cost_exposure,
    roi_projection: (analysis as any)?.mitigationResult?.roi_projection,
  };
}

function getWorstFinding(findings: SensitiveFinding[]) {
  return asArray<SensitiveFinding>(findings).filter(Boolean).sort((left, right) => {
    const scoreGap = left.fairness_score - right.fairness_score;
    if (scoreGap !== 0) return scoreGap;
    return left.disparate_impact - right.disparate_impact;
  })[0] ?? null;
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value : [];
}

function normalizeDomain(domain: string) {
  const lowered = String(domain || "").toLowerCase();
  if (lowered.includes("hir")) return "hiring";
  if (lowered.includes("credit") || lowered.includes("fin")) return "credit";
  return lowered || "credit";
}

function buildComplianceFromMetrics(
  domain: string,
  disparateImpact: number,
  dpd: number,
  eod: number,
  fairnessScore: number,
  finding: SensitiveFinding | null,
) {
  const violations: ComplianceDemo["violations"]["violations"] = [];
  const regulation = domain === "hiring" ? "EEOC" : "ECOA";
  const section = domain === "hiring" ? "Title VII / NYC LL144" : "15 U.S.C. 1691(a)";
  const subject = finding?.sensitive_column ? ` for ${finding.sensitive_column}` : "";

  if (disparateImpact < 0.8) {
    violations.push({
      regulation,
      violation_type: "Disparate Impact",
      severity: disparateImpact < 0.7 ? "HIGH" : "MODERATE",
      section,
      description: `Selection-rate ratio${subject} is ${disparateImpact.toFixed(3)}, below the 0.80 four-fifths threshold.`,
      remediation: "Apply threshold optimization or reweighing, then regenerate the audit report.",
    });
  }

  if (dpd > 0.1) {
    violations.push({
      regulation,
      violation_type: "Demographic Parity Gap",
      severity: dpd > 0.2 ? "HIGH" : "MODERATE",
      section,
      description: `Approval-rate gap${subject} is ${(dpd * 100).toFixed(1)}%, above the 10% review threshold.`,
      remediation: "Inspect training representation and rebalance the affected groups before deployment.",
    });
  }

  if (eod > 0.1) {
    violations.push({
      regulation,
      violation_type: "Equal Opportunity Gap",
      severity: eod > 0.2 ? "HIGH" : "MODERATE",
      section,
      description: `True-positive behavior differs by ${(eod * 100).toFixed(1)}%, which can create uneven qualified approvals.`,
      remediation: "Calibrate decision thresholds per group and recheck subgroup recall.",
    });
  }

  if (fairnessScore < 75 && violations.length === 0) {
    violations.push({
      regulation,
      violation_type: "Fairness Score Review",
      severity: "MODERATE",
      section,
      description: `Overall fairness score is ${fairnessScore.toFixed(1)}%, below the safe-release band.`,
      remediation: "Review sensitive slices and apply the mitigation preview.",
    });
  }

  const totalChecks = 4;
  const complianceRate = Math.max(0, Math.round(((totalChecks - violations.length) / totalChecks) * 100));

  return {
    violations_found: violations.length,
    compliance_rate: complianceRate,
    overall_status: violations.length ? "NON-COMPLIANT" : "COMPLIANT",
    violations,
    compliant: violations.length
      ? [{ regulation: "SR 11-7", check: "Audit artifacts generated", status: "PASS" }]
      : [
          { regulation, check: "Four-fifths rule", status: "PASS" },
          { regulation: "SR 11-7", check: "Audit artifacts generated", status: "PASS" },
        ],
  };
}

function scoreToGap(score?: number) {
  if (typeof score !== "number") return 0.18;
  return Math.max(0, Math.min(0.35, (100 - score) / 140));
}

function averageAccuracy(groups?: GroupMetric[]) {
  const values = asArray<GroupMetric>(groups).map((group) => group.accuracy).filter((value): value is number => typeof value === "number");
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function clampRatio(value: number) {
  return Math.max(0, Math.min(1.5, Number(value) || 0));
}
