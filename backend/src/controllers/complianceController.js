import {
  calculateCost,
  calculateROI,
  checkViolations,
  getCounterfactual,
  detectDrift,
  attributeBias,
  getRegulations,
  getDemoData,
} from '../services/complianceService.js';

export async function costCalculator(req, res, next) {
  try {
    const result = await calculateCost(req.body);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function roiCalculator(req, res, next) {
  try {
    const result = await calculateROI(req.body);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function violationChecker(req, res, next) {
  try {
    const result = await checkViolations(req.body);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function counterfactualAnalysis(req, res, next) {
  try {
    const result = await getCounterfactual(req.body);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function driftDetection(req, res, next) {
  try {
    const result = await detectDrift(req.body);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function biasAttribution(req, res, next) {
  try {
    const result = await attributeBias(req.body);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function regulationsLookup(req, res, next) {
  try {
    const result = await getRegulations(req.params.domain);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function demoDataLookup(req, res, next) {
  try {
    const result = await getDemoData(req.params.domain);
    res.json(result);
  } catch (error) {
    next(error);
  }
}
