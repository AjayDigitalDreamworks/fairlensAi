"use client";

import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import {
  formatMetric,
  formatRelativeTime,
  getCorrectedScore,
  getCorrectedSensitiveFindings,
} from "@/lib/analysis-insights";
import { getCorrectedCsvUrl, getPdfReportUrl, listAnalyses, uploadAnalysis } from "@/lib/api";
import { loadAnalysisHistory, saveAnalysis } from "@/lib/analysis-store";
import type { AnalysisLogEntry, AnalysisPayload, SensitiveFinding } from "@/types/analysis";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clapperboard,
  Download,
  Film,
  FileText,
  History,
  Loader2,
  Radar,
  ShieldAlert,
  ShieldCheck,
  Target,
  Upload,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";

const liveStages = [
  "Dataset received",
  "Schema extracted",
  "Domain identified",
  "Sensitive fields detected",
  "Prediction model prepared",
  "Fairness evaluation running",
  "Proxy-risk scan in progress",
  "Generating corrected output and report",
];

const ARCHIVE_PREVIEW_LIMIT = 4;

export default function DatasetAnalyzer() {
  const [file, setFile] = useState<File | null>(null);
  const [domain, setDomain] = useState("auto");
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [analysis, setAnalysis] = useState<AnalysisPayload | null>(null);
  const [history, setHistory] = useState<AnalysisPayload[]>([]);
  const [liveIndex, setLiveIndex] = useState(0);
  const [showFullArchive, setShowFullArchive] = useState(false);

  useEffect(() => {
    async function hydrateHistory() {
      try {
        const items = await listAnalyses();
        setHistory(items);
      } catch {
        setHistory(loadAnalysisHistory());
      }
    }

    hydrateHistory();
  }, []);

  useEffect(() => {
    if (!loading) {
      setLiveIndex(0);
      return;
    }

    const timer = window.setInterval(() => {
      setLiveIndex((current) => Math.min(current + 1, liveStages.length - 1));
    }, 800);

    return () => window.clearInterval(timer);
  }, [loading]);

  const liveFeed = useMemo<AnalysisLogEntry[]>(() => {
    if (!loading) return analysis?.result?.analysis_log ?? [];
    const now = new Date();
    return liveStages.map((stage, index) => ({
      timestamp: new Date(now.getTime() + index * 1000).toISOString(),
      stage: stage.toLowerCase().replace(/\s+/g, "_"),
      title: stage,
      detail:
        index < liveIndex
           ? `${stage} completed.`
          : index === liveIndex
            ? `${stage} in progress...`
            : `${stage} queued.`,
      status: index < liveIndex ? "completed" : index === liveIndex ? "running" : "pending",
    }));
  }, [analysis, liveIndex, loading]);

  const correctedScore = analysis ? getCorrectedScore(analysis) : null;
  const targetScore = analysis?.result?.fairness_summary?.fairness_target ?? 95;
  const targetDelta = typeof correctedScore === "number" ? Math.max(0, targetScore - correctedScore) : null;
  const visibleHistory = useMemo(
    () =>
      showFullArchive
        ? history
        : history.filter((item, index) => index < ARCHIVE_PREVIEW_LIMIT || item.id === analysis?.id),
    [analysis?.id, history, showFullArchive],
  );
  const hiddenHistoryCount = Math.max(0, history.length - visibleHistory.length);

  const worstFinding = useMemo(() => {
    if (!analysis) return null;
    return [...analysis.result.sensitive_findings].sort((left, right) => left.fairness_score - right.fairness_score)[0] || null;
  }, [analysis]);

  const correctedWorst = useMemo(() => {
    if (!analysis) return null;
    const correctedFindings = getCorrectedSensitiveFindings(analysis);
    return (correctedFindings && correctedFindings.length)
      ? [...correctedFindings].sort((left, right) => left.fairness_score - right.fairness_score)[0] || null
      : null;
  }, [analysis]);

  async function onSubmit() {
    if (!file) {
      setError("Please choose a dataset first.");
      return;
    }

    setLoading(true);
    setError("");
    setAnalysis(null);

    try {
      const form = new FormData();
      form.append("file", file);
      form.append("domain", domain);
      form.append("positiveLabel", "1");
      if (geminiApiKey.trim()) {
        form.append("geminiApiKey", geminiApiKey.trim());
      }
      const nextAnalysis = await uploadAnalysis(form);
      saveAnalysis(nextAnalysis);
      setAnalysis(nextAnalysis);
      setHistory((current) => [nextAnalysis, ...current.filter((item) => item.id !== nextAnalysis.id)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed.");
    } finally {
      setLoading(false);
    }
  }

  function inspectAnalysis(item: AnalysisPayload) {
    setAnalysis(item);
    saveAnalysis(item);
  }

  return (
    <Layout>
      <div className="space-y-8 pb-12">
        <section className="command-panel p-8">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[10px] font-mono uppercase tracking-[0.3em] text-emerald-300">
                <Clapperboard className="h-3.5 w-3.5" />
                Audit Pipeline
              </div>
              <h1 className="text-3xl font-bold text-white">Dataset Analyzer</h1>
              <p className="max-w-3xl text-sm leading-7 text-muted-foreground">
                Upload a dataset to run a complete fairness audit. FairLens will automatically detect sensitive columns, evaluate bias metrics, and generate a corrected output.
              </p>
            </div>

            <div className="grid grid-cols-4 gap-3">
              <HeroStat label="Auto-detection" value="ON" />
              <HeroStat label="Artifact mode" value="CSV + PDF" />
              <HeroStat label="Archive depth" value={String(history.length)} />
              <HeroStat label="Active pipeline" value={loading ? "RUNNING" : "STANDBY"} />
            </div>
          </div>
        </section>

        <div className="grid gap-8 xl:grid-cols-[1.2fr_0.8fr]">
          <section className="command-panel space-y-6 p-8">
            <div className="flex items-center gap-3">
              <Upload className="h-5 w-5 text-emerald-400" />
              <h2 className="text-xl font-semibold text-white">Upload Dataset</h2>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <label className="text-xs font-mono uppercase tracking-[0.3em] text-emerald-300">Dataset</label>
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls,.json,.parquet"
                  onChange={(event) => setFile(event.target.files?.[0] || null)}
                  className="w-full border border-white/10 bg-black/30 px-4 py-4 text-sm text-white"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-mono uppercase tracking-[0.3em] text-emerald-300">Domain</label>
                <select
                  value={domain}
                  onChange={(event) => setDomain(event.target.value)}
                  className="w-full border border-white/10 bg-black/30 px-4 py-3 text-sm text-white"
                >
                  <option value="auto">Auto-detect</option>
                  <option value="hiring">Hiring</option>
                  <option value="finance">Finance</option>
                  <option value="healthcare">Healthcare</option>
                  </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-mono uppercase tracking-[0.3em] text-emerald-300">Narrative API Key</label>
                <input
                  type="password"
                  value={geminiApiKey}
                  onChange={(event) => setGeminiApiKey(event.target.value)}
                  placeholder="Optional: used for plain-language audit narration"
                  className="w-full border border-white/10 bg-black/30 px-4 py-3 text-sm text-white"
                />
              </div>

              <div className="terminal-card p-4">
                <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-emerald-300">How it works</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  FairLens automatically detects target, prediction, and sensitive columns. It then calculates fairness metrics, generates SHAP explanations, applies corrections, and creates a full audit report.
                </p>
              </div>

              <div className="terminal-card p-4 md:col-span-2">
                <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-emerald-300">Narrative API (Optional)</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  If you provide a Narrative API key above, it will be used to generate plain-language audit summaries alongside the technical metrics.
                </p>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-3 border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
                <ShieldAlert className="mt-0.5 h-4 w-4" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              <Button onClick={onSubmit} disabled={loading} className="bg-emerald-500 font-semibold text-black hover:bg-emerald-400">
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                {loading ? "Running Audit..." : "Run Fairness Audit"}
              </Button>
              <div className="inline-flex items-center gap-2 border border-white/10 bg-black/20 px-4 py-3 text-xs uppercase tracking-[0.25em] text-muted-foreground">
                <Activity className="h-4 w-4 text-emerald-400" />
                {loading ? "Audit in progress" : "Ready"}
              </div>
            </div>

            {analysis && (
              <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                <div className="terminal-card p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-[10px] font-mono uppercase tracking-[0.35em] text-emerald-300">Latest result</p>
                      <h3 className="mt-2 text-2xl font-semibold text-white">{analysis.input.fileName}</h3>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Original fairness {analysis.result?.fairness_summary?.overall_fairness_score}% and corrected fairness{" "}
                        {typeof correctedScore === "number" ? `${correctedScore}%` : "not available yet"}.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <Button asChild className="bg-emerald-500 text-black hover:bg-emerald-400">
                        <Link to="/dashboard">
                          Open trend dashboard
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                      </Button>
                      <Button asChild variant="outline" className="border-white/10 text-white hover:bg-white/5">
                        <Link to="/explainability">Open explanations</Link>
                      </Button>
                      <Button asChild variant="outline" className="border-white/10 text-white hover:bg-white/5">
                      <Link to={`/simulator?bias=${Math.round((analysis.result?.fairness_summary?.disparate_impact || 0) * 100)}&attribute=${encodeURIComponent(worstFinding?.sensitive_column || "Attribute")}`}>Simulate Impact</Link>
                      </Button>
                      <Button asChild variant="outline" className="border-white/10 text-white hover:bg-white/5">
                        <Link to="/reports">Open report</Link>
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="score-target-card p-5">
                  <p className="text-[10px] font-mono uppercase tracking-[0.35em] text-emerald-300">{targetScore}+ target</p>
                  <p className="mt-3 text-4xl font-bold text-white">{typeof correctedScore === "number" ? `${correctedScore}%` : "--"}</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {typeof correctedScore !== "number"
                      ? "Corrected score unavailable."
                      : correctedScore >= targetScore
                        ? "Target crossed. Corrected output is now in the safe release band."
                        : `${targetDelta?.toFixed(2)} points more remediation still needed to reach ${targetScore}+.`}
                  </p>
                </div>
              </div>
            )}
          </section>

          <section className="command-panel p-8">
            <div className="mb-5 flex items-center gap-3">
              <Film className="h-5 w-5 text-emerald-400" />
              <h2 className="text-xl font-semibold text-white">Pipeline Progress</h2>
            </div>

            <div className="movie-feed">
              {liveFeed.length ? (
                liveFeed.map((entry, index) => (
                  <LiveFeedRow key={`${entry.stage}-${entry.timestamp || index}`} entry={entry} active={loading && index === liveIndex} />
                ))
              ) : (
                <div className="terminal-card p-5 text-sm text-muted-foreground">
                  Launch a FairLens analysis to start the live pipeline feed.
                </div>
              )}
            </div>
          </section>
        </div>

        <section className="command-panel p-8">
          <div className="mb-5 flex items-center gap-3">
            <Radar className="h-5 w-5 text-emerald-400" />
            <h2 className="text-xl font-semibold text-white">Analysis Log</h2>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-4">
              {liveFeed.length ? (
                liveFeed.map((entry, index) => (
                  <LogTimelineRow key={`${entry.stage}-timeline-${entry.timestamp || index}`} entry={entry} />
                ))
              ) : (
                <div className="terminal-card p-5 text-sm text-muted-foreground">
                  The detailed timeline appears here after you launch an audit.
                </div>
              )}
            </div>

            <div className="terminal-card space-y-4 p-5">
               <p className="text-[10px] font-mono uppercase tracking-[0.35em] text-emerald-300">What this audit covers</p>
               <Checklist text="CSV / XLS / XLSX file upload with automatic parsing" />
               <Checklist text="Domain detection or manual domain selection" />
               <Checklist text="Automatic target and sensitive column detection" />
               <Checklist text="Prediction generation when no prediction column exists" />
               <Checklist text="Fairness score, disparate impact, accuracy, and group metrics" />
               <Checklist text="Proxy-risk detection and remediation recommendations" />
               <Checklist text="Corrected dataset output after the audit completes" />
            </div>
          </div>
        </section>

        {analysis && (
          <>
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
              <DetailScoreCard label="Original fairness" value={`${analysis.result?.fairness_summary?.overall_fairness_score}%`} icon={BarChart3} tone="default" />
              <DetailScoreCard label="Corrected fairness" value={typeof correctedScore === "number" ? `${correctedScore}%` : "--"} icon={ShieldCheck} tone="success" />
              <DetailScoreCard label="Target gap" value={typeof targetDelta === "number" ? targetDelta.toFixed(2) : "--"} icon={Target} tone="warning" />
              <DetailScoreCard label="Reports stored" value={String(history.length || 1)} icon={History} tone="default" />
            </div>

            <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
              <section className="command-panel space-y-6 p-8">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="h-5 w-5 text-emerald-400" />
                  <h2 className="text-xl font-semibold text-white">Correction Outcome</h2>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <OutcomeCard
                    title="Before correction"
                    score={analysis.result?.fairness_summary?.overall_fairness_score ?? 0}
                    risk={analysis.result?.fairness_summary?.risk_level ?? "unknown"}
                    note="Raw audit result before remediation preview."
                  />
                  <OutcomeCard
                    title="After correction"
                    score={typeof correctedScore === "number" ? correctedScore : (analysis.result?.fairness_summary?.overall_fairness_score ?? 0)}
                    risk={analysis.result?.artifacts?.corrected_fairness_summary?.risk_level || (analysis.result?.fairness_summary?.risk_level ?? "unknown")}
                    note={
                      typeof correctedScore === "number" && correctedScore >= targetScore
                        ? `${targetScore}+ target crossed in corrected output.`
                        : "Corrected output improved the dataset, but the safe-release threshold still depends on real bias severity."
                    }
                  />
                </div>

                <div className="terminal-card p-5">
                   <p className="text-[10px] font-mono uppercase tracking-[0.35em] text-emerald-300">Executive summary</p>
                  <p className="mt-3 text-sm leading-7 text-muted-foreground">{analysis.result?.explanation?.executive_summary}</p>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <SignalPanel
                    title="Detected setup"
                    items={[
                      `Domain: ${analysis.result?.metadata?.domain ?? "unknown"}`,
                      `Target column: ${analysis.result?.metadata?.target_column ?? "auto-generated"}`,
                      `Prediction column: ${analysis.result?.metadata?.prediction_column ?? "auto-generated"}`,
                      `Sensitive columns: ${analysis.result?.metadata?.sensitive_columns?.join(", ") ?? "none detected"}`,
                    ]}
                  />
                  <SignalPanel
                    title="Analysis summary"
                    items={[
                      `Rows analyzed: ${analysis.result?.metadata?.rows ?? 0}`,
                      `Risk level: ${analysis.result?.fairness_summary?.risk_level ?? "unknown"}`,
                      `Worst original attribute: ${worstFinding?.sensitive_column ?? "none"}`,
                      `Worst corrected attribute: ${correctedWorst?.sensitive_column ?? "not generated"}`,
                    ]}
                  />
                </div>
              </section>

              <section className="command-panel space-y-6 p-8">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-emerald-400" />
                  <h2 className="text-xl font-semibold text-white">Audit Notes</h2>
                </div>
                <FindingCard title="Original high-risk finding" finding={worstFinding} />
                <FindingCard title="Corrected high-risk finding" finding={correctedWorst} />
              </section>
            </div>

            <section className="command-panel p-8">
              <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <History className="h-5 w-5 text-emerald-400" />
                  <div>
                    <h2 className="text-xl font-semibold text-white">Recent Analysis Archive</h2>
                    <p className="mt-1 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                      Showing {visibleHistory.length} of {history.length} saved audits
                    </p>
                  </div>
                </div>
                <div className="inline-flex items-center border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-[10px] font-mono uppercase tracking-[0.3em] text-emerald-300">
                  {history.length} total
                </div>
              </div>

              <div className="grid gap-6 xl:grid-cols-[1fr_0.95fr]">
                <div className="space-y-3">
                  <div className="max-h-[28rem] space-y-3 overflow-y-auto pr-2">
                    {visibleHistory.map((item) => {
                      const itemCorrected = getCorrectedScore(item) ?? item.result?.fairness_summary?.overall_fairness_score ?? 0;

                      return (
                        <button
                          key={item.id}
                          onClick={() => inspectAnalysis(item)}
                          className={`w-full border p-4 text-left transition ${
                            analysis && item.id === analysis.id
                              ? "border-emerald-500/40 bg-emerald-500/10"
                              : "border-white/10 bg-black/20 hover:border-emerald-500/30 hover:bg-white/5"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="font-medium text-white">{item.input?.fileName ?? "Unnamed Dataset"}</p>
                              <p className="mt-1 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                                {item.result?.metadata?.domain ?? "unknown"} | {formatRelativeTime(item.createdAt)}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm text-emerald-300">{formatMetric(itemCorrected)}%</p>
                              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">corrected</p>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {history.length > ARCHIVE_PREVIEW_LIMIT && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowFullArchive((current) => !current)}
                      className="w-full border-white/10 bg-black/20 text-white hover:bg-white/5"
                    >
                      {showFullArchive
                        ? "Show fewer archive entries"
                        : `Show ${hiddenHistoryCount} more ${hiddenHistoryCount === 1 ? "entry" : "entries"}`}
                    </Button>
                  )}
                </div>

                <div className="space-y-4">
                  <div className="terminal-card p-5">
                    <p className="text-[10px] font-mono uppercase tracking-[0.35em] text-emerald-300">Artifact access</p>
                    <div className="mt-4 grid gap-3">
                      <a
                        href={getPdfReportUrl(analysis.id)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-between border border-white/10 bg-black/20 px-4 py-3 text-sm text-white hover:bg-white/5"
                      >
                        <span className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-emerald-400" />
                          Audit PDF
                        </span>
                        <Download className="h-4 w-4 text-muted-foreground" />
                      </a>
                      <a
                        href={getCorrectedCsvUrl(analysis.id)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-between border border-white/10 bg-black/20 px-4 py-3 text-sm text-white hover:bg-white/5"
                      >
                        <span className="flex items-center gap-2">
                          <Download className="h-4 w-4 text-emerald-400" />
                          Corrected CSV
                        </span>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      </a>
                    </div>
                  </div>

                  <div className="terminal-card p-5">
                    <p className="text-[10px] font-mono uppercase tracking-[0.35em] text-emerald-300">Plain language summary</p>
                    <div className="mt-4 space-y-3">
                      {analysis.result?.explanation?.plain_language?.map((line) => (
                        <p key={line} className="text-sm text-muted-foreground">
                          {line}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </Layout>
  );
}

function LiveFeedRow({ entry, active }: { entry: AnalysisLogEntry; active: boolean }) {
  const status = entry.status || "pending";
  const dotClass =
    status === "completed" || status === "complete"
      ? "bg-emerald-400"
      : status === "running"
        ? "bg-amber-400"
        : "bg-white/20";

  return (
    <div className={`movie-feed-row ${active ? "movie-feed-row-active" : ""}`}>
      <div className={`movie-feed-dot ${dotClass} ${status === "running" ? "animate-pulse" : ""}`} />
      <div className="flex-1">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-white">{entry.title || entry.stage}</p>
          <span className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{status}</span>
        </div>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{entry.detail || entry.message}</p>
      </div>
    </div>
  );
}

function LogTimelineRow({ entry }: { entry: AnalysisLogEntry }) {
  const status = entry.status || "pending";

  return (
    <div className="relative pl-7">
      <div className={`absolute left-0 top-1 h-3 w-3 rounded-full ${status === "running" ? "bg-amber-400 animate-pulse" : "bg-emerald-400"} shadow-[0_0_12px_rgba(16,185,129,0.7)]`} />
      <div className="absolute left-[5px] top-5 h-full w-px bg-emerald-500/20" />
      <div className="terminal-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold text-white">{entry.title || entry.stage}</p>
          <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-emerald-300">{status}</span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{entry.detail || entry.message}</p>
      </div>
    </div>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="terminal-card p-4">
      <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-xl font-semibold text-white">{value}</p>
    </div>
  );
}

function Checklist({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-muted-foreground">
      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
      <span>{text}</span>
    </div>
  );
}

function DetailScoreCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: typeof BarChart3;
  tone: "default" | "success" | "warning";
}) {
  const toneClass =
    tone === "success"
      ? "border-emerald-500/30 bg-emerald-500/10"
      : tone === "warning"
        ? "border-amber-500/30 bg-amber-500/10"
        : "border-white/10 bg-black/20";

  return (
    <div className={`terminal-card p-5 ${toneClass}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-emerald-400" />
      </div>
      <p className="mt-3 text-4xl font-bold text-white">{value}</p>
    </div>
  );
}

function OutcomeCard({ title, score, risk, note }: { title: string; score: number; risk: string; note: string }) {
  return (
    <div className="score-target-card p-5">
      <p className="text-[10px] font-mono uppercase tracking-[0.35em] text-emerald-300">{title}</p>
      <p className="mt-3 text-4xl font-bold text-white">{formatMetric(score)}%</p>
      <p className="mt-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">{risk}</p>
      <p className="mt-3 text-sm text-muted-foreground">{note}</p>
    </div>
  );
}

function SignalPanel({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="terminal-card p-5">
      <p className="text-[10px] font-mono uppercase tracking-[0.35em] text-emerald-300">{title}</p>
      <div className="mt-4 space-y-3">
        {items.map((item) => (
          <p key={item} className="text-sm text-muted-foreground">
            {item}
          </p>
        ))}
      </div>
    </div>
  );
}

function FindingCard({ title, finding }: { title: string; finding: SensitiveFinding | null }) {
  if (!finding) {
    return (
      <div className="terminal-card p-5">
        <p className="text-[10px] font-mono uppercase tracking-[0.35em] text-emerald-300">{title}</p>
        <p className="mt-3 text-sm text-muted-foreground">No finding available.</p>
      </div>
    );
  }

  return (
    <div className="terminal-card p-5">
      <p className="text-[10px] font-mono uppercase tracking-[0.35em] text-emerald-300">{title}</p>
      <p className="mt-3 text-2xl font-semibold text-white">{finding.sensitive_column}</p>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-muted-foreground">
        <p>Fairness: {formatMetric(finding.fairness_score)}%</p>
        <p>Risk: {finding.risk_level}</p>
        <p>DI: {finding.disparate_impact}</p>
        <p>DP gap: {finding.demographic_parity_difference}</p>
      </div>
      <div className="mt-4 space-y-2">
        {finding.notes?.map((note) => (
          <p key={note} className="text-sm text-muted-foreground">
            - {note}
          </p>
        )) ?? <p className="text-sm text-muted-foreground opacity-50">No additional notes.</p>}
      </div>
    </div>
  );
}
