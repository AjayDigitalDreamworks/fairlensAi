import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { env } from '../config/env.js';
import { downloadCorrectedCsv, downloadReportPdf, detectFairsightModel, generateGeminiExplanation, getOne, health, listAll, mitigationPreview, removeOne, uploadAndAnalyze, uploadFairsightModel, mitigateFairsightModel, getFairsightSuggestionsCtrl, downloadFairsightModelCtrl, downloadFairsightReportCtrl, getFairsightHistoryCtrl, explainFairsightModelCtrl } from '../controllers/analysisController.js';
import { currentUser, loginUser, signupUser } from '../controllers/authController.js';
import { authenticateRequest } from '../services/authService.js';
import { costCalculator, roiCalculator, violationChecker, counterfactualAnalysis, driftDetection, biasAttribution, regulationsLookup, demoDataLookup } from '../controllers/complianceController.js';

const router = Router();

const uploadsDir = path.join(env.dataDir, 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

const allowedDatasetExtensions = new Set(['.csv', '.xlsx', '.xls', '.json', '.parquet']);
const allowedModelExtensions = new Set(['.pkl', '.joblib', '.h5', '.onnx', '.pb', '.pt', '.pth', '.sav']);
const uploadRateBuckets = new Map();

function datasetFileFilter(req, file, cb) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (!allowedDatasetExtensions.has(ext)) {
    const error = new Error('Unsupported dataset file type. Upload CSV, XLSX, XLS, JSON, or Parquet files.');
    error.status = 400;
    cb(error);
    return;
  }
  cb(null, true);
}

function fairsightFileFilter(req, file, cb) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  const allowed = file.fieldname === 'csv_file' ? allowedDatasetExtensions : allowedModelExtensions;
  if (!allowed.has(ext)) {
    const error = new Error('Unsupported model audit file type.');
    error.status = 400;
    cb(error);
    return;
  }
  cb(null, true);
}

function analysisUploadRateLimit(req, res, next) {
  const windowMs = 15 * 60 * 1000;
  const now = Date.now();
  const key = req.ip || req.headers['x-forwarded-for'] || 'anonymous';
  const bucket = uploadRateBuckets.get(key) || { count: 0, resetAt: now + windowMs };

  if (bucket.resetAt <= now) {
    bucket.count = 0;
    bucket.resetAt = now + windowMs;
  }

  bucket.count += 1;
  uploadRateBuckets.set(key, bucket);

  if (bucket.count > env.analysisRateLimitMax) {
    return res.status(429).json({ message: 'Too many analysis uploads. Please try again later.' });
  }

  next();
}

function validateAnalysisUpload(req, res, next) {
  const allowedDomains = new Set(['auto', 'finance', 'financial', 'credit', 'healthcare', 'hiring', 'criminal_justice']);
  const domain = String(req.body.domain || 'auto').toLowerCase();
  const positiveLabel = String(req.body.positiveLabel ?? '1');

  if (!allowedDomains.has(domain)) {
    cleanupTempFile(req.file);
    return res.status(400).json({ message: 'Invalid domain. Use auto, finance, healthcare, hiring, or criminal_justice.' });
  }

  if (positiveLabel.length > 50) {
    cleanupTempFile(req.file);
    return res.status(400).json({ message: 'positiveLabel is too long.' });
  }

  for (const field of ['targetColumn', 'predictionColumn']) {
    if (req.body[field] && String(req.body[field]).length > 255) {
      cleanupTempFile(req.file);
      return res.status(400).json({ message: `${field} is too long.` });
    }
  }

  try {
    const parsedSensitive = req.body.sensitiveColumns ? JSON.parse(req.body.sensitiveColumns) : [];
    if (Array.isArray(parsedSensitive) && parsedSensitive.length > 20) {
      cleanupTempFile(req.file);
      return res.status(400).json({ message: 'Use 20 or fewer sensitive columns.' });
    }
  } catch {
    const sensitiveColumns = String(req.body.sensitiveColumns || '').split(',').filter(Boolean);
    if (sensitiveColumns.length > 20) {
      cleanupTempFile(req.file);
      return res.status(400).json({ message: 'Use 20 or fewer sensitive columns.' });
    }
  }

  next();
}

function cleanupTempFile(file) {
  if (!file?.path) return;
  try {
    fs.unlinkSync(file.path);
  } catch {
    // Ignore validation cleanup failures for temp uploads.
  }
}

const upload = multer({
  dest: uploadsDir,
  limits: { fileSize: env.maxUploadBytes },
  fileFilter: datasetFileFilter,
});

const fairsightUpload = multer({
  dest: uploadsDir,
  limits: { fileSize: env.maxUploadBytes },
  fileFilter: fairsightFileFilter,
});

router.get('/health', health);
router.post('/auth/signup', signupUser);
router.post('/auth/login', loginUser);
router.get('/auth/me', authenticateRequest, currentUser);

router.use(authenticateRequest);

router.get('/analyses', listAll);
router.get('/analyses/:id', getOne);
router.delete('/analyses/:id', removeOne);
router.get('/analyses/:id/corrected.csv', downloadCorrectedCsv);
router.get('/analyses/:id/report.pdf', downloadReportPdf);
router.post('/analyses/upload', analysisUploadRateLimit, upload.single('file'), validateAnalysisUpload, uploadAndAnalyze);
router.post('/analyses/:id/mitigation-preview', mitigationPreview);
router.post('/analyses/:id/gemini-explanation', generateGeminiExplanation);
router.post('/fairsight/upload', fairsightUpload.fields([
  { name: 'model_file', maxCount: 1 },
  { name: 'csv_file', maxCount: 1 },
]), uploadFairsightModel);
router.post('/fairsight/detect', detectFairsightModel);
router.post('/fairsight/mitigate', mitigateFairsightModel);
router.post('/fairsight/gemini-suggestions', getFairsightSuggestionsCtrl);
router.post('/fairsight/explain', explainFairsightModelCtrl);
router.get('/fairsight/download-model/:sessionId', downloadFairsightModelCtrl);
router.get('/fairsight/download-report/:sessionId', downloadFairsightReportCtrl);
router.get('/fairsight/history', getFairsightHistoryCtrl);

// Compliance & Cost Calculator routes
router.post('/compliance/cost-calculator', costCalculator);
router.post('/compliance/roi', roiCalculator);
router.post('/compliance/check-violations', violationChecker);
router.post('/compliance/counterfactual', counterfactualAnalysis);
router.post('/compliance/drift-detection', driftDetection);
router.post('/compliance/bias-attribution', biasAttribution);
router.get('/compliance/regulations/:domain', regulationsLookup);
router.get('/compliance/demo-data/:domain', demoDataLookup);

export default router;
