import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import { env } from '../config/env.js';

const client = axios.create({
  baseURL: env.pythonServiceUrl,
  timeout: 300000,
});

function wrapPythonServiceError(error) {
  if (error?.code === 'ECONNREFUSED' || error?.cause?.code === 'ECONNREFUSED') {
    const wrapped = new Error(`ML service is not reachable at ${env.pythonServiceUrl}. Start the FastAPI service and try again.`);
    wrapped.status = 503;
    wrapped.code = 'ML_SERVICE_UNAVAILABLE';
    throw wrapped;
  }

  if (error?.code === 'ECONNABORTED') {
    const wrapped = new Error('ML analysis timed out. Try a smaller dataset or restart the ML service.');
    wrapped.status = 504;
    wrapped.code = 'ML_SERVICE_TIMEOUT';
    throw wrapped;
  }

  if (error?.response?.data?.detail) {
    const wrapped = new Error(error.response.data.detail);
    wrapped.status = error.response.status || 500;
    wrapped.code = 'ML_SERVICE_ERROR';
    throw wrapped;
  }

  throw error;
}

export async function healthCheckPython() {
  try {
    const { data } = await client.get('/health', { timeout: 5000 });
    return data;
  } catch (error) {
    wrapPythonServiceError(error);
  }
}

export async function analyzeFile({ filePath, originalName, domain, targetColumn, predictionColumn, sensitiveColumns, positiveLabel, geminiApiKey }) {
  try {
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
  } catch (error) {
    wrapPythonServiceError(error);
  }
}

export async function mitigationPreview(payload) {
  try {
    const { data } = await client.post('/mitigate/preview', payload, { timeout: 30000 });
    return data;
  } catch (error) {
    wrapPythonServiceError(error);
  }
}
