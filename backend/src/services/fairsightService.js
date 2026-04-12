import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import { env } from '../config/env.js';
import { ModelAnalysis } from '../models/ModelAnalysis.js';

const client = axios.create({
  baseURL: env.pythonServiceUrl,
  timeout: 120000,
});

function wrapFairsightError(error) {
  if (error?.code === 'ECONNREFUSED' || error?.cause?.code === 'ECONNREFUSED') {
    const wrapped = new Error(`ML service is not reachable at ${env.pythonServiceUrl}. Start the FastAPI service and try again.`);
    wrapped.status = 503;
    wrapped.code = 'ML_SERVICE_UNAVAILABLE';
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

export async function uploadFairsightAssets({ modelPath, modelName, csvPath, csvName }) {
  try {
    const form = new FormData();
    form.append('model_file', fs.createReadStream(modelPath), modelName);
    form.append('csv_file', fs.createReadStream(csvPath), csvName);

    const { data } = await client.post('/fairsight/upload', form, {
      headers: form.getHeaders(),
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });

    try {
      if (data && data.session_id) {
        await ModelAnalysis.create({
          sessionId: data.session_id,
          modelName: modelName,
        });
      }
    } catch (dbErr) {
      console.error('Failed to create model analysis record', dbErr);
    }

    return data;
  } catch (error) {
    wrapFairsightError(error);
  }
}

export async function detectFairsightBias(payload) {
  try {
    const { data } = await client.post('/fairsight/detect', payload);
    
    try {
      await ModelAnalysis.updateOne(
        { sessionId: payload.session_id },
        { 
          labelCol: payload.label_col,
          sensitiveCol: payload.sensitive_col,
          detectReport: data,
          updatedAt: new Date()
        }
      );
    } catch (dbErr) {
      console.error('Failed to save detect report to DB', dbErr);
    }

    return data;
  } catch (error) {
    wrapFairsightError(error);
  }
}

export async function mitigateFairsightBias(payload) {
  try {
    const { data } = await client.post('/fairsight/mitigate', payload);

    try {
      await ModelAnalysis.updateOne(
        { sessionId: payload.session_id },
        { 
          mitigationResult: data,
          updatedAt: new Date()
        }
      );
    } catch (dbErr) {
      console.error('Failed to save mitigation result to DB', dbErr);
    }

    return data;
  } catch (error) {
    wrapFairsightError(error);
  }
}

export async function getFairsightSuggestions(payload) {
  try {
    const { data } = await client.post('/fairsight/gemini-suggestions', payload);
    return data;
  } catch (error) {
    wrapFairsightError(error);
  }
}

export async function getFairsightExplain(payload) {
  try {
    const { data } = await client.post('/fairsight/explain', payload);
    return data;
  } catch (error) {
    wrapFairsightError(error);
  }
}


export async function downloadFairsightModel(sessionId) {
  try {
    const response = await client.get(`/fairsight/download-model/${sessionId}`, {
      responseType: 'stream'
    });
    return response.data;
  } catch (error) {
    wrapFairsightError(error);
  }
}

export async function downloadFairsightReport(sessionId) {
  try {
    const response = await client.get(`/fairsight/download-report/${sessionId}`, {
      responseType: 'stream'
    });
    return response.data;
  } catch (error) {
    wrapFairsightError(error);
  }
}

export async function getFairsightHistory() {
  try {
    const history = await ModelAnalysis.find().sort({ createdAt: -1 }).maxTimeMS(5000).lean();
    return history;
  } catch (error) {
    console.error('Failed to fetch model analysis history:', error.message);
    return [];
  }
}

