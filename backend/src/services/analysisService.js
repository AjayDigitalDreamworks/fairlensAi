import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../config/env.js';
import { AnalysisRepository } from '../models/analysisRepository.js';
import { analyzeFile as callAnalyzeFile, mitigationPreview as callMitigationPreview } from './pythonService.js';
import { geminiConfigured, generateGeminiNarration } from './geminiService.js';
import { persistArtifacts } from '../utils/reportArtifacts.js';

const repo = new AnalysisRepository();

export async function createAnalysis({ file, body }) {
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
  await enrichGeminiNarration(analysis);

  repo.save(analysis);
  fs.unlinkSync(file.path);
  return analysis;
}

export async function createMitigationPreview({ analysisId, strategy }) {
  const analysis = repo.getById(analysisId);
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
  await enrichGeminiNarration(updated);
  repo.save(updated);
  return updated;
}

export function listAnalyses() {
  return repo.list();
}

export function getAnalysis(id) {
  return repo.getById(id);
}

export async function generateAnalysisNarration(id) {
  const analysis = repo.getById(id);
  if (!analysis) {
    const error = new Error('Analysis not found');
    error.status = 404;
    throw error;
  }

  const generated = await generateGeminiNarration(analysis);
  analysis.result.explanation = {
    ...(analysis.result.explanation || {}),
    gemini_interpretation: generated,
  };
  analysis.updatedAt = new Date().toISOString();
  repo.save(analysis);
  return analysis;
}

export function deleteAnalysis(id) {
  const analysis = repo.deleteById(id);
  if (!analysis) {
    const error = new Error('Analysis not found');
    error.status = 404;
    throw error;
  }

  removeArtifactsForAnalysis(id);
  return analysis;
}

export function getAnalysisArtifact(id, type) {
  const analysis = repo.getById(id);
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
      repo.save(analysis);
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

async function enrichGeminiNarration(analysis) {
  if (!geminiConfigured()) {
    analysis.result.explanation = {
      ...(analysis.result.explanation || {}),
      gemini_interpretation: {
        provider: 'gemini',
        model: env.geminiModel,
        generatedAt: null,
        text: '',
        status: 'not_configured',
        note: 'Set GEMINI_API_KEY on the backend to enable natural-language explainability.',
      },
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
      gemini_interpretation: {
        provider: 'gemini',
        model: env.geminiModel,
        generatedAt: new Date().toISOString(),
        text: '',
        status: 'failed',
        note: error instanceof Error ? error.message : 'Gemini explanation failed.',
      },
    };
  }
}
