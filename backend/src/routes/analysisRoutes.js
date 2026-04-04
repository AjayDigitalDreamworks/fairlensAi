import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { env } from '../config/env.js';
import { downloadCorrectedCsv, downloadReportPdf, getOne, health, listAll, mitigationPreview, removeOne, uploadAndAnalyze } from '../controllers/analysisController.js';

const router = Router();

const uploadsDir = path.join(env.dataDir, 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
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

export default router;
