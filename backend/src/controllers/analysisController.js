import { createAnalysis, createMitigationPreview, deleteAnalysis, generateAnalysisNarration, getAnalysis, getAnalysisArtifact, listAnalyses } from '../services/analysisService.js';
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

export async function listAll(req, res, next) {
  try {
    const analyses = await listAnalyses();
    res.json({ items: analyses.map(stripInternalPaths) });
  } catch (error) {
    next(error);
  }
}

export async function getOne(req, res, next) {
  try {
    const item = await getAnalysis(req.params.id);
    if (!item) {
      return res.status(404).json({ message: 'Analysis not found.' });
    }
    res.json(stripInternalPaths(item));
  } catch (error) {
    next(error);
  }
}

export async function removeOne(req, res, next) {
  try {
    const deleted = await deleteAnalysis(req.params.id);
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

export async function generateGeminiExplanation(req, res, next) {
  try {
    const updated = await generateAnalysisNarration(req.params.id);
    res.json(stripInternalPaths(updated));
  } catch (error) {
    next(error);
  }
}

export async function downloadCorrectedCsv(req, res, next) {
  try {
    const artifact = await getAnalysisArtifact(req.params.id, 'csv');
    res.download(artifact.filePath, artifact.downloadName);
  } catch (error) {
    next(error);
  }
}

export async function downloadReportPdf(req, res, next) {
  try {
    const artifact = await getAnalysisArtifact(req.params.id, 'pdf');
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
