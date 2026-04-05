import axios from 'axios';
import { env } from '../config/env.js';

const client = axios.create({
  baseURL: 'https://generativelanguage.googleapis.com/v1beta',
  timeout: 60000,
});

export function geminiConfigured() {
  return Boolean(env.geminiApiKey);
}

export async function generateGeminiNarration(analysis) {
  if (!env.geminiApiKey) {
    const error = new Error('Gemini API key is not configured.');
    error.status = 400;
    throw error;
  }

  const payload = buildPromptPayload(analysis);
  const { data } = await client.post(
    `/models/${encodeURIComponent(env.geminiModel)}:generateContent`,
    {
      contents: [
        {
          role: 'user',
          parts: [{ text: payload }],
        },
      ],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 700,
      },
    },
    {
      params: { key: env.geminiApiKey },
    },
  );

  const text = extractGeminiText(data);
  if (!text) {
    const error = new Error('Gemini returned an empty explanation.');
    error.status = 502;
    throw error;
  }

  return {
    provider: 'gemini',
    model: env.geminiModel,
    generatedAt: new Date().toISOString(),
    text,
    status: 'generated',
    note: 'Narrative explanation generated from SHAP/model explainability signals and fairness metrics.',
  };
}

function extractGeminiText(data) {
  const candidates = Array.isArray(data?.candidates) ? data.candidates : [];
  const parts = candidates[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts
    .map((part) => part?.text || '')
    .join('\n')
    .trim();
}

function buildPromptPayload(analysis) {
  const explainability = analysis.result?.explainability || {};
  const topFeatures = Array.isArray(explainability.top_features) ? explainability.top_features.slice(0, 6) : [];
  const findings = Array.isArray(analysis.result?.sensitive_findings) ? analysis.result.sensitive_findings.slice(0, 3) : [];
  const rootCauses = Array.isArray(analysis.result?.root_causes) ? analysis.result.root_causes.slice(0, 6) : [];
  const recommendations = Array.isArray(analysis.result?.recommendations) ? analysis.result.recommendations.slice(0, 4) : [];
  const metadata = analysis.result?.metadata || {};
  const fairness = analysis.result?.fairness_summary || {};
  const correctedFindings =
    analysis.result?.artifacts?.corrected_sensitive_findings ||
    analysis.result?.corrected_sensitive_findings ||
    [];
  const detectionNotes = Array.isArray(analysis.result?.detection?.notes) ? analysis.result.detection.notes.slice(0, 6) : [];

  return [
    'You are writing a concise but detailed English explanation for an AI fairness dashboard.',
    'Use the provided SHAP/model explainability signals, fairness findings, root causes, and recommendations.',
    'Do not invent numbers or methods.',
    'Do not claim Gemini computed the explanation mathematically.',
    'State clearly that SHAP/model attribution is the mathematical layer and Gemini is only the natural-language interpretation layer.',
    'Write in plain professional English.',
    'Explain what problem existed in the dataset, what likely caused it, how the current pipeline solved or mitigated it, and what the user can still do before training a real model.',
    'Explicitly mention the bias score, risk level, number of columns, number of rows, sensitive columns, and the most likely problematic columns or features.',
    'If corrected fairness exists, mention how much it improved and whether the fairness target was met.',
    'Include practical steps the user should take before model training.',
    'Use exactly these headings in this order:',
    '1. Problem Found',
    '2. Why It Happened',
    '3. What FairAI Solved',
    '4. What You Should Do Before Training',
    '5. What Else You Can Solve With This Dataset Audit',
    '',
    `Dataset: ${analysis.input?.fileName || 'unknown'}`,
    `Domain: ${analysis.result?.metadata?.domain || analysis.input?.domain || 'unknown'}`,
    `Rows: ${metadata.rows ?? 'unknown'}`,
    `Column count: ${Array.isArray(metadata.columns) ? metadata.columns.length : 'unknown'}`,
    `Columns: ${Array.isArray(metadata.columns) ? metadata.columns.join(', ') : 'unknown'}`,
    `Sensitive columns: ${(metadata.sensitive_columns || []).join(', ') || 'unknown'}`,
    `Prediction source: ${analysis.result?.metadata?.prediction_auto_generated ? 'XGBoost surrogate model' : 'uploaded prediction column'}`,
    `Explainability status: ${explainability.status || 'unknown'}`,
    `Explainability method: ${explainability.method || 'unknown'}`,
    `Methods available: ${(explainability.methods_available || []).join(', ') || 'none'}`,
    `Overall fairness score: ${fairness.overall_fairness_score ?? 'unknown'}`,
    `Risk level: ${fairness.risk_level ?? 'unknown'}`,
    `Corrected fairness score: ${fairness.corrected_fairness_score ?? 'unknown'}`,
    `Fairness target: ${fairness.fairness_target ?? 'unknown'}`,
    `Fairness target met: ${fairness.fairness_target_met ?? 'unknown'}`,
    `Fairness target gap: ${fairness.fairness_target_gap ?? 'unknown'}`,
    '',
    'Top features:',
    JSON.stringify(topFeatures, null, 2),
    '',
    'Sensitive findings:',
    JSON.stringify(findings, null, 2),
    '',
    'Corrected findings:',
    JSON.stringify(correctedFindings.slice(0, 3), null, 2),
    '',
    'Root causes:',
    JSON.stringify(rootCauses, null, 2),
    '',
    'Recommendations:',
    JSON.stringify(recommendations, null, 2),
    '',
    'Detection notes:',
    JSON.stringify(detectionNotes, null, 2),
  ].join('\n');
}
