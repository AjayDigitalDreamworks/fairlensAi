from __future__ import annotations

from typing import Any, Dict, List


def build_report_markdown(result: Dict[str, Any]) -> str:
    meta = result["metadata"]
    fairness = result["fairness_summary"]
    explanation = result.get("explanation", {})
    lines = [
        f"# FairAI Audit Report",
        f"- Source: {meta['source_name']}",
        f"- Domain: {meta.get('domain', 'auto')}",
        f"- Audit mode: {meta.get('audit_mode', 'full')}",
        f"- Rows: {meta['rows']}",
        f"- Target: {meta['target_column']}",
        f"- Sensitive columns: {', '.join(meta['sensitive_columns'])}",
        f"- Selected model: {result.get('model_summary', {}).get('selected_model')}",
        f"- Baseline fairness score: {fairness.get('overall_fairness_score')}",
        f"- Corrected fairness score: {fairness.get('corrected_fairness_score')}",
        f"- Risk level: {fairness.get('risk_level')}",
        f"- Recommendation: {result.get('recommendation')}",
        "",
        "## Executive Summary",
        explanation.get("executive_summary", "No executive summary available."),
        "",
        "## Detection Confidence",
        f"- Target confidence: {result.get('detection', {}).get('confidence', {}).get('target')}",
        f"- Prediction confidence: {result.get('detection', {}).get('confidence', {}).get('prediction')}",
        f"- Sensitive confidence: {result.get('detection', {}).get('confidence', {}).get('sensitive')}",
        "",
        "## Warnings",
    ]
    for w in result.get("warnings", []):
        lines.append(f"- {w}")
    lines.extend(["", "## Sensitive Findings"])
    for f in result.get("sensitive_findings", []):
        lines.append(f"- {f['sensitive_column']}: DI={f['disparate_impact']}, DP diff={f['demographic_parity_difference']}, EO diff={f['equalized_odds_difference']}, confidence={f['confidence']}")
    lines.extend(["", "## Root Causes"])
    for rc in result.get("root_causes", []):
        lines.append(f"- {rc['summary']}")
    lines.extend(["", "## Recommendations"])
    for rec in result.get("recommendations", []):
        lines.append(f"- [{rec['priority']}] {rec['title']}: {rec['description']}")
    return "\n".join(lines)
