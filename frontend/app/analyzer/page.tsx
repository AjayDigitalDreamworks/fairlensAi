"use client";

import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { uploadAnalysis } from "@/lib/api";
import { saveAnalysis } from "@/lib/analysis-store";
import type { AnalysisLogEntry, AnalysisPayload } from "@/types/analysis";
import { Activity, ArrowRight, CheckCircle2, Clapperboard, Film, Loader2, Radar, ShieldAlert, Upload } from "lucide-react";
import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";

const liveStages = [
  "Dataset payload received",
  "Schema signature extracted",
  "Domain fingerprint resolved",
  "Target and sensitive fields detected",
  "Surrogate prediction lane prepared",
  "Fairness core evaluating group drift",
  "Proxy-risk scan assembling evidence",
  "Correction and report artifacts rendering",
];

export default function DatasetAnalyzer() {
  const [file, setFile] = useState<File | null>(null);
  const [domain, setDomain] = useState("auto");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [analysis, setAnalysis] = useState<AnalysisPayload | null>(null);
  const [liveIndex, setLiveIndex] = useState(0);

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
    if (!loading) return analysis?.result.analysis_log ?? [];
    const now = new Date();
    return liveStages.map((stage, index) => ({
      timestamp: new Date(now.getTime() + index * 1000).toISOString(),
      stage: stage.toLowerCase().replace(/\s+/g, "_"),
      title: stage,
      detail:
        index < liveIndex
          ? `${stage} completed with no blocking issue.`
          : index === liveIndex
            ? `${stage} currently running in the analysis theater.`
            : `${stage} is queued in the fairness pipeline.`,
      status: index < liveIndex ? "completed" : index === liveIndex ? "running" : "pending",
    }));
  }, [analysis, liveIndex, loading]);

  const correctedScore =
    analysis?.result.artifacts?.corrected_fairness_summary?.overall_fairness_score ??
    analysis?.result.fairness_summary.corrected_fairness_score;

  const targetDelta = typeof correctedScore === "number" ? Math.max(0, 95 - correctedScore) : null;

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
      const nextAnalysis = await uploadAnalysis(form);
      saveAnalysis(nextAnalysis);
      setAnalysis(nextAnalysis);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Layout>
      <div className="space-y-8 pb-12">
        <section className="command-panel p-8">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[10px] font-mono uppercase tracking-[0.3em] text-emerald-300">
                <Clapperboard className="h-3.5 w-3.5" />
                Analyzer Control Room
              </div>
              <h1 className="text-3xl font-bold text-white">Live Feed Analysis Studio</h1>
              <p className="max-w-3xl text-sm leading-7 text-muted-foreground">
                Dataset upload se lekar corrected fairness output tak poora pipeline cinematic control-room style mein dikh raha hai.
                Aap sirf file aur domain do, baaki target, prediction, sensitive columns, fairness audit aur correction preview engine handle karega.
              </p>
            </div>

            <div className="grid min-w-[260px] grid-cols-2 gap-3">
              <HeroStat label="Auto-detection" value="ON" />
              <HeroStat label="Artifact mode" value="CSV + PDF" />
              <HeroStat label="Correction target" value="95+" />
              <HeroStat label="Pipeline state" value={loading ? "LIVE" : "IDLE"} />
            </div>
          </div>
        </section>

        <div className="grid gap-8 xl:grid-cols-[1.2fr_0.8fr]">
          <section className="command-panel space-y-6 p-8">
            <div className="flex items-center gap-3">
              <Upload className="h-5 w-5 text-emerald-400" />
              <h2 className="text-xl font-semibold text-white">Mission Input</h2>
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

              <div className="terminal-card p-4">
                <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-emerald-300">Automation layer</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Target, prediction, sensitive fields, fairness metrics, proxy scan, correction output, and report packaging run automatically.
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
                {loading ? "Running cinematic analysis..." : "Launch fairness analysis"}
              </Button>
              <div className="inline-flex items-center gap-2 border border-white/10 bg-black/20 px-4 py-3 text-xs uppercase tracking-[0.25em] text-muted-foreground">
                <Activity className="h-4 w-4 text-emerald-400" />
                {loading ? "Pipeline active" : "Ready for upload"}
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
                        Original fairness {analysis.result.fairness_summary.overall_fairness_score}% and corrected fairness{" "}
                        {typeof correctedScore === "number" ? `${correctedScore}%` : "not available yet"}.
                      </p>
                    </div>
                    <div className="flex gap-3">
                      <Button asChild className="bg-emerald-500 text-black hover:bg-emerald-400">
                        <Link to="/dashboard">
                          Open dashboard
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                      </Button>
                      <Button asChild variant="outline" className="border-white/10 text-white hover:bg-white/5">
                        <Link to="/reports">Open report</Link>
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="score-target-card p-5">
                  <p className="text-[10px] font-mono uppercase tracking-[0.35em] text-emerald-300">95+ target</p>
                  <p className="mt-3 text-4xl font-bold text-white">{typeof correctedScore === "number" ? `${correctedScore}%` : "--"}</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {typeof correctedScore !== "number"
                      ? "Corrected score unavailable."
                      : correctedScore >= 95
                        ? "Target crossed. Corrected output is now in the safe release band."
                        : `${targetDelta?.toFixed(2)} points more remediation still needed to reach 95+.`}
                  </p>
                </div>
              </div>
            )}
          </section>

          <section className="command-panel p-8">
            <div className="mb-5 flex items-center gap-3">
              <Film className="h-5 w-5 text-emerald-400" />
              <h2 className="text-xl font-semibold text-white">Live Feed Analysis</h2>
            </div>

            <div className="movie-feed">
              {liveFeed.map((entry, index) => (
                <LiveFeedRow key={`${entry.stage}-${entry.timestamp || index}`} entry={entry} active={loading && index === liveIndex} />
              ))}
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
              {liveFeed.map((entry, index) => (
                <LogTimelineRow key={`${entry.stage}-timeline-${entry.timestamp || index}`} entry={entry} />
              ))}
            </div>

            <div className="terminal-card p-5 space-y-4">
              <p className="text-[10px] font-mono uppercase tracking-[0.35em] text-emerald-300">What this run covers</p>
              <Checklist text="CSV/XLS/XLSX upload with auto parsing" />
              <Checklist text="Domain selection or auto domain resolution" />
              <Checklist text="Automatic target and sensitive-column detection" />
              <Checklist text="Prediction generation when prediction column is missing" />
              <Checklist text="Fairness score, disparate impact, accuracy, and group metrics" />
              <Checklist text="Proxy-risk feature detection and recommendations" />
              <Checklist text="Correction output shown separately on dashboard" />
            </div>
          </div>
        </section>
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
