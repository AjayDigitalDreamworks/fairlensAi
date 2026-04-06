"use client";

import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { createMitigationPreview, getAnalysis, listAnalyses, getCorrectedCsvUrl, getPdfReportUrl } from "@/lib/api";
import { loadLatestAnalysis, saveAnalysis } from "@/lib/analysis-store";
import { formatMetric } from "@/lib/analysis-insights";
import { AnalysisPayload } from "@/types/analysis";
import {
  ArrowUpRight,
  CheckCircle2,
  Cpu,
  Download,
  Loader2,
  Orbit,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const strategies = [
  {
    id: "reweighing",
    title: "Dynamic Reweighing",
    note: "Adjusts sample weights across intersectional groups to neutralize representation bias during model training.",
    icon: Target,
  },
  {
    id: "threshold_optimization",
    title: "Threshold Optimization",
    note: "Calibrates per-group decision boundaries to equalize selection rates while preserving predictive accuracy.",
    icon: TrendingUp,
  },
  {
    id: "resampling",
    title: "Strategic Resampling",
    note: "Oversamples minority groups and undersamples majority groups to correct for training distribution skew.",
    icon: ArrowUpRight,
  },
  {
    id: "adversarial_debiasing",
    title: "Adversarial Debiasing",
    note: "Trains a secondary adversary network to remove protected-attribute signals from the learned representation.",
    icon: ShieldCheck,
  },
];

export default function MitigationPage() {
  const [analyses, setAnalyses] = useState<AnalysisPayload[]>([]);
  const [analysis, setAnalysis] = useState<AnalysisPayload | null>(null);
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [strategy, setStrategy] = useState("reweighing");
  const [loading, setLoading] = useState(false);
  const [hydrating, setHydrating] = useState(true);
  const [error, setError] = useState("");

  // Hydrate the available analysis list and pick latest
  useEffect(() => {
    async function hydrate() {
      try {
        const items = await listAnalyses();
        setAnalyses(items);
        const latest = loadLatestAnalysis();
        const preferredId = latest?.id && items.some((i) => i.id === latest.id) ? latest.id : items[0]?.id ?? null;
        setAnalysisId(preferredId);
      } catch {
        setAnalyses([]);
      } finally {
        setHydrating(false);
      }
    }
    hydrate();
  }, []);

  // Fetch full analysis when selection changes
  useEffect(() => {
    if (!analysisId) {
      setAnalysis(null);
      return;
    }
    setLoading(true);
    getAnalysis(analysisId)
      .then((data) => {
        setAnalysis(data);
        saveAnalysis(data);
      })
      .catch(() => setError("Failed to load the selected analysis."))
      .finally(() => setLoading(false));
  }, [analysisId]);

  const fairness = analysis?.result?.fairness_summary;
  const correctedScore = fairness?.corrected_fairness_score ?? fairness?.overall_fairness_score;
  const originalScore = fairness?.overall_fairness_score;
  const targetGap = typeof correctedScore === "number" ? Math.max(0, 95 - correctedScore) : null;
  const targetMet = fairness?.fairness_target_met ?? (typeof correctedScore === "number" && correctedScore >= 95);

  const originalFindings = analysis?.result?.sensitive_findings ?? [];
  const correctedFindings = analysis?.result?.corrected_sensitive_findings ?? [];
  const recommendations = analysis?.result?.recommendations ?? [];
  const correctionSummary = analysis?.result?.metadata?.correction_method;

  const runPreview = async () => {
    if (!analysis) return;
    setLoading(true);
    setError("");
    try {
      const updated = await createMitigationPreview(analysis.id, strategy);
      setAnalysis(updated);
      saveAnalysis(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mitigation preview failed.");
    } finally {
      setLoading(false);
    }
  };

  if (hydrating) {
    return (
      <Layout>
        <div className="command-panel p-10 text-muted-foreground">Loading mitigation toolkit...</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-8 pb-12">
        {/* Header */}
        <section className="command-panel p-8">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[10px] font-mono uppercase tracking-[0.3em] text-emerald-300">
                <Orbit className="h-3.5 w-3.5" />
                Bias Remediation Engine
              </div>
              <h1 className="text-3xl font-bold text-white">Mitigation Toolkit</h1>
              <p className="max-w-3xl text-sm leading-7 text-muted-foreground">
                Review corrected fairness outcomes, compare before-and-after metrics per sensitive attribute,
                and simulate alternative mitigation strategies with projected impact analysis.
              </p>
            </div>

            {/* Analysis selector */}
            {analyses.length > 0 && (
              <select
                value={analysisId ?? ""}
                onChange={(e) => setAnalysisId(e.target.value)}
                className="min-w-[260px] border border-white/10 bg-black/30 px-4 py-3 text-sm text-white"
              >
                {analyses.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.input?.fileName ?? "Unknown"} | {new Date(item.createdAt).toLocaleString()}
                  </option>
                ))}
              </select>
            )}
          </div>
        </section>

        {!analysis ? (
          <div className="command-panel flex items-center gap-3 p-8 text-muted-foreground">
            <XCircle className="h-5 w-5 text-amber-400" />
            No analysis available. Run a fairness audit from the Analyzer first.
          </div>
        ) : (
          <>
            {/* Scorecard row */}
            <section className="grid gap-4 md:grid-cols-4">
              <ScoreCard
                label="Original Fairness"
                value={typeof originalScore === "number" ? `${formatMetric(originalScore)}%` : "--"}
                accent="white"
              />
              <ScoreCard
                label="Corrected Fairness"
                value={typeof correctedScore === "number" ? `${formatMetric(correctedScore)}%` : "--"}
                accent={typeof correctedScore === "number" && correctedScore >= 95 ? "emerald" : "amber"}
              />
              <ScoreCard
                label="Compliance Gap"
                value={targetGap !== null ? (targetGap === 0 ? "On Target" : `${formatMetric(targetGap)} pts`) : "--"}
                accent={targetGap === 0 ? "emerald" : "amber"}
              />
              <ScoreCard
                label="95+ Target"
                value={targetMet ? "PASSED" : "NOT MET"}
                accent={targetMet ? "emerald" : "red"}
                icon={targetMet ? CheckCircle2 : XCircle}
              />
            </section>

            {/* Main grid */}
            <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
              {/* Strategy selection */}
              <section className="command-panel space-y-4 p-8">
                <div className="flex items-center gap-3">
                  <Cpu className="h-5 w-5 text-emerald-400" />
                  <h2 className="text-xl font-semibold text-white">Strategy Selector</h2>
                </div>
                <p className="text-sm text-muted-foreground">
                  Select a mitigation approach and generate a projected impact preview based on the current analysis data.
                </p>
                {strategies.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setStrategy(item.id)}
                      className={`w-full border p-4 text-left transition ${
                        strategy === item.id
                          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                          : "border-white/10 bg-black/20 text-white hover:bg-white/5"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon className={`h-4 w-4 ${strategy === item.id ? "text-emerald-400" : "text-muted-foreground"}`} />
                        <p className="font-medium">{item.title}</p>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">{item.note}</p>
                    </button>
                  );
                })}
                <Button onClick={runPreview} disabled={loading} className="w-full bg-emerald-500 text-black hover:bg-emerald-400">
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                  {loading ? "Generating preview..." : "Generate Mitigation Preview"}
                </Button>
                {error && <p className="text-sm text-red-300">{error}</p>}

                {/* Downloads */}
                <div className="space-y-2 border-t border-white/10 pt-4">
                  <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-emerald-300">Export Artifacts</p>
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={getCorrectedCsvUrl(analysis.id)}
                      className="inline-flex items-center gap-2 border border-white/10 bg-black/20 px-4 py-2 text-xs uppercase tracking-[0.2em] text-muted-foreground hover:bg-white/5 hover:text-white transition"
                    >
                      <Download className="h-3.5 w-3.5" /> Corrected CSV
                    </a>
                    <a
                      href={getPdfReportUrl(analysis.id)}
                      className="inline-flex items-center gap-2 border border-white/10 bg-black/20 px-4 py-2 text-xs uppercase tracking-[0.2em] text-muted-foreground hover:bg-white/5 hover:text-white transition"
                    >
                      <Download className="h-3.5 w-3.5" /> Audit Report PDF
                    </a>
                  </div>
                </div>
              </section>

              {/* Results panel */}
              <section className="command-panel space-y-6 p-8">
                {/* Before/After comparison */}
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-emerald-300">Before vs After Correction</p>
                  <h2 className="mt-2 text-xl font-semibold text-white">Sensitive Attribute Comparison</h2>
                </div>

                {originalFindings.length > 0 ? (
                  <div className="space-y-3">
                    {originalFindings.map((finding) => {
                      const corrected = correctedFindings.find(
                        (c) => c.sensitive_column === finding.sensitive_column,
                      );
                      return (
                        <ComparisonCard
                          key={finding.sensitive_column}
                          attribute={finding.sensitive_column}
                          originalScore={finding.fairness_score}
                          correctedScore={corrected?.fairness_score ?? null}
                          originalDI={finding.disparate_impact}
                          correctedDI={corrected?.disparate_impact ?? null}
                          originalDP={finding.demographic_parity_difference}
                          correctedDP={corrected?.demographic_parity_difference ?? null}
                        />
                      );
                    })}
                  </div>
                ) : (
                  <div className="terminal-card p-5 text-muted-foreground">No sensitive findings available.</div>
                )}

                {/* Mitigation preview results */}
                {analysis.mitigationPreview && (
                  <>
                    <div className="border-t border-white/10 pt-6">
                      <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-emerald-300">Strategy Preview Results</p>
                      <h3 className="mt-2 text-lg font-semibold text-white capitalize">
                        {analysis.mitigationPreview.strategy.replace(/_/g, " ")} — Projected Impact
                      </h3>
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                      <ScoreCard label="Current" value={`${analysis.mitigationPreview.current_score}%`} accent="white" />
                      <ScoreCard label="Projected" value={`${analysis.mitigationPreview.projected_score}%`} accent="emerald" />
                      <ScoreCard label="Lift" value={`+${analysis.mitigationPreview.projected_improvement}%`} accent="emerald" />
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="terminal-card p-5">
                        <div className="mb-4 flex items-center gap-3">
                          <Sparkles className="h-4 w-4 text-emerald-400" />
                          <h3 className="font-semibold text-white">Execution Steps</h3>
                        </div>
                        <div className="space-y-2">
                          {analysis.mitigationPreview?.execution_steps?.map((step, i) => (
                            <p key={step} className="text-sm text-muted-foreground">
                              <span className="mr-2 text-emerald-400 font-mono">{i + 1}.</span>{step}
                            </p>
                          ))}
                        </div>
                      </div>

                      <div className="terminal-card p-5">
                        <div className="mb-4 flex items-center gap-3">
                          <ShieldCheck className="h-4 w-4 text-emerald-400" />
                          <h3 className="font-semibold text-white">Mitigation Notes</h3>
                        </div>
                        <div className="space-y-2">
                          {analysis.mitigationPreview?.operational_notes?.map((note) => (
                            <p key={note} className="text-sm text-muted-foreground">• {note}</p>
                          ))}
                        </div>
                      </div>
                    </div>

                    {analysis.mitigationPreview?.group_projection?.length > 0 && (
                      <div className="space-y-3">
                        <h3 className="text-lg font-semibold text-white">Per-Group Projection</h3>
                        <div className="grid gap-3 md:grid-cols-2">
                          {analysis.mitigationPreview?.group_projection?.map((group) => (
                            <div key={group.sensitive_column} className="terminal-card p-5">
                              <p className="text-sm font-semibold text-white">{group.sensitive_column}</p>
                              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                                <MetricLine label="Current" value={`${group.fairness_score}%`} />
                                <MetricLine label="Projected" value={`${group.projected_fairness_score}%`} accent />
                                <MetricLine label="DI" value={String(group.disparate_impact)} />
                                <MetricLine label="Projected DI" value={String(group.projected_disparate_impact)} accent />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Recommendations */}
                {recommendations.length > 0 && (
                  <div className="border-t border-white/10 pt-6 space-y-3">
                    <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-emerald-300">Remediation Recommendations</p>
                    {recommendations.slice(0, 5).map((rec) => (
                      <div key={rec.title} className="terminal-card p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-white">{rec.title}</p>
                          <span
                            className={`border px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.2em] ${
                              rec.priority === "high"
                                ? "border-red-500/30 bg-red-500/10 text-red-300"
                                : "border-amber-500/30 bg-amber-500/10 text-amber-300"
                            }`}
                          >
                            {rec.priority}
                          </span>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">{rec.description}</p>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

/* ─── Sub-components ─── */

function ScoreCard({
  label,
  value,
  accent = "white",
  icon: Icon,
}: {
  label: string;
  value: string;
  accent?: "white" | "emerald" | "amber" | "red";
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const accentMap = {
    white: "text-white",
    emerald: "text-emerald-400",
    amber: "text-amber-400",
    red: "text-red-400",
  };
  return (
    <div className="score-target-card p-4">
      <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground">{label}</p>
      <div className="mt-2 flex items-center gap-2">
        {Icon && <Icon className={`h-5 w-5 ${accentMap[accent]}`} />}
        <p className={`text-2xl font-semibold ${accentMap[accent]}`}>{value}</p>
      </div>
    </div>
  );
}

function ComparisonCard({
  attribute,
  originalScore,
  correctedScore,
  originalDI,
  correctedDI,
  originalDP,
  correctedDP,
}: {
  attribute: string;
  originalScore: number;
  correctedScore: number | null;
  originalDI: number;
  correctedDI: number | null;
  originalDP: number;
  correctedDP: number | null;
}) {
  const improved = correctedScore !== null && correctedScore > originalScore;
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-white capitalize">{attribute}</p>
        {correctedScore !== null && (
          <span
            className={`border px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.2em] ${
              improved
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : "border-amber-500/30 bg-amber-500/10 text-amber-300"
            }`}
          >
            {improved ? "Improved" : "Review"}
          </span>
        )}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Fairness</p>
          <p className="mt-1 text-white">{formatMetric(originalScore)}%</p>
          {correctedScore !== null && <p className="text-emerald-400">{formatMetric(correctedScore)}%</p>}
        </div>
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Disparate Impact</p>
          <p className="mt-1 text-white">{formatMetric(originalDI, 3)}</p>
          {correctedDI !== null && <p className="text-emerald-400">{formatMetric(correctedDI, 3)}</p>}
        </div>
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">DP Gap</p>
          <p className="mt-1 text-white">{formatMetric(originalDP, 4)}</p>
          {correctedDP !== null && <p className="text-emerald-400">{formatMetric(correctedDP, 4)}</p>}
        </div>
      </div>
    </div>
  );
}

function MetricLine({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
      <p className={`mt-1 text-sm font-medium ${accent ? "text-emerald-400" : "text-white"}`}>{value}</p>
    </div>
  );
}
