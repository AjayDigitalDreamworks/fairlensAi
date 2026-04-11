"use client";

import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { generateGeminiExplanation, getAnalysis, listAnalyses } from "@/lib/api";
import { formatMetric } from "@/lib/analysis-insights";
import { loadAnalysisHistory, loadLatestAnalysis, saveAnalysis } from "@/lib/analysis-store";
import type { AnalysisPayload } from "@/types/analysis";
import { BrainCircuit, Loader2, MessageSquareText, Target } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export default function ExplainabilityPage() {
  const [analyses, setAnalyses] = useState<AnalysisPayload[]>([]);
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectionLoading, setSelectionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [fullAnalysis, setFullAnalysis] = useState<AnalysisPayload | null>(null);

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
        setError(items.length ? null : cachedHistory.length ? "Live explainability feed is empty, showing cached analysis." : null);
      } catch {
        if (!mounted) return;

        setAnalyses(cachedHistory);
        setAnalysisId(cached?.id ?? cachedHistory[0]?.id ?? null);
        setError(
          cachedHistory.length
            ? "Live explainability feed is unavailable, showing cached analysis."
            : "No analysis is available yet. Run a FairLens audit from the analyzer first.",
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

  useEffect(() => {
    if (!analyses.length) {
      setAnalysisId(null);
      return;
    }

    if (!analysisId || !analyses.some((item) => item.id === analysisId)) {
      setAnalysisId(analyses[0].id);
    }
  }, [analysisId, analyses]);

  useEffect(() => {
    if (!analysisId) return;

    setSelectionLoading(true);
    getAnalysis(analysisId)
      .then((item) => {
        setFullAnalysis(item);
        saveAnalysis(item);
      })
      .catch(() => {
        setFullAnalysis(null);
        setError((current) => current ?? "Selected analysis details could not be loaded.");
      })
      .finally(() => setSelectionLoading(false));
  }, [analysisId]);

  const analysis = useMemo(() => (fullAnalysis?.id === analysisId ? fullAnalysis : null), [analysisId, fullAnalysis]);
  const explainability = analysis?.result?.explainability;
  const geminiInterpretation = analysis?.result?.explanation?.gemini_interpretation;
  const fallback = useMemo(() => buildFallbackExplainability(analysis), [analysis]);
  const topFeatures = explainability?.top_features?.length ? explainability.top_features : fallback.topFeatures;
  const impactFeed = explainability?.shap_style_summary?.length ? explainability.shap_style_summary : fallback.impactFeed;
  const localExamples = explainability?.lime_style_example?.length ? explainability.lime_style_example : fallback.localExamples;
  const chartData = topFeatures.map((item) => ({
    feature: item.feature,
    importance: Number((item.score ?? item.weight ?? 0).toFixed(4)),
  }));

  if (loading) {
    return (
      <Layout>
        <div className="command-panel p-10 text-muted-foreground">Loading explainability command center...</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-8 pb-12">
        <section className="card-glow overflow-hidden p-8">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[10px] font-mono uppercase tracking-[0.3em] text-emerald-300">
              <BrainCircuit className="h-3.5 w-3.5" />
              Model Explainability Engine
            </div>
            <h1 className="text-3xl font-bold text-white">Model Interpretability</h1>
            <p className="max-w-3xl text-sm leading-7 text-muted-foreground">
              This view now falls back to fairness findings, proxy-risk signals, and root-cause analysis when direct SHAP-style model drivers are unavailable.
            </p>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="card-glow p-6">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-emerald-300">Analysis selector</p>
                <h2 className="mt-2 text-xl font-semibold text-white">Choose a run</h2>
              </div>
              <select
                value={analysisId ?? ""}
                onChange={(event) => setAnalysisId(event.target.value)}
                className="min-w-[260px] border border-white/10 bg-black/30 px-4 py-3 text-sm text-white"
              >
                {analyses.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.input.fileName} | {new Date(item.createdAt).toLocaleString()}
                  </option>
                ))}
              </select>
            </div>

            {error && <Notice message={error} />}
            {analysisId && selectionLoading && <Notice message="Loading the full explainability payload for this run..." />}
            {!analysis && !error && <Notice message="No explainability payload is available yet." />}

            {analysis && (
              <div className="space-y-4">
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-emerald-300">Run summary</p>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <SummaryLine label="Dataset" value={analysis.input.fileName} />
                    <SummaryLine label="Domain" value={analysis.result.metadata.domain} />
                    <SummaryLine label="Prediction source" value={analysis.result.metadata.prediction_auto_generated ? "Internal Audit Engine" : "Uploaded Prediction data"} />
                    <SummaryLine label="Fairness score" value={`${formatMetric(analysis.result.fairness_summary.overall_fairness_score)}%`} />
                    <SummaryLine label="Explainability status" value={explainability?.status || fallback.status} />
                    <SummaryLine label="Signal source" value={analysis.result.metadata.explainability_model_source || fallback.sourceLabel} />
                  </div>
                </div>

                <MethodList title="Signals available" items={explainability?.methods_available?.length ? explainability.methods_available : fallback.methodBadges} />

                <div className="flex flex-wrap gap-3">
                  <Button
                    onClick={async () => {
                      if (!analysis) return;
                      setGenerating(true);
                      setError(null);
                      try {
                        const updated = await generateGeminiExplanation(analysis.id);
                        setAnalyses((current) => [updated, ...current.filter((item) => item.id !== updated.id)]);
                        setFullAnalysis(updated);
                        saveAnalysis(updated);
                      } catch (generationError) {
                        setError(generationError instanceof Error ? generationError.message : "Gemini explanation failed.");
                      } finally {
                        setGenerating(false);
                      }
                    }}
                    disabled={!analysis || generating}
                    className="bg-emerald-500 font-semibold text-black hover:bg-emerald-400"
                  >
                    {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessageSquareText className="mr-2 h-4 w-4" />}
                    {generating ? "Generating Narrative..." : "Generate Narrative interpretation"}
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="card-glow p-6">
            <div className="mb-6">
              <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-emerald-300">Global attribution</p>
              <h2 className="mt-2 text-xl font-semibold text-white">Top feature drivers</h2>
            </div>
            <div className="h-[360px]">
              {chartData.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="feature" angle={-18} textAnchor="end" height={80} tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }} tickLine={false} axisLine={false} />
                    <Tooltip content={<ExplainabilityTooltip />} />
                    <Bar dataKey="importance" fill="var(--chart-primary)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState message={explainability?.note || fallback.note} />
              )}
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <div className="card-glow p-6">
            <div className="mb-5 flex items-center gap-3">
              <Target className="h-5 w-5 text-emerald-400" />
              <h2 className="text-xl font-semibold text-white">Model impact feed</h2>
            </div>
            {impactFeed.length ? (
              <div className="space-y-3">
                {impactFeed.map((item) => (
                  <ExplainabilityRow
                    key={`${item.feature}-${item.direction}`}
                    title={item.feature}
                    badge={item.direction}
                    value={`impact ${formatMetric(item.impact, 4)}`}
                    description={item.summary}
                  />
                ))}
              </div>
            ) : (
              <EmptyState message={explainability?.note || fallback.note} />
            )}
          </div>

          <div className="card-glow p-6">
            <div className="mb-5 flex items-center gap-3">
              <MessageSquareText className="h-5 w-5 text-cyan-400" />
              <h2 className="text-xl font-semibold text-white">Audit narration</h2>
            </div>
            <div className="space-y-4">
              {geminiInterpretation?.text ? (
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-emerald-300">Narrator output</p>
                  <div className="mt-3 whitespace-pre-wrap text-sm leading-7 text-muted-foreground">{geminiInterpretation.text}</div>
                </div>
              ) : (
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-emerald-300">Narrator status</p>
                  <p className="mt-3 text-sm leading-7 text-muted-foreground">{geminiInterpretation?.note || "No Narrator interpretation has been generated for this analysis yet."}</p>
                </div>
              )}

              {localExamples.length ? (
                localExamples.map((item) => (
                  <ExplainabilityRow
                    key={`${item.feature}-${item.summary}`}
                    title={item.feature}
                    badge={item.direction}
                    value={`impact ${formatMetric(item.impact, 4)}`}
                    description={item.summary}
                  />
                ))
              ) : (
                <EmptyState message="This run did not return local SHAP samples, so the page is showing the strongest available audit details instead." />
              )}
            </div>
          </div>
        </section>
      </div>
    </Layout>
  );
}

function buildFallbackExplainability(analysis: AnalysisPayload | null) {
  if (!analysis) {
    return {
      topFeatures: [],
      impactFeed: [],
      localExamples: [],
      methodBadges: [],
      status: "not_loaded",
      note: "",
      sourceLabel: "Derived audit signals",
    };
  }

  const severityWeight: Record<string, number> = { high: 1, medium: 0.7, low: 0.4 };
  const scoreMap = new Map<string, { score: number; reason: string; direction: string }>();

  (analysis.result.root_causes ?? []).forEach((cause) => {
    const feature = cause.feature || cause.sensitive_column;
    if (!feature) return;
    const current = scoreMap.get(feature) ?? { score: 0, reason: cause.details, direction: cause.severity || "review" };
    scoreMap.set(feature, {
      score: current.score + (severityWeight[cause.severity?.toLowerCase() || "medium"] ?? 0.5),
      reason: cause.details || current.reason,
      direction: cause.severity || current.direction,
    });
  });

  (analysis.result.sensitive_findings ?? []).forEach((finding) => {
    const feature = finding.sensitive_column;
    const current = scoreMap.get(feature) ?? { score: 0, reason: finding.notes?.[0] || "", direction: finding.risk_level };
    scoreMap.set(feature, {
      score: current.score + Math.max(0.2, (100 - finding.fairness_score) / 100),
      reason: finding.notes?.[0] || current.reason || `${feature} has a measurable fairness gap.`,
      direction: finding.risk_level || current.direction,
    });
  });

  (analysis.result.recommendations ?? []).forEach((item) => {
    const feature = item.title.replace(/^Inspect proxy feature\s+/i, "").replace(/^Review\s+/i, "").trim();
    if (!feature || feature === item.title) return;
    const current = scoreMap.get(feature) ?? { score: 0, reason: item.description, direction: item.priority };
    scoreMap.set(feature, {
      score: current.score + (item.priority === "high" ? 0.8 : 0.5),
      reason: item.description || current.reason,
      direction: item.priority || current.direction,
    });
  });

  const topFeatures = Array.from(scoreMap.entries())
    .map(([feature, value]) => ({
      feature,
      score: Number(value.score.toFixed(4)),
      weight: Number(Math.min(1, value.score / 3).toFixed(4)),
      direction: value.direction,
      reason: value.reason,
    }))
    .sort((left, right) => (right.score ?? 0) - (left.score ?? 0))
    .slice(0, 8);

  return {
    topFeatures,
    impactFeed: topFeatures.map((item) => ({
      feature: item.feature,
      direction: item.direction || "review",
      impact: item.score ?? item.weight ?? 0,
      summary: item.reason || `${item.feature} was highlighted by the audit fallback logic.`,
    })),
    localExamples: (analysis.result.sensitive_findings ?? [])
      .slice()
      .sort((left, right) => left.fairness_score - right.fairness_score)
      .slice(0, 4)
      .map((finding) => ({
        feature: finding.sensitive_column,
        direction: finding.risk_level,
        impact: Number(((100 - finding.fairness_score) / 100).toFixed(4)),
        summary: finding.notes?.join(" ") || `${finding.sensitive_column} requires review.`,
      })),
    methodBadges: ["audit fallback", "root causes", "fairness findings"],
    status: topFeatures.length ? "fallback_ready" : "limited",
    note: topFeatures.length
      ? "Model-level explainability was unavailable for this run, so the strongest audit findings are being used as fallback drivers."
      : "No detailed explainability signals were available for this run.",
    sourceLabel: "Derived audit signals",
  };
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-sm text-white">{value}</p>
    </div>
  );
}

function ExplainabilityRow({
  title,
  badge,
  value,
  description,
}: {
  title: string;
  badge: string;
  value: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">{title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{value}</p>
        </div>
        <span className="border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[10px] font-mono uppercase tracking-[0.25em] text-emerald-300">
          {badge}
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  );
}

function MethodList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
      <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">{title}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {items.length ? (
          items.map((item) => (
            <span key={item} className="border border-emerald-500/20 bg-emerald-500/5 px-3 py-1 text-[10px] font-mono uppercase tracking-[0.2em] text-emerald-300">
              {item}
            </span>
          ))
        ) : (
          <span className="text-sm text-muted-foreground">None</span>
        )}
      </div>
    </div>
  );
}

function Notice({ message }: { message: string }) {
  return <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm leading-6 text-amber-200">{message}</div>;
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex min-h-[180px] items-center justify-center rounded-xl border border-dashed border-white/10 bg-black/20 p-6 text-center text-sm leading-6 text-muted-foreground">
      <p className="max-w-lg">{message}</p>
    </div>
  );
}

function ExplainabilityTooltip({ active, payload }: any) {
  if (!(active && payload && payload.length)) return null;

  const point = payload[0];
  return (
    <div className="rounded-lg border border-white/10 bg-card/90 p-3 shadow-xl shadow-black/50 backdrop-blur-md">
      <p className="text-sm font-semibold text-white">{point.payload.feature}</p>
      <p className="mt-1 text-xs font-mono uppercase tracking-[0.2em] text-emerald-300">impact {formatMetric(point.value, 4)}</p>
    </div>
  );
}
