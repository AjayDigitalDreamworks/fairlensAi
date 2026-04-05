"use client";

import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { generateGeminiExplanation, listAnalyses } from "@/lib/api";
import { formatMetric } from "@/lib/analysis-insights";
import { loadAnalysisHistory, loadLatestAnalysis, saveAnalysis } from "@/lib/analysis-store";
import type { AnalysisPayload } from "@/types/analysis";
import {
  BarChart3,
  BrainCircuit,
  CheckCircle2,
  Loader2,
  MessageSquareText,
  Sparkles,
  Target,
} from "lucide-react";
import { type ComponentType, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export default function ExplainabilityPage() {
  const [analyses, setAnalyses] = useState<AnalysisPayload[]>([]);
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

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
        if (preferred) saveAnalysis(preferred);
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

  const analysis = useMemo(
    () => analyses.find((item) => item.id === analysisId) ?? analyses[0] ?? null,
    [analysisId, analyses],
  );

  const explainability = analysis?.result.explainability;
  const geminiInterpretation = analysis?.result.explanation.gemini_interpretation;
  const topFeatures = explainability?.top_features ?? [];
  const shapSummary = explainability?.shap_style_summary ?? [];
  const localExamples = explainability?.lime_style_example ?? [];

  const chartData = useMemo(
    () =>
      topFeatures.map((item) => ({
        feature: item.feature,
        importance: Number((item.score ?? item.weight ?? 0).toFixed(4)),
      })),
    [topFeatures],
  );

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
          <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[10px] font-mono uppercase tracking-[0.3em] text-emerald-300">
                <BrainCircuit className="h-3.5 w-3.5" />
                Explainability Command Center
              </div>
              <h1 className="text-3xl font-bold text-white">Model attribution, not proxy guesswork</h1>
              <p className="max-w-3xl text-sm leading-7 text-muted-foreground">
                This page surfaces mathematically grounded feature influence from the surrogate XGBoost model. SHAP handles the real attribution layer,
                and Gemini or any LLM can be added later only as a language layer for human-readable narration.
              </p>
            </div>

            <div className="grid min-w-[280px] grid-cols-2 gap-3">
              <MetricCard label="Active method" value={explainability?.method ?? explainability?.status ?? "pending"} icon={Sparkles} />
              <MetricCard label="Top drivers" value={String(topFeatures.length)} icon={BarChart3} />
              <MetricCard label="Available" value={(explainability?.methods_available ?? []).join(", ") || "none"} icon={CheckCircle2} />
              <MetricCard label="Gemini status" value={geminiInterpretation?.status ?? "idle"} icon={MessageSquareText} />
            </div>
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
                onChange={(event) => {
                  setAnalysisId(event.target.value);
                  const selected = analyses.find((item) => item.id === event.target.value);
                  if (selected) saveAnalysis(selected);
                }}
                className="min-w-[260px] border border-white/10 bg-black/30 px-4 py-3 text-sm text-white"
              >
                {analyses.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.input.fileName} | {new Date(item.createdAt).toLocaleString()}
                  </option>
                ))}
              </select>
            </div>

            {error && <Notice tone="warning" message={error} />}
            {!analysis && !error && <Notice tone="warning" message="No explainability payload is available yet." />}

            {analysis && (
              <div className="space-y-4">
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-emerald-300">Run summary</p>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <SummaryLine label="Dataset" value={analysis.input.fileName} />
                    <SummaryLine label="Domain" value={analysis.result.metadata.domain} />
                    <SummaryLine label="Prediction source" value={analysis.result.metadata.prediction_auto_generated ? "XGBoost surrogate" : "Uploaded prediction column"} />
                    <SummaryLine label="Fairness score" value={`${formatMetric(analysis.result.fairness_summary.overall_fairness_score)}%`} />
                  </div>
                </div>

                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                  <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-emerald-300">Winning setup</p>
                  <p className="mt-3 text-sm leading-7 text-muted-foreground">
                    We combine SHAP-based model explainability with LLM-powered natural language interpretation to provide both mathematically grounded and human-readable insights.
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button
                    onClick={async () => {
                      if (!analysis) return;
                      setGenerating(true);
                      setError(null);
                      try {
                        const updated = await generateGeminiExplanation(analysis.id);
                        setAnalyses((current) => [updated, ...current.filter((item) => item.id !== updated.id)]);
                        setAnalysisId(updated.id);
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
                    {generating ? "Generating with Gemini..." : "Generate Gemini interpretation"}
                  </Button>
                  <div className="inline-flex items-center border border-white/10 bg-black/20 px-4 py-3 text-xs uppercase tracking-[0.25em] text-muted-foreground">
                    Backend key required
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="card-glow p-6">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-emerald-300">Global attribution</p>
                <h2 className="mt-2 text-xl font-semibold text-white">Top feature drivers</h2>
              </div>
            </div>
            <div className="h-[360px]">
              {chartData.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                    <XAxis
                      dataKey="feature"
                      angle={-18}
                      textAnchor="end"
                      height={80}
                      tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }} tickLine={false} axisLine={false} />
                    <Tooltip content={<ExplainabilityTooltip />} />
                    <Bar dataKey="importance" fill="var(--chart-primary)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState message="This analysis does not yet expose SHAP output. Install `shap`, rerun the audit, and the attribution chart will populate here." />
              )}
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <div className="card-glow p-6">
            <div className="mb-5 flex items-center gap-3">
              <Target className="h-5 w-5 text-emerald-400" />
              <h2 className="text-xl font-semibold text-white">SHAP explanation feed</h2>
            </div>
            {shapSummary.length ? (
              <div className="space-y-3">
                {shapSummary.map((item) => (
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
              <EmptyState message={explainability?.note ?? "No model-based summary is available for this run."} />
            )}
          </div>

          <div className="card-glow p-6">
            <div className="mb-5 flex items-center gap-3">
              <MessageSquareText className="h-5 w-5 text-cyan-400" />
              <h2 className="text-xl font-semibold text-white">Natural language layer</h2>
            </div>
            <div className="space-y-4">
              <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
                <p className="text-sm leading-7 text-muted-foreground">
                  Gemini should not replace SHAP. Use it after SHAP to translate real attributions into plain language for reports, executive summaries, or judge-friendly walkthroughs.
                </p>
              </div>

              {geminiInterpretation?.text ? (
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-emerald-300">Gemini output</p>
                  <div className="mt-3 whitespace-pre-wrap text-sm leading-7 text-muted-foreground">{geminiInterpretation.text}</div>
                  <p className="mt-4 text-[11px] text-muted-foreground/80">
                    Model: {geminiInterpretation.model || "unknown"}
                    {geminiInterpretation.generatedAt ? ` | ${new Date(geminiInterpretation.generatedAt).toLocaleString()}` : ""}
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-emerald-300">Gemini status</p>
                  <p className="mt-3 text-sm leading-7 text-muted-foreground">
                    {geminiInterpretation?.note || "No Gemini narration has been generated for this analysis yet."}
                  </p>
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
                <EmptyState message="Once SHAP local summaries are available, this panel can be fed into Gemini prompts for natural-language explanations." />
              )}

              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-emerald-300">Prompt pattern</p>
                <pre className="mt-3 overflow-x-auto whitespace-pre-wrap font-mono text-xs leading-6 text-muted-foreground">
{`Explain in simple terms:
- income has high positive impact on approval
- age has negative impact
- keep the explanation grounded in the SHAP numbers above`}
                </pre>
              </div>
            </div>
          </div>
        </section>

        <section className="card-glow p-6">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-emerald-300">Methods inventory</p>
              <h2 className="mt-2 text-xl font-semibold text-white">What is active in this run</h2>
            </div>
            <Button asChild variant="outline" className="border-white/10 text-white hover:bg-white/5">
              <Link to="/metrics" className="inline-flex items-center gap-2">
                Open fairness metrics
              </Link>
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <MethodList title="Available methods" items={explainability?.methods_available ?? []} accent="emerald" />
            <MethodList title="Unavailable methods" items={explainability?.methods_unavailable ?? []} accent="amber" />
          </div>
        </section>
      </div>
    </Layout>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-emerald-400" />
      </div>
      <p className="mt-3 text-sm font-semibold text-white">{value}</p>
    </div>
  );
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

function MethodList({ title, items, accent }: { title: string; items: string[]; accent: "emerald" | "amber" }) {
  const palette =
    accent === "emerald"
      ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-300"
      : "border-amber-500/20 bg-amber-500/5 text-amber-300";

  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
      <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">{title}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {items.length ? (
          items.map((item) => (
            <span key={item} className={`border px-3 py-1 text-[10px] font-mono uppercase tracking-[0.2em] ${palette}`}>
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

function Notice({ tone, message }: { tone: "warning"; message: string }) {
  return (
    <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm leading-6 text-amber-200">
      {message}
    </div>
  );
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
      <p className="mt-1 text-xs font-mono uppercase tracking-[0.2em] text-emerald-300">
        mean |SHAP| {formatMetric(point.value, 4)}
      </p>
    </div>
  );
}
