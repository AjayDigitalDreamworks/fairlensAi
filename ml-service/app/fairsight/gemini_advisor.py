"""
gemini_advisor.py — Gemini-Powered Bias Analysis & Suggestions
Sends bias report to Google Gemini for human-readable insights,
actionable correction suggestions, and deployment risk assessment.
"""

import json
import os
import logging
from typing import Any, Dict

logger = logging.getLogger(__name__)

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")


def _build_prompt(bias_report: dict, sensitive_col: str, label_col: str) -> str:
    """Build a structured prompt for Gemini to analyze bias report."""

    severity = bias_report.get("severity", {}).get("overall_severity", {})
    severity_level = severity.get("level", "unknown")
    dpd = bias_report.get("dpd", 0.0)
    eod = bias_report.get("eod", 0.0)
    is_biased = bias_report.get("is_biased", False)
    performance = bias_report.get("performance", {})
    by_group = bias_report.get("by_group", [])
    recommended = bias_report.get("recommended_mitigation", {})

    prompt = f"""You are a senior AI fairness auditor. Analyze the following ML model bias detection report and provide:

1. **Executive Summary** — One paragraph interpreting the bias findings in plain English
2. **Key Fairness Metrics Interpretation** — What do the DPD and EOD values mean for this model
3. **Per-Group Analysis** — Which groups are disadvantaged and why
4. **Risk Assessment** — Whether this model is safe to deploy
5. **Recommended Corrections** — Specific, actionable steps to fix the bias (list 3-5 steps)
6. **Trade-off Guidance** — Expected accuracy cost of mitigation and whether it's acceptable

## Bias Detection Report

- **Protected Attribute**: {sensitive_col}
- **Label Column**: {label_col}
- **Bias Detected**: {is_biased}
- **Severity Level**: {severity_level}

### Performance Metrics
- Accuracy: {performance.get('accuracy', 'N/A')}
- Balanced Accuracy: {performance.get('balanced_accuracy', 'N/A')}
- F1 Score: {performance.get('f1', 'N/A')}
- AUC-ROC: {performance.get('auc_roc', 'N/A')}
- Positive Rate: {performance.get('positive_rate', 'N/A')}

### Fairness Metrics
- Demographic Parity Difference (DPD): {dpd:.4f}
  - Threshold for concern: >0.10
  - Interpretation: {"HIGH BIAS" if abs(dpd) > 0.10 else "LOW BIAS" if abs(dpd) <= 0.05 else "MODERATE BIAS"}
- Equalized Odds Difference (EOD): {eod:.4f}
  - Threshold for concern: >0.10
  - Interpretation: {"HIGH BIAS" if abs(eod) > 0.10 else "LOW BIAS" if abs(eod) <= 0.05 else "MODERATE BIAS"}
- Statistical Significance: {bias_report.get('statistically_significant', 'N/A')}
- DPD 95% CI: {bias_report.get('dpd_ci', 'N/A')}
- Accuracy Gap Between Groups: {bias_report.get('accuracy_gap', 'N/A')}

### Per-Group Breakdown
{json.dumps(by_group, indent=2)}

### System-Recommended Mitigation
Method: {recommended.get('method', 'N/A') if isinstance(recommended, dict) else recommended}
Reason: {recommended.get('reason', 'N/A') if isinstance(recommended, dict) else 'N/A'}

Please provide your analysis in a clear, structured markdown format that a non-technical stakeholder can understand.
Focus on practical actionable steps rather than theoretical concepts.
"""
    return prompt


async def get_gemini_suggestions(bias_report: dict,
                                  sensitive_col: str,
                                  label_col: str) -> Dict[str, Any]:
    """
    Send bias report to Gemini and get human-readable suggestions.
    Falls back gracefully if Gemini is unavailable.
    """
    api_key = GEMINI_API_KEY
    if not api_key:
        logger.warning("GEMINI_API_KEY not set. Returning rule-based suggestions.")
        return _generate_fallback_suggestions(bias_report, sensitive_col)

    prompt = _build_prompt(bias_report, sensitive_col, label_col)

    try:
        import google.generativeai as genai
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel(GEMINI_MODEL)
        response = model.generate_content(prompt)
        suggestions_text = response.text

        return {
            "source": "gemini",
            "model": GEMINI_MODEL,
            "suggestions_markdown": suggestions_text,
            "sensitive_col": sensitive_col,
            "label_col": label_col,
            "severity": bias_report.get("severity", {}).get("overall_severity", {}).get("level", "unknown"),
        }

    except ImportError:
        logger.warning("google-generativeai not installed. Using HTTP fallback.")
        return await _gemini_http_fallback(api_key, prompt, bias_report, sensitive_col)

    except Exception as exc:
        logger.error(f"Gemini API call failed: {exc}")
        return _generate_fallback_suggestions(bias_report, sensitive_col)


async def _gemini_http_fallback(api_key: str, prompt: str,
                                 bias_report: dict, sensitive_col: str) -> Dict[str, Any]:
    """HTTP-based fallback for Gemini API if google-generativeai SDK is not available."""
    try:
        import httpx

        url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"
        headers = {"Content-Type": "application/json"}
        params = {"key": api_key}
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": 0.3, "maxOutputTokens": 2048},
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, json=payload, headers=headers, params=params)
            resp.raise_for_status()
            data = resp.json()

        text = data["candidates"][0]["content"]["parts"][0]["text"]
        return {
            "source": "gemini_http",
            "model": GEMINI_MODEL,
            "suggestions_markdown": text,
            "sensitive_col": sensitive_col,
            "severity": bias_report.get("severity", {}).get("overall_severity", {}).get("level", "unknown"),
        }

    except Exception as exc:
        logger.error(f"Gemini HTTP fallback failed: {exc}")
        return _generate_fallback_suggestions(bias_report, sensitive_col)


def _generate_fallback_suggestions(bias_report: dict, sensitive_col: str) -> Dict[str, Any]:
    """Rule-based fallback suggestions when Gemini is unavailable."""
    dpd = abs(bias_report.get("dpd", 0.0))
    eod = abs(bias_report.get("eod", 0.0))
    is_biased = bias_report.get("is_biased", False)
    severity = bias_report.get("severity", {}).get("overall_severity", {})
    recommended = bias_report.get("recommended_mitigation", {})
    method = recommended.get("method", "ThresholdOptimizer") if isinstance(recommended, dict) else str(recommended)
    by_group = bias_report.get("by_group", [])

    # Find disadvantaged group
    disadvantaged = None
    if by_group:
        worst = min(by_group, key=lambda g: g.get("selection_rate", 1.0))
        best = max(by_group, key=lambda g: g.get("selection_rate", 0.0))
        disadvantaged = worst.get("group", "unknown")

    lines = ["# AI Fairness Audit — Analysis & Recommendations\n"]

    # Executive summary
    lines.append("## Executive Summary\n")
    if is_biased:
        lines.append(
            f"The model exhibits **{severity.get('level', 'significant')} bias** "
            f"on the `{sensitive_col}` attribute. "
            f"Demographic Parity Difference is **{dpd:.4f}** and "
            f"Equalized Odds Difference is **{eod:.4f}**, "
            f"both of which {'exceed' if dpd > 0.10 or eod > 0.10 else 'approach'} "
            f"the 0.10 concern threshold.\n"
        )
    else:
        lines.append(
            f"The model shows **no critical bias** on `{sensitive_col}`. "
            f"DPD={dpd:.4f} and EOD={eod:.4f} are below concern thresholds.\n"
        )

    # Per-group findings
    if disadvantaged and is_biased:
        lines.append("## Per-Group Analysis\n")
        lines.append(f"- **Disadvantaged group**: `{disadvantaged}`")
        lines.append(
            f"  - Selection rate: {worst.get('selection_rate', 0):.4f} "
            f"vs {best.get('selection_rate', 0):.4f} for `{best.get('group', 'privileged')}`"
        )
        lines.append(
            f"  - This means `{disadvantaged}` is {((1 - worst.get('selection_rate', 0) / max(best.get('selection_rate', 0.001), 0.001)) * 100):.1f}% "
            f"less likely to receive a positive prediction.\n"
        )

    # Recommendations
    lines.append("## Recommended Corrections\n")
    lines.append(f"1. **Apply {method}** — {recommended.get('reason', 'Best method for this severity level') if isinstance(recommended, dict) else 'Recommended based on severity analysis'}")
    lines.append(f"2. **Review training data** — Check for class imbalance in `{sensitive_col}` within training data")
    lines.append(f"3. **Feature audit** — Verify no proxy features leak `{sensitive_col}` information into the model")
    if dpd > 0.10:
        lines.append(f"4. **Adjust decision thresholds** — Lower thresholds for disadvantaged group `{disadvantaged}` to achieve parity")
    if eod > 0.10:
        lines.append(f"5. **Equalize error rates** — Ensure equal TPR and FPR across `{sensitive_col}` groups")

    # Trade-off guidance
    lines.append("\n## Trade-off Guidance\n")
    lines.append(f"- Expected accuracy cost of {method}: {recommended.get('expected_accuracy_impact', '-1% to -5%') if isinstance(recommended, dict) else '-1% to -5%'}")
    lines.append("- An accuracy drop of **1-3% is generally acceptable** when it reduces DPD or EOD by 50%+")
    lines.append("- Always validate that accuracy does not fall below your deployment SLA minimum\n")

    return {
        "source": "rule_based_fallback",
        "model": "N/A",
        "suggestions_markdown": "\n".join(lines),
        "sensitive_col": sensitive_col,
        "severity": severity.get("level", "unknown"),
    }
