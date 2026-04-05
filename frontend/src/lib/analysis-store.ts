import { AnalysisPayload } from "@/types/analysis";

const LATEST_KEY = "fairai-latest-analysis-id";

export function saveAnalysis(analysis: AnalysisPayload) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LATEST_KEY, analysis.id);
}

export function removeAnalysis(id: string) {
  if (typeof window === "undefined") return;
  const latestId = window.localStorage.getItem(LATEST_KEY);
  if (latestId === id) {
    window.localStorage.removeItem(LATEST_KEY);
  }
}

export function loadAnalyses(): AnalysisPayload[] {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem("fairai-analysis-history");
  }
  return [];
}

export function loadAnalysisHistory(): AnalysisPayload[] {
  return [];
}

export function loadLatestAnalysis(): AnalysisPayload | null {
  if (typeof window === "undefined") return null;
  const latestId = window.localStorage.getItem(LATEST_KEY);
  if (latestId) {
    return { id: latestId } as AnalysisPayload;
  }
  return null;
}

export function loadAnalysis(id?: string): AnalysisPayload | null {
  if (typeof window === "undefined") return null;
  const targetId = id || window.localStorage.getItem(LATEST_KEY);
  if (targetId) {
    return { id: targetId } as AnalysisPayload;
  }
  return null;
}
