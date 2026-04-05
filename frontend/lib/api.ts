import { AnalysisPayload } from "@/types/analysis";

const API_URL =
  import.meta.env.VITE_API_URL ||
  "http://localhost:4000/api/v1";

async function parseError(response: Response, fallback: string): Promise<never> {
  const payload = await response.json().catch(() => ({ message: fallback }));
  throw new Error(payload.message || fallback);
}

export async function uploadAnalysis(formData: FormData): Promise<AnalysisPayload> {
  const response = await fetch(`${API_URL}/analyses/upload`, {
    method: "POST",
    body: formData,
  });
  if (!response.ok) {
    return parseError(response, "Upload failed");
  }
  return response.json();
}

export async function createMitigationPreview(analysisId: string, strategy: string): Promise<AnalysisPayload> {
  const response = await fetch(`${API_URL}/analyses/${analysisId}/mitigation-preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ strategy }),
  });
  if (!response.ok) {
    return parseError(response, "Mitigation preview failed");
  }
  return response.json();
}

export async function generateGeminiExplanation(analysisId: string): Promise<AnalysisPayload> {
  const response = await fetch(`${API_URL}/analyses/${analysisId}/gemini-explanation`, {
    method: "POST",
  });
  if (!response.ok) {
    return parseError(response, "Gemini explanation failed");
  }
  return response.json();
}

export async function listAnalyses(): Promise<AnalysisPayload[]> {
  const response = await fetch(`${API_URL}/analyses`);
  if (!response.ok) {
    return parseError(response, "Failed to load analyses");
  }
  const payload = await response.json();
  return payload.items ?? [];
}

export async function deleteAnalysis(analysisId: string): Promise<{ id: string }> {
  const response = await fetch(`${API_URL}/analyses/${analysisId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    return parseError(response, "Failed to delete analysis");
  }
  return response.json();
}

export async function getAnalysis(analysisId: string): Promise<AnalysisPayload> {
  const response = await fetch(`${API_URL}/analyses/${analysisId}`);
  if (!response.ok) {
    return parseError(response, "Failed to load analysis");
  }
  return response.json();
}

export function getCorrectedCsvUrl(analysisId: string) {
  return `${API_URL}/analyses/${analysisId}/corrected.csv`;
}

export function getPdfReportUrl(analysisId: string) {
  return `${API_URL}/analyses/${analysisId}/report.pdf`;
}
