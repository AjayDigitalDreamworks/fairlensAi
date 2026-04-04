"use client";

import Layout from "@/components/Layout";
import { getCorrectedCsvUrl, getPdfReportUrl, listAnalyses } from "@/lib/api";
import { loadAnalysis, saveAnalysis } from "@/lib/analysis-store";
import type { AnalysisLogEntry, AnalysisPayload, SensitiveFinding } from "@/types/analysis";
import { AlertTriangle, BarChart3, Download, FileText, History, Radar, ShieldCheck, Target } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export default function DashboardPage() {
  const [analyses, setAnalyses] = useState<AnalysisPayload[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function hydrate() {
      try {
        const items = await listAnalyses();
        setAnalyses(items);
        if (items[0]) saveAnalysis(items[0]);
      } catch {
        const local = loadAnalysis();
        setAnalyses(local ? [local] : []);
      } finally {
        setLoading(false);
      }
    }

    hydrate();
  }, []);

  const latest = analyses[0] || null;
  const correctedScore =
    latest?.result.artifacts?.corrected_fairness_summary?.overall_fairness_score ??
    latest?.result.fairness_summary.corrected_fairness_score;

  const worstFinding = useMemo(() => {
    if (!latest) return null;
    return [...latest.result.sensitive_findings].sort((a, b) => a.fairness_score - b.fairness_score)[0] || null;
  }, [latest]);

  const correctedWorst = useMemo(() => {
    if (!latest?.result.artifacts?.corrected_sensitive_findings?.length) return null;
    return [...latest.result.artifacts.corrected_sensitive_findings].sort((a, b) => a.fairness_score - b.fairness_score)[0] || null;
  }, [latest]);

  if (loading) {
    return (
      <Layout>
        <div className="command-panel p-10 text-muted-foreground">Loading report dashboard...</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-8 pb-12">
        <section className="command-panel p-8">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[10px] font-mono uppercase tracking-[0.3em] text-emerald-300">
                <Radar className="h-3.5 w-3.5" />
                Dashboard Broadcast
              </div>
              <h1 className="text-3xl font-bold text-white">Fairness Command Dashboard</h1>
              <p className="max-w-3xl text-sm leading-7 text-muted-foreground">
                Yahan original aur corrected fairness ko side-by-side dekh sakte ho. Corrected score ko 95+ target ke against measure kiya gaya hai,
                lekin score dataset ki actual bias pattern par depend karega, fake karke nahin dikhaya jayega.
              </p>
            </div>

            {latest && (
              <div className="flex flex-wrap gap-3">
                <a href={getCorrectedCsvUrl(latest.id)} className="inline-flex items-center gap-2 border border-white/10 bg-black/20 px-4 py-3 text-sm text-white hover:bg-white/5">
                  <Download className="h-4 w-4" />
                  Corrected CSV
                </a>
                <a href={getPdfReportUrl(latest.id)} className="inline-flex items-center gap-2 border border-white/10 bg-black/20 px-4 py-3 text-sm text-white hover:bg-white/5">
                  <FileText className="h-4 w-4" />
                  Audit PDF
                </a>
              </div>
            )}
          </div>
        </section>

        {!latest ? (
          <div className="command-panel p-10 text-muted-foreground">Run an analysis from the Analyzer page to populate the dashboard.</div>
        ) : (
          <>
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
              <ScoreCard label="Original fairness" value={`${latest.result.fairness_summary.overall_fairness_score}%`} icon={BarChart3} tone="default" />
              <ScoreCard label="Corrected fairness" value={typeof correctedScore === "number" ? `${correctedScore}%` : "--"} icon={ShieldCheck} tone="success" />
              <ScoreCard label="Target gap" value={typeof correctedScore === "number" ? `${Math.max(0, 95 - correctedScore).toFixed(2)}` : "--"} icon={Target} tone="warning" />
              <ScoreCard label="Reports stored" value={String(analyses.length)} icon={History} tone="default" />
            </div>

            <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
              <section className="command-panel p-8 space-y-6">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="h-5 w-5 text-emerald-400" />
                  <h2 className="text-xl font-semibold text-white">Correction Outcome</h2>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <OutcomeCard
                    title="Before correction"
                    score={latest.result.fairness_summary.overall_fairness_score}
                    risk={latest.result.fairness_summary.risk_level}
                    note="Raw audit result before remediation preview."
                  />
                  <OutcomeCard
                    title="After correction"
                    score={typeof correctedScore === "number" ? correctedScore : latest.result.fairness_summary.overall_fairness_score}
                    risk={latest.result.artifacts?.corrected_fairness_summary?.risk_level || latest.result.fairness_summary.risk_level}
                    note={
                      typeof correctedScore === "number" && correctedScore >= 95
                        ? "95+ target crossed in corrected output."
                        : "Corrected output improved the dataset, but 95+ depends on real bias severity."
                    }
                  />
                </div>

                <div className="terminal-card p-5">
                  <p className="text-[10px] font-mono uppercase tracking-[0.35em] text-emerald-300">Executive readout</p>
                  <p className="mt-3 text-sm leading-7 text-muted-foreground">{latest.result.explanation.executive_summary}</p>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <SignalPanel
                    title="Detected setup"
                    items={[
                      `Domain: ${latest.result.metadata.domain}`,
                      `Target: ${latest.result.metadata.target_column ?? "auto-generated"}`,
                      `Prediction: ${latest.result.metadata.prediction_column ?? "auto-generated"}`,
                      `Sensitive columns: ${latest.result.metadata.sensitive_columns.join(", ")}`,
                    ]}
                  />
                  <SignalPanel
                    title="Release view"
                    items={[
                      `Rows analyzed: ${latest.result.metadata.rows}`,
                      `Risk level: ${latest.result.fairness_summary.risk_level}`,
                      `Worst original slice: ${worstFinding?.sensitive_column ?? "none"}`,
                      `Worst corrected slice: ${correctedWorst?.sensitive_column ?? "not generated"}`,
                    ]}
                  />
                </div>
              </section>

              <section className="command-panel p-8 space-y-6">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-emerald-400" />
                  <h2 className="text-xl font-semibold text-white">Risk Focus</h2>
                </div>
                <FindingCard title="Original high-risk finding" finding={worstFinding} />
                <FindingCard title="Corrected high-risk finding" finding={correctedWorst} />
              </section>
            </div>

            <div className="grid gap-6 xl:grid-cols-[1fr_0.95fr]">
              <section className="command-panel p-8">
                <div className="mb-5 flex items-center gap-3">
                  <Radar className="h-5 w-5 text-emerald-400" />
                  <h2 className="text-xl font-semibold text-white">Analysis Playback</h2>
                </div>
                <div className="space-y-4">
                  {(latest.result.analysis_log || []).map((entry, index) => (
                    <TimelineEntry key={`${entry.stage}-${entry.timestamp || index}`} entry={entry} />
                  ))}
                </div>
              </section>

              <section className="command-panel p-8">
                <div className="mb-5 flex items-center gap-3">
                  <History className="h-5 w-5 text-emerald-400" />
                  <h2 className="text-xl font-semibold text-white">Recent Reports</h2>
                </div>
                <div className="space-y-3">
                  {analyses.map((analysis) => (
                    <button
                      key={analysis.id}
                      onClick={() => saveAnalysis(analysis)}
                      className="w-full border border-white/10 bg-black/20 p-4 text-left transition hover:border-emerald-500/30 hover:bg-white/5"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-medium text-white">{analysis.input.fileName}</p>
                          <p className="mt-1 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                            {analysis.result.metadata.domain} | {new Date(analysis.createdAt).toLocaleString()}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-emerald-300">
                            {analysis.result.artifacts?.corrected_fairness_summary?.overall_fairness_score ??
                              analysis.result.fairness_summary.corrected_fairness_score ??
                              analysis.result.fairness_summary.overall_fairness_score}
                            %
                          </p>
                          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">corrected</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

function ScoreCard({
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
      <p className="mt-3 text-4xl font-bold text-white">{score}%</p>
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
          <p key={item} className="text-sm text-muted-foreground">{item}</p>
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
        <p>Fairness: {finding.fairness_score}%</p>
        <p>Risk: {finding.risk_level}</p>
        <p>DI: {finding.disparate_impact}</p>
        <p>DP gap: {finding.demographic_parity_difference}</p>
      </div>
      <div className="mt-4 space-y-2">
        {finding.notes.map((note) => (
          <p key={note} className="text-sm text-muted-foreground">- {note}</p>
        ))}
      </div>
    </div>
  );
}

function TimelineEntry({ entry }: { entry: AnalysisLogEntry }) {
  return (
    <div className="relative pl-7">
      <div className="absolute left-0 top-1 h-3 w-3 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.8)]" />
      <div className="absolute left-[5px] top-5 h-full w-px bg-emerald-500/20" />
      <div className="terminal-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium text-white">{entry.title || entry.stage}</p>
          <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-emerald-300">{entry.status || "logged"}</span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{entry.detail || entry.message}</p>
      </div>
    </div>
  );
}
