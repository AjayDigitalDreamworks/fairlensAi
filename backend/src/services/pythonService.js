import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import { env } from '../config/env.js';

const client = axios.create({
  baseURL: env.pythonServiceUrl,
  timeout: 600000,
});

export async function healthCheckPython() {
  const { data } = await client.get('/health');
  return data;
}

export async function analyzeFile({ filePath, originalName, domain, targetColumn, predictionColumn, sensitiveColumns, positiveLabel, geminiApiKey }) {
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath), originalName);
  form.append('domain', domain || 'auto');
  form.append('target_column', targetColumn || '');
  form.append('prediction_column', predictionColumn || '');
  form.append('sensitive_columns', JSON.stringify(sensitiveColumns || []));
  form.append('positive_label', positiveLabel ?? '1');
  if (geminiApiKey) {
    form.append('gemini_api_key', geminiApiKey);
  }

  const { data } = await client.post('/analyze/file', form, {
    headers: form.getHeaders(),
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });

  return data;
}

export async function mitigationPreview(payload) {
  const { data } = await client.post('/mitigate/preview', payload);
  return data;
}
