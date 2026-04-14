/**
 * compliance-api.ts — Frontend API client for FairSight Compliance Engine
 * Provides typed access to cost calculator, ROI, violations, counterfactual,
 * drift detection, bias attribution, and real-time monitoring via WebSocket.
 */

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api/v1";
const ML_URL = import.meta.env.VITE_ML_URL || "http://localhost:8000";

async function postJSON<T>(url: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `Request failed: ${response.status}`);
  }
  return response.json();
}

async function getJSON<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json();
}

// ─── Cost Calculator ───
export async function calculateCost(params: {
  severity?: string;
  domain?: string;
  disparate_impact?: number;
  dpd?: number;
  eod?: number;
  portfolio_size?: number;
  avg_transaction_value?: number;
  affected_group_pct?: number;
}) {
  return postJSON(`${API_URL}/compliance/cost-calculator`, params);
}

// ─── ROI Calculator ───
export async function calculateROI(params: {
  domain?: string;
  portfolio_size?: number;
  avg_transaction_value?: number;
  before_severity?: string;
  after_severity?: string;
  disparate_impact_before?: number;
  disparate_impact_after?: number;
  dpd_before?: number;
  dpd_after?: number;
  eod_before?: number;
  eod_after?: number;
  fairness_score_before?: number;
  fairness_score_after?: number;
}) {
  return postJSON(`${API_URL}/compliance/roi`, params);
}

// ─── Compliance Violations ───
export async function checkViolations(params: {
  domain?: string;
  sensitive_column?: string;
  disparate_impact?: number;
  dpd?: number;
  eod?: number;
  fairness_score?: number;
  group_metrics?: Array<Record<string, unknown>>;
}) {
  return postJSON(`${API_URL}/compliance/check-violations`, params);
}

// ─── Counterfactual ───
export async function runCounterfactual(params: {
  domain?: string;
  disparate_impact?: number;
  dpd?: number;
  eod?: number;
  group_metrics?: Array<Record<string, unknown>>;
}) {
  return postJSON(`${API_URL}/compliance/counterfactual`, params);
}

// ─── Drift Detection ───
export async function detectDrift(params: {
  historical_values: number[];
  threshold?: number;
  slack?: number;
}) {
  return postJSON(`${API_URL}/compliance/drift-detection`, params);
}

// ─── Bias Attribution ───
export async function attributeBias(params: {
  group_metrics?: Array<Record<string, unknown>>;
  dpd?: number;
  eod?: number;
  disparate_impact?: number;
  explainability_data?: Record<string, unknown>;
}) {
  return postJSON(`${API_URL}/compliance/bias-attribution`, params);
}

// ─── Regulations lookup ───
export async function getRegulations(domain: string) {
  return getJSON(`${API_URL}/compliance/regulations/${domain}`);
}

// ─── Demo data ───
export async function getDemoData(domain: string): Promise<any> {
  return getJSON(`${API_URL}/compliance/demo-data/${domain}`);
}

// ─── WebSocket Real-Time Monitor ───
export function connectFairnessMonitor(
  domain: string,
  onMessage: (data: any) => void,
  onError?: (error: Event) => void,
  onClose?: () => void
): WebSocket {
  const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${wsProtocol}//localhost:8000/fairsight/compliance/ws/monitor/${domain}`;
  const ws = new WebSocket(wsUrl);

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      onMessage(data);
    } catch {
      console.error("Failed to parse WebSocket message");
    }
  };

  ws.onerror = (event) => {
    console.error("WebSocket error:", event);
    onError?.(event);
  };

  ws.onclose = () => {
    onClose?.();
  };

  return ws;
}

// ─── Helper: format dollar amounts ───
export function formatDollar(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
  return `$${amount.toFixed(0)}`;
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}
