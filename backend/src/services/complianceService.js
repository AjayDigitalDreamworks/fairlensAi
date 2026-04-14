import axios from 'axios';
import { env } from '../config/env.js';

const ML_URL = env.mlServiceUrl || 'http://localhost:8000';

export async function calculateCost(payload) {
  const res = await axios.post(`${ML_URL}/fairsight/compliance/cost-calculator`, payload, { timeout: 30000 });
  return res.data;
}

export async function calculateROI(payload) {
  const res = await axios.post(`${ML_URL}/fairsight/compliance/roi`, payload, { timeout: 30000 });
  return res.data;
}

export async function checkViolations(payload) {
  const res = await axios.post(`${ML_URL}/fairsight/compliance/check-violations`, payload, { timeout: 30000 });
  return res.data;
}

export async function getCounterfactual(payload) {
  const res = await axios.post(`${ML_URL}/fairsight/compliance/counterfactual`, payload, { timeout: 30000 });
  return res.data;
}

export async function detectDrift(payload) {
  const res = await axios.post(`${ML_URL}/fairsight/compliance/drift-detection`, payload, { timeout: 30000 });
  return res.data;
}

export async function attributeBias(payload) {
  const res = await axios.post(`${ML_URL}/fairsight/compliance/bias-attribution`, payload, { timeout: 30000 });
  return res.data;
}

export async function getRegulations(domain) {
  const res = await axios.get(`${ML_URL}/fairsight/compliance/regulations/${domain}`, { timeout: 15000 });
  return res.data;
}

export async function getDemoData(domain) {
  const res = await axios.get(`${ML_URL}/fairsight/compliance/demo-data/${domain}`, { timeout: 15000 });
  return res.data;
}
