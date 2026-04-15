import fs from 'fs';
import path from 'path';
import { env } from '../config/env.js';

export function persistArtifacts(analysis) {
  const artifactsRoot = path.resolve(env.dataDir, 'artifacts');
  const safeAnalysisId = sanitizePathSegment(analysis.id);
  const artifactsDir = path.resolve(artifactsRoot, safeAnalysisId);

  if (!artifactsDir.startsWith(`${artifactsRoot}${path.sep}`)) {
    throw new Error('Invalid analysis artifact path.');
  }

  fs.mkdirSync(artifactsDir, { recursive: true });

  const baseName = sanitizePathSegment(analysis.input.fileName.replace(/\.[^.]+$/, '') || analysis.id);
  const correctedFileName = `${baseName}-corrected.csv`;
  const correctedFilePath = path.join(artifactsDir, correctedFileName);
  fs.writeFileSync(correctedFilePath, analysis.result.corrected_csv || '', 'utf8');

  const pdfFilePath = path.join(artifactsDir, 'audit-report.pdf');
  fs.writeFileSync(pdfFilePath, buildPdfBuffer(buildReportLines(analysis)));

  return {
    correctedCsvPath: correctedFilePath,
    reportPdfPath: pdfFilePath,
    correctedCsvUrl: `/api/v1/analyses/${analysis.id}/corrected.csv`,
    reportPdfUrl: `/api/v1/analyses/${analysis.id}/report.pdf`,
    correctedFileName,
  };
}

function sanitizePathSegment(value) {
  return String(value || 'artifact')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\.+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 160) || 'artifact';
}

function buildReportLines(analysis) {
  const report =
    analysis.result?.report_markdown ||
    analysis.result?.explanation?.executive_summary ||
    analysis.result?.explanation_summary ||
    'FairAI Audit Report';
  return report.split(/\r?\n/).flatMap((line) => wrapLine(line, 88));
}

function wrapLine(text, width) {
  if (!text) return [''];
  const words = String(text).split(/\s+/);
  const lines = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > width && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function buildPdfBuffer(lines) {
  const escaped = lines.map((line) => String(line).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)'));
  const pageLines = escaped.slice(0, 45);
  const stream = ['BT', '/F1 10 Tf', '50 780 Td', '14 TL'];
  pageLines.forEach((line, index) => {
    stream.push(index === 0 ? `(${line}) Tj` : `T* (${line}) Tj`);
  });
  stream.push('ET');
  const content = stream.join('\n');

  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Count 1 /Kids [3 0 R] >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj',
    '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
    `5 0 obj << /Length ${Buffer.byteLength(content, 'utf8')} >> stream\n${content}\nendstream endobj`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += `${object}\n`;
  }
  const xrefPos = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  return Buffer.from(pdf, 'utf8');
}
