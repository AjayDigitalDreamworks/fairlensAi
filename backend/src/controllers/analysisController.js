import { createAnalysis, createMitigationPreview, deleteAnalysis, generateAnalysisNarration, getAnalysis, getAnalysisArtifact, listAnalyses } from '../services/analysisService.js';
import { healthCheckPython } from '../services/pythonService.js';
import { detectFairsightBias, uploadFairsightAssets, mitigateFairsightBias, getFairsightSuggestions, downloadFairsightModel, downloadFairsightReport, getFairsightHistory, getFairsightExplain } from '../services/fairsightService.js';

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

export async function uploadFairsightModel(req, res, next) {
  const modelFile = req.files?.model_file?.[0];
  const csvFile = req.files?.csv_file?.[0];

  try {
    if (!modelFile || !csvFile) {
      return res.status(400).json({ message: 'Both model_file and csv_file are required.' });
    }

    const result = await uploadFairsightAssets({
      modelPath: modelFile.path,
      modelName: modelFile.originalname,
      csvPath: csvFile.path,
      csvName: csvFile.originalname,
    });

    res.json(result);
  } catch (error) {
    next(error);
  } finally {
    cleanupUploadedFiles([modelFile, csvFile]);
  }
}

export async function detectFairsightModel(req, res, next) {
  try {
    const result = await detectFairsightBias(req.body);
    res.json(result);
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

function cleanupUploadedFiles(files) {
  for (const file of files) {
    if (file?.path) {
      try {
        fs.unlinkSync(file.path);
      } catch {
        // Ignore cleanup failures for temp uploads.
      }
    }
  }
}

export async function mitigateFairsightModel(req, res, next) {
  try {
    const result = await mitigateFairsightBias(req.body);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function getFairsightSuggestionsCtrl(req, res, next) {
  try {
    const result = await getFairsightSuggestions(req.body);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function explainFairsightModelCtrl(req, res, next) {
  try {
    const result = await getFairsightExplain(req.body);
    res.json(result);
  } catch (error) {
    next(error);
  }
}


export async function downloadFairsightModelCtrl(req, res, next) {
  try {
    const stream = await downloadFairsightModel(req.params.sessionId);
    res.setHeader('Content-Disposition', 'attachment; filename="corrected_model.pkl"');
    res.setHeader('Content-Type', 'application/octet-stream');
    stream.pipe(res);
  } catch (error) {
    next(error);
  }
}

export async function downloadFairsightReportCtrl(req, res, next) {
  try {
    const stream = await downloadFairsightReport(req.params.sessionId);
    res.setHeader('Content-Disposition', 'attachment; filename="fairsight_bias_audit.json"');
    res.setHeader('Content-Type', 'application/json');
    stream.pipe(res);
  } catch (error) {
    next(error);
  }
}

export async function getFairsightHistoryCtrl(req, res, next) {
  try {
    const history = await getFairsightHistory();
    res.json({ items: history });
  } catch (error) {
    next(error);
  }
}

