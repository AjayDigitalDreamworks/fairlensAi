import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { AnalysisRepository } from '../models/analysisRepository.js';
import { analyzeFile as callAnalyzeFile, mitigationPreview as callMitigationPreview } from './pythonService.js';
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
  repo.save(updated);
  return updated;
}

export function listAnalyses() {
  return repo.list();
}

export function getAnalysis(id) {
  return repo.getById(id);
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
