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
  const recommendations = Array.isArray(analysis.result?.recommendations) ? analysis.result.recommendations.slice(0, 4) : [];

  return [
    'You are writing a concise, trustworthy explainability summary for an AI fairness dashboard.',
    'Use the provided SHAP/model explainability signals and fairness findings.',
    'Do not invent numbers or methods.',
    'Do not claim Gemini computed the explanation mathematically.',
    'State clearly that SHAP/model attribution is the mathematical layer and this is the natural-language interpretation layer.',
    'Write 3 short sections with headings: Why the model behaves this way, Fairness risk, What to do next.',
    '',
    `Dataset: ${analysis.input?.fileName || 'unknown'}`,
    `Domain: ${analysis.result?.metadata?.domain || analysis.input?.domain || 'unknown'}`,
    `Prediction source: ${analysis.result?.metadata?.prediction_auto_generated ? 'XGBoost surrogate model' : 'uploaded prediction column'}`,
    `Explainability status: ${explainability.status || 'unknown'}`,
    `Explainability method: ${explainability.method || 'unknown'}`,
    `Methods available: ${(explainability.methods_available || []).join(', ') || 'none'}`,
    `Overall fairness score: ${analysis.result?.fairness_summary?.overall_fairness_score ?? 'unknown'}`,
    `Corrected fairness score: ${analysis.result?.fairness_summary?.corrected_fairness_score ?? 'unknown'}`,
    '',
    'Top features:',
    JSON.stringify(topFeatures, null, 2),
    '',
    'Sensitive findings:',
    JSON.stringify(findings, null, 2),
    '',
    'Recommendations:',
    JSON.stringify(recommendations, null, 2),
  ].join('\n');
}
