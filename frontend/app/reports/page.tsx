"use client";

import Layout from "@/components/Layout";
import { getCorrectedCsvUrl, getPdfReportUrl, listAnalyses } from "@/lib/api";
import { loadLatestAnalysis, saveAnalysis } from "@/lib/analysis-store";
import { AnalysisPayload } from "@/types/analysis";
import { FileSearch, Lightbulb, ScanSearch, Sparkles, TerminalSquare } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export default function ReportsPage() {
  const [analysis, setAnalysis] = useState<AnalysisPayload | null>(null);
  const [history, setHistory] = useState<AnalysisPayload[]>([]);

  useEffect(() => {
    const cached = loadLatestAnalysis();
    setAnalysis(cached);
    listAnalyses()
      .then((items) => {
        setHistory(items);
        if (!cached && items[0]) {
          setAnalysis(items[0]);
          saveAnalysis(items[0]);
        }
      })
      .catch(() => undefined);
  }, []);

  const correctedScore = useMemo(() => {
    if (!analysis) return null;
    return (
      analysis.result.artifacts?.corrected_fairness_summary?.overall_fairness_score ??
      analysis.result.fairness_summary.corrected_fairness_score ??
      null
    );
  }, [analysis]);

  return (
    <Layout>
      <div className="space-y-8 pb-12">
        <section className="command-panel p-8">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[10px] font-mono uppercase tracking-[0.3em] text-emerald-300">
              <FileSearch className="h-3.5 w-3.5" />
              Report Archive
            </div>
            <h1 className="text-3xl font-bold text-white">Audit Report Theater</h1>
            <p className="max-w-3xl text-sm leading-7 text-muted-foreground">
              Yeh page poore report flow ko structured form mein dikhata hai: history, explanation, root-cause evidence,
              recommendations, explainability, and correction outcome.
            </p>
          </div>
        </section>

        {!analysis ? (
          <div className="command-panel p-8 text-muted-foreground">No report available.</div>
        ) : (
          <>
            <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
              <section className="command-panel p-8 space-y-4">
                <h2 className="text-xl font-semibold text-white">Report history</h2>
                <div className="space-y-3">
                  {history.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        setAnalysis(item);
                        saveAnalysis(item);
                      }}
                      className={`w-full border p-4 text-left transition ${
                        item.id === analysis.id
                          ? "border-emerald-500/40 bg-emerald-500/10"
                          : "border-white/10 bg-black/20 hover:border-white/20 hover:bg-white/5"
                      }`}
                    >
                      <p className="font-medium text-white">{item.input.fileName}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                        {item.result.metadata.domain} | {new Date(item.createdAt).toLocaleString()}
                      </p>
                      <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                        <span className="text-muted-foreground">Original {item.result.fairness_summary.overall_fairness_score}%</span>
                        <span className="text-emerald-300">
                          Corrected{" "}
                          {item.result.artifacts?.corrected_fairness_summary?.overall_fairness_score ??
                            item.result.fairness_summary.corrected_fairness_score ??
                            item.result.fairness_summary.overall_fairness_score}
                          %
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </section>

              <section className="command-panel p-8 space-y-6">
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="score-target-card p-5">
                    <p className="text-[10px] font-mono uppercase tracking-[0.35em] text-emerald-300">Original fairness</p>
                    <p className="mt-3 text-4xl font-bold text-white">{analysis.result.fairness_summary.overall_fairness_score}%</p>
                  </div>
                  <div className="score-target-card p-5">
                    <p className="text-[10px] font-mono uppercase tracking-[0.35em] text-emerald-300">Corrected fairness</p>
                    <p className="mt-3 text-4xl font-bold text-white">{correctedScore ?? "--"}%</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {typeof correctedScore === "number" && correctedScore >= 95
                        ? "95+ target reached in corrected output."
                        : "Correction result shown honestly from the dataset analysis."}
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <a href={getPdfReportUrl(analysis.id)} target="_blank" rel="noreferrer" className="terminal-card p-4 text-sm text-white hover:bg-white/5">
                    Download audit PDF
                  </a>
                  <a href={getCorrectedCsvUrl(analysis.id)} target="_blank" rel="noreferrer" className="terminal-card p-4 text-sm text-white hover:bg-white/5">
                    Download corrected CSV
                  </a>
                </div>

                <div className="terminal-card p-5">
                  <div className="flex items-center gap-3">
                    <TerminalSquare className="h-4 w-4 text-emerald-400" />
                    <p className="text-[10px] font-mono uppercase tracking-[0.35em] text-emerald-300">Executive explanation</p>
                  </div>
                  <p className="mt-4 text-sm leading-7 text-muted-foreground">{analysis.result.explanation.executive_summary}</p>
                  <div className="mt-4 space-y-2">
                    {analysis.result.explanation.plain_language.map((line) => (
                      <p key={line} className="text-sm text-muted-foreground">- {line}</p>
                    ))}
                  </div>
                </div>
              </section>
            </div>

            <div className="grid gap-6 xl:grid-cols-3">
              <section className="command-panel p-8 space-y-4">
                <div className="flex items-center gap-3">
                  <ScanSearch className="h-5 w-5 text-emerald-400" />
                  <h2 className="text-xl font-semibold text-white">Root causes</h2>
                </div>
                {analysis.result.root_causes.map((cause, index) => (
                  <div key={`${cause.type}-${index}`} className="terminal-card p-4">
                    <p className="font-medium text-white">{cause.type.replace(/_/g, " ")}</p>
                    <p className="mt-2 text-sm text-muted-foreground">{cause.details}</p>
                  </div>
                ))}
              </section>

              <section className="command-panel p-8 space-y-4 xl:col-span-2">
                <div className="flex items-center gap-3">
                  <Lightbulb className="h-5 w-5 text-emerald-400" />
                  <h2 className="text-xl font-semibold text-white">Correction recommendations</h2>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  {analysis.result.recommendations.map((rec) => (
                    <div key={rec.title} className="terminal-card p-5">
                      <div className="flex items-start justify-between gap-4">
                        <p className="font-medium text-white">{rec.title}</p>
                        <span className="text-[10px] uppercase tracking-[0.2em] text-emerald-300">{rec.priority}</span>
                      </div>
                      <p className="mt-3 text-sm text-muted-foreground">{rec.description}</p>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
              <section className="command-panel p-8 space-y-4">
                <div className="flex items-center gap-3">
                  <Sparkles className="h-5 w-5 text-emerald-400" />
                  <h2 className="text-xl font-semibold text-white">Explainability</h2>
                </div>
                {analysis.result.explainability ? (
                  <>
                    {analysis.result.explainability.note && (
                      <p className="text-sm text-muted-foreground">{analysis.result.explainability.note}</p>
                    )}
                    <div className="space-y-3">
                      {(analysis.result.explainability.shap_style_summary ||
                        analysis.result.explainability.top_features ||
                        []).map((feature) => (
                        <div key={feature.feature} className="terminal-card p-4">
                          <p className="font-medium text-white">{feature.feature}</p>
                          <p className="mt-2 text-sm text-muted-foreground">
                            {"summary" in feature && feature.summary
                              ? feature.summary
                              : `Signal ${feature.score ?? feature.weight ?? 0} ${feature.reason ?? feature.direction ?? ""}`}
                          </p>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-muted-foreground">No explainability output available.</p>
                )}
              </section>

              <section className="command-panel p-8 space-y-4">
                <h2 className="text-xl font-semibold text-white">Analysis log</h2>
                <div className="grid gap-4 md:grid-cols-2">
                  {(analysis.result.analysis_log ?? []).map((entry, index) => (
                    <div key={`${entry.stage}-${entry.timestamp || index}`} className="terminal-card p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-white">{entry.title || entry.stage}</p>
                        <span className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">{entry.status || "logged"}</span>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">{entry.detail || entry.message}</p>
                    </div>
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
