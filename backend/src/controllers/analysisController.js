import { createAnalysis, createMitigationPreview, deleteAnalysis, getAnalysis, getAnalysisArtifact, listAnalyses } from '../services/analysisService.js';
import { healthCheckPython } from '../services/pythonService.js';

export async function health(req, res, next) {
  try {
    const python = await healthCheckPython();
    res.json({ ok: true, backend: 'healthy', python });
  } catch (error) {
    next(error);
  }
}

export async function uploadAndAnalyze(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'File is required.' });
    }
    const analysis = await createAnalysis({ file: req.file, body: req.body });
    res.status(201).json(stripInternalPaths(analysis));
  } catch (error) {
    next(error);
  }
}

export function listAll(req, res) {
  res.json({ items: listAnalyses().map(stripInternalPaths) });
}

export function getOne(req, res) {
  const item = getAnalysis(req.params.id);
  if (!item) {
    return res.status(404).json({ message: 'Analysis not found.' });
  }
  res.json(stripInternalPaths(item));
}

export function removeOne(req, res, next) {
  try {
    const deleted = deleteAnalysis(req.params.id);
    res.json({ id: deleted.id });
  } catch (error) {
    next(error);
  }
}

export async function mitigationPreview(req, res, next) {
  try {
    const updated = await createMitigationPreview({
      analysisId: req.params.id,
      strategy: req.body.strategy,
    });
    res.json(stripInternalPaths(updated));
  } catch (error) {
    next(error);
  }
}

export function downloadCorrectedCsv(req, res, next) {
  try {
    const artifact = getAnalysisArtifact(req.params.id, 'csv');
    res.download(artifact.filePath, artifact.downloadName);
  } catch (error) {
    next(error);
  }
}

export function downloadReportPdf(req, res, next) {
  try {
    const artifact = getAnalysisArtifact(req.params.id, 'pdf');
    res.download(artifact.filePath, artifact.downloadName);
  } catch (error) {
    next(error);
  }
}

function stripInternalPaths(analysis) {
  if (!analysis) return analysis;
  const { artifactPaths, ...rest } = analysis;
  return rest;
}
