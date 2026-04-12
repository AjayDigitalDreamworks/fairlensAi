import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { env } from '../config/env.js';
import { downloadCorrectedCsv, downloadReportPdf, detectFairsightModel, generateGeminiExplanation, getOne, health, listAll, mitigationPreview, removeOne, uploadAndAnalyze, uploadFairsightModel, mitigateFairsightModel, getFairsightSuggestionsCtrl, downloadFairsightModelCtrl, downloadFairsightReportCtrl, getFairsightHistoryCtrl, explainFairsightModelCtrl } from '../controllers/analysisController.js';

const router = Router();

const uploadsDir = path.join(env.dataDir, 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
  dest: uploadsDir,
  limits: { fileSize: 512 * 1024 * 1024 },
});

const fairsightUpload = multer({
  dest: uploadsDir,
  limits: { fileSize: 512 * 1024 * 1024 },
});

router.get('/health', health);
router.get('/analyses', listAll);
router.get('/analyses/:id', getOne);
router.delete('/analyses/:id', removeOne);
router.get('/analyses/:id/corrected.csv', downloadCorrectedCsv);
router.get('/analyses/:id/report.pdf', downloadReportPdf);
router.post('/analyses/upload', upload.single('file'), uploadAndAnalyze);
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

export default router;
