import { AnalysisPayload } from "@/types/analysis";

const LATEST_KEY = "fairai-latest-analysis-id";
const HISTORY_KEY = "fairai-analysis-history";

function readHistory(): AnalysisPayload[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(HISTORY_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as AnalysisPayload[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeHistory(items: AnalysisPayload[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(HISTORY_KEY, JSON.stringify(items));
}

export function saveAnalysis(analysis: AnalysisPayload) {
  if (typeof window === "undefined") return;
  const next = [analysis, ...readHistory().filter((item) => item.id !== analysis.id)].slice(0, 20);
  writeHistory(next);
  window.localStorage.setItem(LATEST_KEY, analysis.id);
}

export function loadAnalyses(): AnalysisPayload[] {
  return readHistory();
}

export function loadAnalysisHistory(): AnalysisPayload[] {
  return readHistory();
}

export function loadLatestAnalysis(): AnalysisPayload | null {
  if (typeof window === "undefined") return null;
  const latestId = window.localStorage.getItem(LATEST_KEY);
  const history = readHistory();
  if (!latestId) return history[0] ?? null;
  return history.find((item) => item.id === latestId) ?? history[0] ?? null;
}

export function loadAnalysis(id?: string): AnalysisPayload | null {
  if (!id) return loadLatestAnalysis();
  return readHistory().find((item) => item.id === id) ?? null;
}
