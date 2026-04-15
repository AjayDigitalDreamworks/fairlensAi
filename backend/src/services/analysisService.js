import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../config/env.js';
import { AnalysisRepository } from '../models/analysisRepository.js';
import { analyzeFile as callAnalyzeFile, healthCheckPython, mitigationPreview as callMitigationPreview } from './pythonService.js';
import { geminiConfigured, generateGeminiNarration } from './geminiService.js';
import { persistArtifacts } from '../utils/reportArtifacts.js';

const repo = new AnalysisRepository();

export async function createAnalysis({ file, body, user }) {
  try {
    await healthCheckPython();

    const sensitiveColumns = normalizeSensitiveColumns(body.sensitiveColumns);
    const rawResult = await callAnalyzeFile({
      filePath: file.path,
      originalName: file.originalname,
      domain: body.domain,
      targetColumn: body.targetColumn,
      predictionColumn: body.predictionColumn,
      sensitiveColumns,
      positiveLabel: body.positiveLabel,
      geminiApiKey: body.geminiApiKey,
    });

    const analysis = {
      id: uuidv4(),
      userId: user?.id,
      createdAt: new Date().toISOString(),
      input: {
        fileName: file.originalname,
        domain: body.domain || 'auto',
        targetColumn: body.targetColumn || '',
        predictionColumn: body.predictionColumn || '',
        sensitiveColumns,
        positiveLabel: body.positiveLabel || '1',
      },
      result: rawResult,
    };

    const artifactPaths = persistArtifacts(analysis);
    analysis.artifactPaths = artifactPaths;
    analysis.result.artifacts = {
      correctedCsvUrl: artifactPaths.correctedCsvUrl,
      reportPdfUrl: artifactPaths.reportPdfUrl,
      corrected_filename: artifactPaths.correctedFileName,
    };
    await enrichGeminiNarration(analysis, { generate: Boolean(body.geminiApiKey) });

    await repo.save(analysis);
    return analysis;
  } finally {
    if (file?.path && fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }
  }
}

export async function createMitigationPreview({ analysisId, strategy, user }) {
  const analysis = await repo.getById(analysisId, user?.id);
  if (!analysis) {
    const error = new Error('Analysis not found');
    error.status = 404;
    throw error;
  }

  const payload = {
    domain: analysis.input.domain,
    strategy: strategy || 'reweighing',
    fairness_summary: analysis.result.fairness_summary,
    sensitive_findings: analysis.result.sensitive_findings,
    recommendations: analysis.result.recommendations,
  };

  const preview = await callMitigationPreview(payload);
  const updated = {
    ...analysis,
    mitigationPreview: preview,
    updatedAt: new Date().toISOString(),
  };
  updated.artifactPaths = persistArtifacts(updated);
  updated.result.artifacts = {
    correctedCsvUrl: updated.artifactPaths.correctedCsvUrl,
    reportPdfUrl: updated.artifactPaths.reportPdfUrl,
    corrected_filename: updated.artifactPaths.correctedFileName,
  };
  await enrichGeminiNarration(updated, { generate: false });
  await repo.save(updated);
  return updated;
}

export async function listAnalyses(user) {
  return await repo.list(user?.id);
}

export async function getAnalysis(id, user) {
  return await repo.getById(id, user?.id);
}

export async function generateAnalysisNarration(id, user) {
  const analysis = await repo.getById(id, user?.id);
  if (!analysis) {
    const error = new Error('Analysis not found');
    error.status = 404;
    throw error;
  }

  if (!geminiConfigured()) {
    analysis.result.explanation = {
      ...(analysis.result.explanation || {}),
      gemini_interpretation: buildGeminiInterpretationState(
        {
          status: 'not_configured',
          generatedAt: null,
          note: 'Set GEMINI_API_KEY on the backend to enable natural-language explainability.',
        },
        analysis.result.explanation?.gemini_interpretation,
      ),
    };
    analysis.updatedAt = new Date().toISOString();
    await repo.save(analysis);
    return analysis;
  }

  try {
    const generated = await generateGeminiNarration(analysis);
    analysis.result.explanation = {
      ...(analysis.result.explanation || {}),
      gemini_interpretation: generated,
    };
  } catch (error) {
    analysis.result.explanation = {
      ...(analysis.result.explanation || {}),
      gemini_interpretation: buildGeminiInterpretationState(
        {
          status: 'failed',
          generatedAt: new Date().toISOString(),
          note: getGeminiErrorMessage(error, 'Gemini explanation failed.'),
        },
        analysis.result.explanation?.gemini_interpretation,
      ),
    };
  }

  analysis.updatedAt = new Date().toISOString();
  await repo.save(analysis);
  return analysis;
}

export async function deleteAnalysis(id, user) {
  const analysis = await repo.deleteById(id, user?.id);
  if (!analysis) {
    const error = new Error('Analysis not found');
    error.status = 404;
    throw error;
  }

  removeArtifactsForAnalysis(id);
  return analysis;
}

export async function getAnalysisArtifact(id, type, user) {
  const analysis = await repo.getById(id, user?.id);
  if (!analysis) {
    const error = new Error('Analysis not found');
    error.status = 404;
    throw error;
  }

  let artifactPaths = analysis.artifactPaths;
  let filePath = type === 'pdf' ? artifactPaths?.reportPdfPath : artifactPaths?.correctedCsvPath;

  if (!filePath || !fs.existsSync(filePath)) {
    const canBackfill =
      Boolean(analysis.result?.corrected_csv) ||
      Boolean(analysis.result?.report_markdown) ||
      Boolean(analysis.result?.explanation?.executive_summary);

    if (canBackfill) {
      artifactPaths = persistArtifacts(analysis);
      analysis.artifactPaths = artifactPaths;
      analysis.result.artifacts = {
        ...(analysis.result.artifacts || {}),
        correctedCsvUrl: artifactPaths.correctedCsvUrl,
        reportPdfUrl: artifactPaths.reportPdfUrl,
        corrected_filename: analysis.result.artifacts?.corrected_filename || artifactPaths.correctedFileName,
      };
      await repo.save(analysis);
      filePath = type === 'pdf' ? artifactPaths.reportPdfPath : artifactPaths.correctedCsvPath;
    }
  }

  if (!filePath || !fs.existsSync(filePath)) {
    const error = new Error('Artifact not found');
    error.status = 404;
    throw error;
  }

  return {
    analysis,
    filePath,
    downloadName:
      type === 'pdf'
        ? `${analysis.input.fileName.replace(/\.[^.]+$/, '') || analysis.id}_audit_report.pdf`
        : analysis.result.artifacts?.corrected_filename || `${analysis.id}_corrected.csv`,
  };
}

function normalizeSensitiveColumns(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [String(parsed)];
  } catch {
    return String(value)
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
  }
}

function removeArtifactsForAnalysis(id) {
  const artifactsRoot = path.resolve(env.dataDir, 'artifacts');
  const targetDir = path.resolve(artifactsRoot, id);

  if (!targetDir.startsWith(`${artifactsRoot}${path.sep}`)) {
    return;
  }

  if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
}

async function enrichGeminiNarration(analysis, options = { generate: false }) {
  if (!geminiConfigured() || !options.generate) {
    analysis.result.explanation = {
      ...(analysis.result.explanation || {}),
      gemini_interpretation: buildGeminiInterpretationState({
        status: geminiConfigured() ? 'available_on_demand' : 'not_configured',
        generatedAt: null,
        note: geminiConfigured()
          ? 'Gemini narration is available on demand from the explainability action.'
          : 'Set GEMINI_API_KEY on the backend to enable natural-language explainability.',
      }),
    };
    return;
  }

  try {
    const generated = await generateGeminiNarration(analysis);
    analysis.result.explanation = {
      ...(analysis.result.explanation || {}),
      gemini_interpretation: generated,
    };
  } catch (error) {
    analysis.result.explanation = {
      ...(analysis.result.explanation || {}),
      gemini_interpretation: buildGeminiInterpretationState({
        status: 'failed',
        generatedAt: new Date().toISOString(),
        note: getGeminiErrorMessage(error, 'Gemini explanation failed.'),
      }),
    };
  }
}

function buildGeminiInterpretationState(overrides, existing = {}) {
  return {
    provider: existing.provider || 'gemini',
    model: existing.model || env.geminiModel,
    generatedAt: existing.generatedAt ?? null,
    text: existing.text || '',
    status: 'available_on_demand',
    note: '',
    ...overrides,
  };
}

function getGeminiErrorMessage(error, fallback) {
  if (error?.response?.data?.error?.message) return error.response.data.error.message;
  if (error?.response?.data?.detail) return error.response.data.detail;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
