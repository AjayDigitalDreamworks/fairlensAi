"use client";

import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { formatMetric, formatRelativeTime, getCorrectedScore } from "@/lib/analysis-insights";
import { listAnalyses } from "@/lib/api";
import { loadAnalysisHistory, loadLatestAnalysis, saveAnalysis } from "@/lib/analysis-store";
import type { AnalysisPayload } from "@/types/analysis";
import {
  BarChart3,
  Bot,
  BrainCircuit,
  FileSearch,
  MessageSquareMore,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useEffect, useMemo, useState } from "react";

type DriverView = {
  feature: string;
  mean_abs_shap: number;
  importance_share: number;
  direction: string;
  sensitive: boolean;
  summary?: string;
};

export default function ExplainabilityPage() {
  const [analyses, setAnalyses] = useState<AnalysisPayload[]>([]);
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function hydrate() {
      const cached = loadLatestAnalysis();
      const cachedHistory = loadAnalysisHistory();

      try {
        const items = await listAnalyses();
        if (!mounted) return;

        const next = items.length ? items : cachedHistory;
        const preferred = (cached ? next.find((item) => item.id === cached.id) : null) ?? next[0] ?? null;

        setAnalyses(next);
        setAnalysisId(preferred?.id ?? null);
        setError(items.length ? null : cachedHistory.length ? "Live archive is empty, showing cached runs." : null);
        if (preferred) saveAnalysis(preferred);
      } catch {
        if (!mounted) return;

        setAnalyses(cachedHistory);
        setAnalysisId(cached?.id ?? cachedHistory[0]?.id ?? null);
        setError(
          cachedHistory.length
            ? "Live archive is unavailable, showing cached runs."
            : "No analysis is available yet. Run FairLens from the analyzer first.",
        );
      } finally {
        if (mounted) setLoading(false);
      }
    }

    hydrate();
    return () => {
      mounted = false;
    };
  }, []);

  const analysis = useMemo(
    () => analyses.find((item) => item.id === analysisId) ?? analyses[0] ?? null,
    [analysisId, analyses],
  );

  const explainability = analysis?.result.explainability;
  const gemini = explainability?.gemini_narrative;
  const correctedScore = analysis ? getCorrectedScore(analysis) : null;
  const fairnessScore = correctedScore ?? analysis?.result.fairness_summary.overall_fairness_score ?? 0;

  const globalDrivers = useMemo<DriverView[]>(
    () =>
      (explainability?.global_feature_importance ?? []).map((item) => ({
        feature: toTitleCase(item.feature),
        mean_abs_shap: Number(item.mean_abs_shap.toFixed(4)),
        importance_share: Number((item.importance_share * 100).toFixed(1)),
        direction: item.direction,
        sensitive: Boolean(item.sensitive),
        summary: item.summary,
      })),
    [explainability],
  );

  const topDriver = globalDrivers[0] ?? null;
  const localExplanations = explainability?.local_explanations ?? [];
  const methodsAvailable = (explainability?.methods_available ?? []).filter((item) => !/gemini/i.test(item));
  const methodsUnavailable = (explainability?.methods_unavailable ?? []).filter((item) => !/gemini/i.test(item));

  const plainSummary =
    gemini?.summary ??
    analysis?.result.explanation.executive_summary ??
    "This page explains which inputs had the strongest impact on the model output.";
  const reportHighlights =
    (gemini?.key_points ?? []).length
      ? gemini?.key_points ?? []
      : buildFallbackHighlights(topDriver?.feature, localExplanations.length, explainability?.status);
  const riskStatement =
    gemini?.risk_statement ??
    `This run sits in the ${analysis.result.fairness_summary.risk_level} risk band with a corrected fairness score of ${formatMetric(fairnessScore)}%.`;
  const recommendedFocus =
    gemini?.recommended_focus ??
    buildRecommendedFocus(topDriver?.feature, analysis.result.fairness_summary.risk_level, explainability?.status);
  const mainFinding = topDriver
    ? `${topDriver.feature} had the strongest overall effect on this model's decisions.`
    : "The run completed, but it did not return one dominant feature driver.";

  function selectAnalysis(item: AnalysisPayload) {
    setAnalysisId(item.id);
    saveAnalysis(item);
  }

  return (
    <Layout>
      <div className="space-y-8 pb-12">
        <section className="command-panel p-8">
          <div className="grid gap-8 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[10px] font-mono uppercase tracking-[0.3em] text-emerald-300">
                <BrainCircuit className="h-3.5 w-3.5" />
                Explainability Page
              </div>
              <h1 className="text-3xl font-bold text-white">Understand why the model made its decisions</h1>
              <p className="max-w-4xl text-sm leading-7 text-muted-foreground">
                This page turns the audit into a readable story. It shows the features that influenced the model the most,
                a few row-level examples, and a plain-language summary that explains the numbers in simple terms.
              </p>
            </div>

            <div className="terminal-card p-5">
              <p className="text-[10px] font-mono uppercase tracking-[0.35em] text-emerald-300">Current run</p>
              <h2 className="mt-3 text-2xl font-semibold text-white">{analysis?.input.fileName ?? "No active run"}</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {analysis
                  ? `${toTitleCase(analysis.result.metadata.domain)} domain | ${analysis.result.metadata.rows.toLocaleString()} rows | ${formatRelativeTime(analysis.createdAt)}`
                  : "Select or run an analysis to populate this view."}
              </p>

              {analysis && (
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <MiniStat label="Fairness score" value={`${formatMetric(fairnessScore)}%`} />
                  <MiniStat label="Risk level" value={toTitleCase(analysis.result.fairness_summary.risk_level)} />
                  <MiniStat label="Explanation type" value={buildReadableMethodLabel(explainability?.method, explainability?.status)} />
                  <MiniStat label="Summary" value={buildNarrativeStatusLabel(gemini?.status)} />
                </div>
              )}
            </div>
          </div>
        </section>

        {error && <div className="card-glow border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-100">{error}</div>}

        {loading ? (
          <div className="command-panel p-8 text-muted-foreground">Loading explanation view...</div>
        ) : !analysis ? (
          <div className="command-panel space-y-4 p-8 text-muted-foreground">
            <p>No analysis is available yet.</p>
            <Button asChild className="w-fit bg-emerald-500 text-black hover:bg-emerald-400">
              <a href="/analyzer">Launch FairLens Analysis</a>
            </Button>
          </div>
        ) : (
          <>
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <ExplainabilityCard
                icon={BarChart3}
                label="Explanation method"
                value={buildReadableMethodLabel(explainability?.method, explainability?.status)}
                note={buildMethodNote(explainability?.status, explainability?.model_source)}
              />
              <ExplainabilityCard
                icon={FileSearch}
                label="Main driver"
                value={topDriver?.feature ?? "Not available"}
                note={topDriver ? `${topDriver.importance_share}% of total importance` : "No global driver was returned"}
              />
              <ExplainabilityCard
                icon={Bot}
                label="Narrative summary"
                value={buildNarrativeStatusLabel(gemini?.status)}
                note={buildNarrativeNote(gemini?.status)}
              />
              <ExplainabilityCard
                icon={ShieldCheck}
                label="Corrected fairness"
                value={`${formatMetric(fairnessScore)}%`}
                note={`${analysis.result.fairness_summary.risk_level} risk band`}
              />
            </section>

            <section className="command-panel p-8">
              <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
                <div className="space-y-5">
                  <div>
                    <p className="text-[10px] font-mono uppercase tracking-[0.35em] text-emerald-300">AI report</p>
                    <h2 className="mt-2 text-2xl font-semibold text-white">Decision summary</h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                      A clean narrative of what mattered most in this run, the current fairness outlook, and what deserves follow-up.
                    </p>
                  </div>

                  <div className="terminal-card p-5">
                    <p className="text-sm leading-7 text-muted-foreground">{plainSummary}</p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <ReportCard title="Main finding" description={mainFinding} />
                    <ReportCard title="Risk outlook" description={riskStatement} />
                    <ReportCard title="Recommended action" description={recommendedFocus} />
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="terminal-card p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-mono uppercase tracking-[0.35em] text-emerald-300">AI report highlights</p>
                        <h3 className="mt-2 text-lg font-semibold text-white">Key findings</h3>
                      </div>
                      <MessageSquareMore className="h-5 w-5 text-emerald-400" />
                    </div>
                    <div className="mt-4 space-y-3">
                      {reportHighlights.map((point) => (
                        <div key={point} className="border border-white/5 bg-black/20 p-4">
                          <p className="text-sm leading-6 text-muted-foreground">{point}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="terminal-card p-5">
                    <p className="text-[10px] font-mono uppercase tracking-[0.35em] text-emerald-300">Run capabilities</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {methodsAvailable.length ? (
                        methodsAvailable.map((item) => (
                          <span
                            key={item}
                            className="border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-[10px] font-mono uppercase tracking-[0.2em] text-emerald-300"
                          >
                            {item}
                          </span>
                        ))
                      ) : (
                        <span className="text-sm text-muted-foreground">No capabilities were reported.</span>
                      )}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {methodsUnavailable.map((item) => (
                        <span
                          key={item}
                          className="border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[10px] font-mono uppercase tracking-[0.2em] text-amber-200"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="terminal-card p-5">
                    <p className="text-[10px] font-mono uppercase tracking-[0.35em] text-emerald-300">Recent runs</p>
                    <div className="mt-4 space-y-3">
                      {analyses.slice(0, 4).map((item) => (
                        <button
                          key={item.id}
                          onClick={() => selectAnalysis(item)}
                          className={`w-full border p-4 text-left transition ${
                            item.id === analysis.id
                              ? "border-emerald-500/40 bg-emerald-500/10"
                              : "border-white/10 bg-black/20 hover:border-emerald-500/30 hover:bg-white/5"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="font-medium text-white">{item.input.fileName}</p>
                              <p className="mt-1 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                                {item.result.metadata.domain} | {formatRelativeTime(item.createdAt)}
                              </p>
                            </div>
                            <span className="text-sm text-emerald-300">
                              {formatMetric(getCorrectedScore(item) ?? item.result.fairness_summary.overall_fairness_score)}%
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
              <section className="command-panel p-8">
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-mono uppercase tracking-[0.35em] text-emerald-300">Global explanation</p>
                    <h2 className="mt-2 text-xl font-semibold text-white">What influenced the model most overall</h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Higher bars mean the feature had a stronger average effect across the full dataset.
                    </p>
                  </div>
                  <Sparkles className="h-5 w-5 text-emerald-400" />
                </div>

                <div className="h-[360px]">
                  {globalDrivers.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={globalDrivers} layout="vertical" margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(255,255,255,0.03)" />
                        <XAxis type="number" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} tickLine={false} axisLine={false} />
                        <YAxis
                          type="category"
                          dataKey="feature"
                          width={140}
                          tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 10 }}
                          tickLine={false}
                          axisLine={false}
                        />
                        <Tooltip content={<ExplainabilityTooltip />} />
                        <Bar dataKey="mean_abs_shap" name="Average impact" fill="var(--chart-secondary)" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyPanel message="This run did not produce a clear TreeSHAP driver chart. The service may have fallen back to a proxy scan or the model produced near-zero contributions." />
                  )}
                </div>
              </section>

              <section className="command-panel p-8">
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-mono uppercase tracking-[0.35em] text-emerald-300">Top features</p>
                    <h2 className="mt-2 text-xl font-semibold text-white">Simple reading of the strongest drivers</h2>
                  </div>
                  <FileSearch className="h-5 w-5 text-emerald-400" />
                </div>

                <div className="space-y-3">
                  {globalDrivers.length ? (
                    globalDrivers.map((driver, index) => (
                      <div key={driver.feature} className="terminal-card p-5">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">Rank {index + 1}</p>
                            <p className="mt-2 text-lg font-semibold text-white">{driver.feature}</p>
                            <p className="mt-2 text-sm text-muted-foreground">
                              {driver.summary ?? `${driver.feature} was one of the strongest drivers in this run.`}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-emerald-300">{driver.mean_abs_shap}</p>
                            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                              {driver.importance_share}% importance share
                            </p>
                          </div>
                        </div>

                        <div className="mt-4 flex flex-wrap items-center gap-2">
                          <DirectionBadge direction={driver.direction} />
                          {driver.sensitive && (
                            <span className="border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-[10px] font-mono uppercase tracking-[0.2em] text-amber-200">
                              Sensitive feature
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <EmptyPanel message="No global feature list was returned for this analysis." />
                  )}
                </div>
              </section>
            </div>

            <section className="command-panel p-8">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-[0.35em] text-emerald-300">Local explanations</p>
                  <h2 className="mt-2 text-xl font-semibold text-white">Why specific rows got their scores</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Each card below shows one example prediction and the features that pushed that prediction up or down the most.
                  </p>
                </div>
                <Sparkles className="h-5 w-5 text-emerald-400" />
              </div>

              {localExplanations.length ? (
                <div className="grid gap-6 xl:grid-cols-3">
                  {localExplanations.map((item) => (
                    <div key={item.sample_id} className="terminal-card p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-[10px] font-mono uppercase tracking-[0.35em] text-emerald-300">{item.sample_id}</p>
                          <h3 className="mt-2 text-xl font-semibold text-white">Row {item.row_index}</h3>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-emerald-300">{(item.prediction_probability * 100).toFixed(1)}%</p>
                          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">predicted probability</p>
                        </div>
                      </div>

                      <p className="mt-4 text-sm leading-7 text-muted-foreground">{item.summary}</p>

                      <div className="mt-5 grid grid-cols-2 gap-3">
                        <MiniStat label="Base score" value={`${((item.baseline_probability ?? 0) * 100).toFixed(1)}%`} />
                        <MiniStat label="Final label" value={item.predicted_label === 1 ? "Positive" : "Negative"} />
                      </div>

                      <div className="mt-5 space-y-3">
                        {item.top_contributors.map((contributor) => (
                          <div key={`${item.sample_id}-${contributor.feature}`} className="border border-white/5 bg-black/20 p-4">
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <p className="font-medium text-white">{toTitleCase(contributor.feature)}</p>
                                <p className="mt-1 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                                  Current value: {contributor.value}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-sm text-emerald-300">{contributor.shap_value}</p>
                                <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                                  {Math.round((contributor.importance_share ?? 0) * 100)}% of this row
                                </p>
                              </div>
                            </div>

                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              <DirectionBadge direction={contributor.direction} />
                              {contributor.sensitive && (
                                <span className="border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-[10px] font-mono uppercase tracking-[0.2em] text-amber-200">
                                  Sensitive feature
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyPanel message="Local row-level explanations were not returned for this analysis." />
              )}
            </section>
          </>
        )}
      </div>
    </Layout>
  );
}

function ExplainabilityCard({
  icon: Icon,
  label,
  value,
  note,
}: {
  icon: typeof BrainCircuit;
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="terminal-card p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-emerald-400" />
      </div>
      <p className="mt-3 text-2xl font-bold text-white">{value}</p>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{note}</p>
    </div>
  );
}

function ReportCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="terminal-card p-5">
      <p className="text-base font-semibold text-white">{title}</p>
      <p className="mt-3 text-sm leading-7 text-muted-foreground">{description}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-white/5 bg-black/20 p-4">
      <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-lg font-semibold text-white">{value}</p>
    </div>
  );
}

function DirectionBadge({ direction }: { direction: string }) {
  const text = simplifyDirection(direction);
  const toneClass = direction.toLowerCase().includes("away") || direction.toLowerCase().includes("lower")
    ? "border-red-500/20 bg-red-500/10 text-red-200"
    : direction.toLowerCase().includes("toward") || direction.toLowerCase().includes("raise") || direction.toLowerCase().includes("push")
      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
      : "border-white/10 bg-white/5 text-muted-foreground";

  return (
    <span className={`px-3 py-1 text-[10px] font-mono uppercase tracking-[0.2em] ${toneClass}`}>
      {text}
    </span>
  );
}

function EmptyPanel({ message }: { message: string }) {
  return (
    <div className="flex min-h-[220px] items-center justify-center border border-dashed border-white/10 bg-black/20 p-6 text-center text-sm text-muted-foreground">
      <p className="max-w-sm leading-6">{message}</p>
    </div>
  );
}

function ExplainabilityTooltip({ active, payload, label }: any) {
  if (!(active && payload && payload.length)) return null;

  return (
    <div className="rounded-lg border border-white/10 bg-card/90 p-3 shadow-xl shadow-black/50 backdrop-blur-md">
      <p className="mb-1 text-sm font-semibold text-foreground">{label}</p>
      {payload.map((entry: any, index: number) => (
        <p key={`item-${index}`} className="text-sm text-muted-foreground" style={{ color: entry.color }}>
          {`${entry.name || "Value"}: ${entry.value}`}
        </p>
      ))}
    </div>
  );
}

function buildReadableMethodLabel(method?: string, status?: string) {
  if (method === "TreeSHAP" && status === "model_based") return "Real SHAP explanation";
  if (method === "TreeSHAP") return "SHAP-style explanation";
  if (method === "proxy_scan") return "Fallback proxy scan";
  return "Explanation not specified";
}

function buildMethodNote(status?: string, modelSource?: string) {
  if (status === "model_based") return "Computed from the actual XGBoost analysis model.";
  if (status === "surrogate_model_based") return `Computed from a surrogate model: ${toTitleCase(modelSource ?? "unknown")}.`;
  return "The service used a fallback path because a full model-based explanation was not available.";
}

function buildNarrativeStatusLabel(status?: string) {
  if (status === "available") return "Ready";
  if (status === "not_configured") return "Key missing";
  if (status === "error") return "Failed";
  if (status === "skipped") return "Skipped";
  return "Unavailable";
}

function buildNarrativeNote(status?: string) {
  if (status === "available") return "Plain-language explanation is available for this run.";
  if (status === "not_configured") return "Plain-language explanation was not generated for this run.";
  if (status === "error") return "The summary layer could not be generated for this run.";
  if (status === "skipped") return "This run stayed focused on the core model explanation only.";
  return "Summary availability was not reported.";
}

function simplifyDirection(direction: string) {
  const lower = direction.toLowerCase();
  if (lower.includes("toward") || lower.includes("raise")) return "Pushes outcome up";
  if (lower.includes("away") || lower.includes("lower")) return "Pushes outcome down";
  if (lower.includes("mixed")) return "Mixed effect";
  if (lower.includes("neutral")) return "Neutral effect";
  return direction;
}

function buildFallbackHighlights(topDriver?: string, localCount = 0, status?: string) {
  const highlights = [
    topDriver
      ? `${topDriver} stands out as the strongest driver across the full dataset.`
      : "No single feature clearly dominated the model's overall behavior in this run.",
    localCount
      ? `${localCount} sample-level explanations are available below to show how individual outcomes changed from row to row.`
      : "Row-level examples were not returned for this run.",
  ];

  if (status === "model_based") {
    highlights.push("The explanation is based on the actual analysis model, so the feature attributions are directly tied to model behavior.");
  } else if (status === "surrogate_model_based") {
    highlights.push("The explanation uses a surrogate model, which is still informative but less direct than a native model explanation.");
  } else {
    highlights.push("The service used a fallback explanation path, so these findings should be treated as directional rather than definitive.");
  }

  return highlights;
}

function buildRecommendedFocus(topDriver: string | undefined, riskLevel: string, status?: string) {
  if (status !== "model_based") {
    return "Validate this run with the primary model explanation path before using it as final evidence in a review or presentation.";
  }
  if (riskLevel.toLowerCase() === "high") {
    return topDriver
      ? `Review how ${topDriver} interacts with sensitive features and test whether the model outcome changes unfairly across groups.`
      : "Review the strongest drivers against sensitive attributes and test for unfair outcome shifts across groups.";
  }
  return topDriver
    ? `Keep monitoring ${topDriver} because it has the biggest influence on decisions in this run.`
    : "Monitor the top decision drivers over future runs to confirm the model stays stable and fair.";
}

function toTitleCase(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
