"use client";

import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import {
  formatMetric,
  formatRelativeTime,
  getCorrectedScore,
  getCorrectedSensitiveFindings,
} from "@/lib/analysis-insights";
import { getCorrectedCsvUrl, getPdfReportUrl, listAnalyses } from "@/lib/api";
import { loadAnalysisHistory, loadLatestAnalysis, saveAnalysis } from "@/lib/analysis-store";
import type { AnalysisPayload, SensitiveFinding } from "@/types/analysis";
import {
  BarChart3,
  Download,
  Eye,
  FileSpreadsheet,
  Gauge,
  Radar as RadarIcon,
  ShieldCheck,
  Target,
  TrendingUp,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useEffect, useMemo, useState } from "react";

type SliceView = {
  key: string;
  original: SensitiveFinding;
  corrected: SensitiveFinding | null;
  projected: SensitiveFinding | null;
};

export default function MetricsPage() {
  const [analyses, setAnalyses] = useState<AnalysisPayload[]>([]);
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [sliceId, setSliceId] = useState<string | null>(null);
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
        setError(items.length ? null : cachedHistory.length ? "Live metrics archive is empty, showing cached runs." : null);
        if (preferred) saveAnalysis(preferred);
      } catch {
        if (!mounted) return;

        setAnalyses(cachedHistory);
        setAnalysisId(cached?.id ?? cachedHistory[0]?.id ?? null);
        setError(
          cachedHistory.length
            ? "Live metrics archive is unavailable, showing cached runs."
            : "No analysis is available yet. Launch a FairLens run from the analyzer first.",
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

  const slices = useMemo<SliceView[]>(() => {
    if (!analysis) return [];

    const correctedMap = new Map(
      getCorrectedSensitiveFindings(analysis).map((finding) => [finding.sensitive_column, finding]),
    );
    const projectedMap = new Map(
      (analysis.mitigationPreview?.group_projection ?? []).map((finding) => [finding.sensitive_column, finding as SensitiveFinding]),
    );

    return analysis.result.sensitive_findings.map((finding) => ({
      key: finding.sensitive_column,
      original: finding,
      corrected: correctedMap.get(finding.sensitive_column) ?? null,
      projected: projectedMap.get(finding.sensitive_column) ?? null,
    }));
  }, [analysis]);

  useEffect(() => {
    if (!slices.length) {
      setSliceId(null);
      return;
    }

    if (!sliceId || !slices.some((item) => item.key === sliceId)) {
      const worst = [...slices].sort((left, right) => left.original.fairness_score - right.original.fairness_score)[0];
      setSliceId(worst.key);
    }
  }, [sliceId, slices]);

  const activeSlice = useMemo(
    () => slices.find((item) => item.key === sliceId) ?? slices[0] ?? null,
    [sliceId, slices],
  );

  const correctedScore = analysis ? getCorrectedScore(analysis) : null;
  const targetScore = analysis?.result.fairness_summary.fairness_target ?? 95;

  const summaryCards = useMemo(() => {
    if (!analysis) return [];

    const lowestOriginal = [...analysis.result.sensitive_findings].sort((left, right) => left.disparate_impact - right.disparate_impact)[0];
    const correctedFindings = getCorrectedSensitiveFindings(analysis);
    const lowestCorrected = correctedFindings.length
      ? [...correctedFindings].sort((left, right) => left.disparate_impact - right.disparate_impact)[0]
      : null;

    return [
      {
        label: "Overall fairness",
        value: `${formatMetric(analysis.result.fairness_summary.overall_fairness_score)}%`,
        note: `${analysis.result.fairness_summary.risk_level} risk band`,
        tone: "default" as const,
        icon: Gauge,
      },
      {
        label: "Corrected fairness",
        value: typeof correctedScore === "number" ? `${formatMetric(correctedScore)}%` : "--",
        note:
          typeof correctedScore === "number"
            ? `${formatMetric(correctedScore - analysis.result.fairness_summary.overall_fairness_score, 1)} pts lift`
            : "not generated",
        tone: "success" as const,
        icon: ShieldCheck,
      },
      {
        label: "Target gap",
        value: typeof correctedScore === "number" ? formatMetric(Math.max(0, targetScore - correctedScore), 2) : "--",
        note: analysis.result.fairness_summary.fairness_target_met ? "release target met" : `threshold ${targetScore}+`,
        tone: "warning" as const,
        icon: Target,
      },
      {
        label: "Worst DI",
        value: lowestOriginal ? formatMetric(lowestOriginal.disparate_impact, 3) : "--",
        note: lowestOriginal ? `${toTitleCase(lowestOriginal.sensitive_column)} original` : "no slice",
        tone: "default" as const,
        icon: TrendingUp,
      },
      {
        label: "Corrected DI",
        value: lowestCorrected ? formatMetric(lowestCorrected.disparate_impact, 3) : "--",
        note: lowestCorrected ? `${toTitleCase(lowestCorrected.sensitive_column)} corrected` : "not generated",
        tone: "success" as const,
        icon: ShieldCheck,
      },
      {
        label: "Overall accuracy",
        value:
          typeof analysis.result.fairness_summary.overall_accuracy === "number"
            ? `${formatMetric(analysis.result.fairness_summary.overall_accuracy * 100)}%`
            : "--",
        note:
          typeof analysis.result.fairness_summary.corrected_accuracy === "number"
            ? `corrected ${formatMetric(analysis.result.fairness_summary.corrected_accuracy * 100)}%`
            : "accuracy telemetry unavailable",
        tone: "default" as const,
        icon: BarChart3,
      },
    ];
  }, [analysis, correctedScore, targetScore]);

  const sliceFairnessData = useMemo(() => {
    return slices.map((slice) => ({
      slice: toTitleCase(slice.key),
      original: Number(slice.original.fairness_score.toFixed(2)),
      corrected: Number((slice.corrected?.fairness_score ?? slice.original.fairness_score).toFixed(2)),
      projected:
        typeof slice.projected?.projected_fairness_score === "number"
          ? Number(slice.projected.projected_fairness_score.toFixed(2))
          : null,
    }));
  }, [slices]);

  const radarData = useMemo(() => {
    if (!activeSlice) return [];

    const original = activeSlice.original;
    const corrected = activeSlice.corrected ?? activeSlice.original;
    const projected = activeSlice.projected;

    return [
      {
        metric: "Fairness",
        original: original.fairness_score,
        corrected: corrected.fairness_score,
        projected: projected?.projected_fairness_score ?? corrected.fairness_score,
      },
      {
        metric: "Disparate Impact",
        original: clampMetric(original.disparate_impact * 100),
        corrected: clampMetric(corrected.disparate_impact * 100),
        projected: clampMetric((projected?.projected_disparate_impact ?? corrected.disparate_impact) * 100),
      },
      {
        metric: "Parity Stability",
        original: clampMetric(100 - original.demographic_parity_difference * 100),
        corrected: clampMetric(100 - corrected.demographic_parity_difference * 100),
        projected: clampMetric(100 - corrected.demographic_parity_difference * 100),
      },
      {
        metric: "Accuracy Stability",
        original: clampMetric(100 - original.accuracy_spread * 100),
        corrected: clampMetric(100 - corrected.accuracy_spread * 100),
        projected: clampMetric(100 - corrected.accuracy_spread * 100),
      },
    ];
  }, [activeSlice]);

  const groupMetricData = useMemo(() => {
    if (!activeSlice) return [];

    const correctedMap = new Map(
      (activeSlice.corrected?.group_metrics ?? []).map((group) => [String(group.group), group]),
    );

    return activeSlice.original.group_metrics.map((group) => {
      const correctedGroup = correctedMap.get(String(group.group));
      return {
        group: String(group.group),
        originalSelection: Number((group.selection_rate * 100).toFixed(1)),
        correctedSelection: Number(((correctedGroup?.selection_rate ?? group.selection_rate) * 100).toFixed(1)),
        originalAccuracy: group.accuracy !== undefined ? Number((group.accuracy * 100).toFixed(1)) : null,
        correctedAccuracy:
          correctedGroup?.accuracy !== undefined
            ? Number((correctedGroup.accuracy * 100).toFixed(1))
            : group.accuracy !== undefined
              ? Number((group.accuracy * 100).toFixed(1))
              : null,
      };
    });
  }, [activeSlice]);

  const comparisonRows = useMemo(() => {
    if (!activeSlice) return [];

    const correctedMap = new Map(
      (activeSlice.corrected?.group_metrics ?? []).map((group) => [String(group.group), group]),
    );
    const groupNames = Array.from(
      new Set([
        ...activeSlice.original.group_metrics.map((group) => String(group.group)),
        ...Array.from(correctedMap.keys()),
      ]),
    );

    return groupNames.map((groupName) => ({
      group: groupName,
      original: activeSlice.original.group_metrics.find((group) => String(group.group) === groupName) ?? null,
      corrected: correctedMap.get(groupName) ?? null,
    }));
  }, [activeSlice]);

  function selectAnalysis(item: AnalysisPayload) {
    setAnalysisId(item.id);
    saveAnalysis(item);
  }

  return (
    <Layout>
      <div className="space-y-8 pb-12">
        <section className="command-panel p-8">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[10px] font-mono uppercase tracking-[0.3em] text-emerald-300">
              <BarChart3 className="h-3.5 w-3.5" />
              Fairness Metrics
            </div>
            <h1 className="text-3xl font-bold text-white">Fairness Metrics</h1>
            <p className="max-w-4xl text-sm leading-7 text-muted-foreground">
              Detailed fairness scores, disparate impact, demographic parity, accuracy spread, and group-level metrics for each sensitive attribute — before and after bias correction.
            </p>
          </div>
        </section>

        {error && (
          <div className="card-glow border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-100">
            {error}
          </div>
        )}

        {loading ? (
          <div className="command-panel p-8 text-muted-foreground">Loading fairness metrics...</div>
        ) : !analysis ? (
          <div className="command-panel space-y-4 p-8 text-muted-foreground">
            <p>No analysis is available yet.</p>
            <Button asChild className="w-fit bg-emerald-500 text-black hover:bg-emerald-400">
              <a href="/analyzer">Launch FairLens Analysis</a>
            </Button>
          </div>
        ) : (
          <>
            <section className="command-panel p-8">
              <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
                <div className="space-y-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-[10px] font-mono uppercase tracking-[0.35em] text-emerald-300">Selected analysis</p>
                      <h2 className="mt-2 text-2xl font-semibold text-white">{analysis.input.fileName}</h2>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {toTitleCase(analysis.result.metadata.domain)} domain | {analysis.result.metadata.rows.toLocaleString()} rows |{" "}
                        {formatRelativeTime(analysis.createdAt)}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <a
                        href={getPdfReportUrl(analysis.id)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 border border-white/10 bg-black/20 px-4 py-3 text-sm text-white hover:bg-white/5"
                      >
                        <Eye className="h-4 w-4 text-emerald-400" />
                        Audit PDF
                      </a>
                      <a
                        href={getCorrectedCsvUrl(analysis.id)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 border border-white/10 bg-black/20 px-4 py-3 text-sm text-white hover:bg-white/5"
                      >
                        <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
                        Corrected CSV
                      </a>
                    </div>
                  </div>

                  <div className="terminal-card p-5">
                    <p className="text-[10px] font-mono uppercase tracking-[0.35em] text-emerald-300">Executive summary</p>
                    <p className="mt-3 text-sm leading-7 text-muted-foreground">
                      {analysis.result.explanation.executive_summary}
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-[10px] font-mono uppercase tracking-[0.35em] text-emerald-300">Recent runs</p>
                  {analyses.slice(0, 5).map((item) => (
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
            </section>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {summaryCards.map((card) => (
                <MetricCard
                  key={card.label}
                  label={card.label}
                  value={card.value}
                  note={card.note}
                  tone={card.tone}
                  icon={card.icon}
                />
              ))}
            </div>

            <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
              <section className="command-panel p-8">
                <div className="mb-6 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-mono uppercase tracking-[0.35em] text-emerald-300">Configuration</p>
                    <h2 className="mt-2 text-xl font-semibold text-white">Analysis Configuration</h2>
                  </div>
                  <Gauge className="h-5 w-5 text-emerald-400" />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <MiniStat label="Correction method" value={toTitleCase(analysis.result.metadata.correction_method ?? "hybrid")} />
                  <MiniStat label="Target column" value={analysis.result.metadata.target_column ?? "Auto / none"} />
                  <MiniStat label="Prediction column" value={analysis.result.metadata.prediction_column ?? "Generated"} />
                  <MiniStat label="Sensitive columns" value={analysis.result.metadata.sensitive_columns.join(", ") || "Auto"} />
                  <MiniStat label="Training rows" value={String(analysis.result.metadata.training_rows_used ?? analysis.result.metadata.rows)} />
                  <MiniStat label="Dataset mode" value={analysis.result.metadata.large_dataset_mode ? "Large-scale" : "Standard"} />
                </div>
              </section>

              <section className="command-panel p-8">
                <div className="mb-6 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-mono uppercase tracking-[0.35em] text-emerald-300">Model insights</p>
                    <h2 className="mt-2 text-xl font-semibold text-white">Detection Notes & Key Features</h2>
                  </div>
                  <RadarIcon className="h-5 w-5 text-emerald-400" />
                </div>

                <div className="grid gap-6">
                  <div className="terminal-card p-5">
                    <p className="text-[10px] font-mono uppercase tracking-[0.35em] text-emerald-300">Top influential features</p>
                    <div className="mt-4 space-y-3">
                      {(analysis.result.explainability?.top_features ?? []).slice(0, 10).length ? (
                        (analysis.result.explainability?.top_features ?? []).slice(0, 10).map((feature) => (
                          <div key={feature.feature} className="flex items-start justify-between gap-4 border-b border-white/5 pb-3 last:border-b-0 last:pb-0">
                            <div>
                              <p className="font-medium text-white">{feature.feature}</p>
                              <p className="mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                                {feature.reason ?? "model attribution"}
                              </p>
                            </div>
                            <span className="text-sm text-emerald-300">
                              {typeof feature.score === "number" ? formatMetric(feature.score, 3) : "--"}
                            </span>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">No explainability features were returned for this analysis.</p>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            </div>

            <section className="command-panel p-8">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-[0.35em] text-emerald-300">Attribute explorer</p>
                  <h2 className="mt-2 text-xl font-semibold text-white">Sensitive Attributes</h2>
                </div>
                <div className="flex flex-wrap gap-3">
                  {slices.map((slice) => (
                    <button
                      key={slice.key}
                      onClick={() => setSliceId(slice.key)}
                      className={`border px-4 py-2 text-[10px] font-mono uppercase tracking-[0.25em] transition ${
                        slice.key === activeSlice?.key
                          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                          : "border-white/10 bg-black/20 text-muted-foreground hover:border-emerald-500/30 hover:text-white"
                      }`}
                    >
                      {toTitleCase(slice.key)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-6 xl:grid-cols-[1fr_0.95fr]">
                <div className="card-glow rounded-xl p-6">
                  <div className="mb-6 flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-white opacity-80">Slice Fairness Lift</h3>
                    <ShieldCheck className="h-4 w-4 text-emerald-400" />
                  </div>
                  <div className="h-[320px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={sliceFairnessData} margin={{ top: 10, right: 10, left: -20, bottom: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.03)" />
                        <XAxis dataKey="slice" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} tickLine={false} axisLine={false} />
                        <YAxis tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 10 }} tickLine={false} axisLine={false} />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="original" name="Original" fill="var(--chart-primary)" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="corrected" name="Corrected" fill="var(--chart-secondary)" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="projected" name="Projected" fill="var(--chart-accent)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="card-glow rounded-xl p-6">
                  <div className="mb-6 flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-widest text-white opacity-80">Metric Comparison</h3>
                      <p className="mt-1 text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                        {activeSlice ? toTitleCase(activeSlice.key) : "No slice selected"}
                      </p>
                    </div>
                    <RadarIcon className="h-4 w-4 text-emerald-400" />
                  </div>
                  <div className="h-[320px]">
                    {activeSlice ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <RadarChart cx="50%" cy="50%" outerRadius="75%" data={radarData}>
                          <PolarGrid stroke="rgba(255,255,255,0.05)" />
                          <PolarAngleAxis dataKey="metric" tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 10 }} />
                          <Tooltip content={<CustomTooltip />} />
                          <Radar name="Original" dataKey="original" stroke="var(--chart-primary)" fill="var(--chart-primary)" fillOpacity={0.12} />
                          <Radar name="Corrected" dataKey="corrected" stroke="var(--chart-secondary)" fill="var(--chart-secondary)" fillOpacity={0.28} />
                          <Radar name="Projected" dataKey="projected" stroke="var(--chart-accent)" fill="var(--chart-accent)" fillOpacity={0.18} />
                        </RadarChart>
                      </ResponsiveContainer>
                    ) : (
                      <EmptyPanel message="No sensitive slice is available for metric inspection." />
                    )}
                  </div>
                </div>
              </div>
            </section>

            <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
              <section className="command-panel p-8">
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-white">Group Metric Comparison</h2>
                    <p className="mt-1 text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                      Selection rate and accuracy by group
                    </p>
                  </div>
                  <Gauge className="h-5 w-5 text-emerald-400" />
                </div>

                <div className="h-[360px]">
                  {groupMetricData.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={groupMetricData} margin={{ top: 10, right: 10, left: -10, bottom: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.03)" />
                        <XAxis dataKey="group" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} tickLine={false} axisLine={false} />
                        <YAxis tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 10 }} tickLine={false} axisLine={false} />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="originalSelection" name="Orig Selection" fill="var(--chart-primary)" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="correctedSelection" name="Corr Selection" fill="var(--chart-secondary)" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="originalAccuracy" name="Orig Accuracy" fill="rgba(16,185,129,0.35)" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="correctedAccuracy" name="Corr Accuracy" fill="rgba(20,184,166,0.35)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyPanel message="No group metrics are available for this slice." />
                  )}
                </div>
              </section>

              <section className="command-panel space-y-5 p-8">
                {activeSlice && (
                  <>
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-[10px] font-mono uppercase tracking-[0.35em] text-emerald-300">Selected attribute</p>
                        <h2 className="mt-2 text-2xl font-semibold text-white">{toTitleCase(activeSlice.key)}</h2>
                      </div>
                      <span className={`border px-3 py-1 text-[10px] font-mono uppercase tracking-[0.2em] ${riskTone(activeSlice.original.risk_level)}`}>
                        {activeSlice.original.risk_level} risk
                      </span>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <MiniStat label="Baseline group" value={activeSlice.original.baseline_group ?? "N/A"} />
                      <MiniStat label="DI" value={formatMetric(activeSlice.original.disparate_impact, 3)} />
                      <MiniStat label="DP gap" value={formatMetric(activeSlice.original.demographic_parity_difference, 3)} />
                      <MiniStat label="Acc spread" value={formatMetric(activeSlice.original.accuracy_spread, 3)} />
                      <MiniStat
                        label="Corrected fairness"
                        value={`${formatMetric(activeSlice.corrected?.fairness_score ?? activeSlice.original.fairness_score)}%`}
                      />
                      <MiniStat
                        label="Projected fairness"
                        value={
                          typeof activeSlice.projected?.projected_fairness_score === "number"
                            ? `${formatMetric(activeSlice.projected.projected_fairness_score)}%`
                            : "N/A"
                        }
                      />
                    </div>

                    <div className="terminal-card p-5">
                      <p className="text-[10px] font-mono uppercase tracking-[0.35em] text-emerald-300">Analysis notes</p>
                      <div className="mt-4 space-y-3">
                        {activeSlice.original.notes.length ? (
                          activeSlice.original.notes.map((note) => (
                            <p key={note} className="text-sm text-muted-foreground">
                              - {note}
                            </p>
                          ))
                        ) : (
                          <p className="text-sm text-muted-foreground">No metric notes were emitted for this slice.</p>
                        )}
                      </div>
                    </div>

                    {activeSlice.projected && (
                      <div className="terminal-card p-5">
                        <p className="text-[10px] font-mono uppercase tracking-[0.35em] text-emerald-300">Mitigation projection</p>
                        <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-muted-foreground">
                          <p>Current fairness {formatMetric(activeSlice.projected.fairness_score)}%</p>
                          <p>Projected fairness {formatMetric(activeSlice.projected.projected_fairness_score ?? activeSlice.projected.fairness_score)}%</p>
                          <p>Current DI {formatMetric(activeSlice.projected.disparate_impact, 3)}</p>
                          <p>Projected DI {formatMetric(activeSlice.projected.projected_disparate_impact ?? activeSlice.projected.disparate_impact, 3)}</p>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </section>
            </div>

            <section className="command-panel p-8">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-white">Detailed Group Metrics</h2>
                  <p className="mt-1 text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                    Original vs corrected TPR, FPR, FNR, accuracy, and selection rate
                  </p>
                </div>
                <Download className="h-5 w-5 text-emerald-400" />
              </div>

              {comparisonRows.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-muted-foreground">
                        <th className="py-3 pr-4">Group</th>
                        <th className="py-3 pr-4">Count</th>
                        <th className="py-3 pr-4">Orig Selection</th>
                        <th className="py-3 pr-4">Corr Selection</th>
                        <th className="py-3 pr-4">Orig TPR</th>
                        <th className="py-3 pr-4">Corr TPR</th>
                        <th className="py-3 pr-4">Orig FPR</th>
                        <th className="py-3 pr-4">Corr FPR</th>
                        <th className="py-3 pr-4">Orig FNR</th>
                        <th className="py-3 pr-4">Corr FNR</th>
                        <th className="py-3 pr-4">Orig Accuracy</th>
                        <th className="py-3 pr-4">Corr Accuracy</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparisonRows.map((row) => (
                        <tr key={row.group} className="border-b border-white/5 text-white">
                          <td className="py-3 pr-4 font-medium">{row.group}</td>
                          <td className="py-3 pr-4">{row.original?.count ?? row.corrected?.count ?? "-"}</td>
                          <td className="py-3 pr-4">{formatRate(row.original?.selection_rate)}</td>
                          <td className="py-3 pr-4 text-emerald-300">{formatRate(row.corrected?.selection_rate ?? row.original?.selection_rate)}</td>
                          <td className="py-3 pr-4">{formatRate(row.original?.true_positive_rate)}</td>
                          <td className="py-3 pr-4 text-emerald-300">{formatRate(row.corrected?.true_positive_rate)}</td>
                          <td className="py-3 pr-4">{formatRate(row.original?.false_positive_rate)}</td>
                          <td className="py-3 pr-4 text-emerald-300">{formatRate(row.corrected?.false_positive_rate)}</td>
                          <td className="py-3 pr-4">{formatRate(row.original?.false_negative_rate)}</td>
                          <td className="py-3 pr-4 text-emerald-300">{formatRate(row.corrected?.false_negative_rate)}</td>
                          <td className="py-3 pr-4">{formatRate(row.original?.accuracy)}</td>
                          <td className="py-3 pr-4 text-emerald-300">{formatRate(row.corrected?.accuracy)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyPanel message="No detailed group metrics are available for this analysis." />
              )}
            </section>
          </>
        )}
      </div>
    </Layout>
  );
}

function MetricCard({
  label,
  value,
  note,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string;
  note: string;
  tone: "default" | "success" | "warning";
  icon: typeof Gauge;
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
      <p className="mt-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">{note}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="terminal-card p-4">
      <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-xl font-semibold text-white">{value}</p>
    </div>
  );
}

function EmptyPanel({ message }: { message: string }) {
  return (
    <div className="flex min-h-[200px] items-center justify-center border border-dashed border-white/10 bg-black/20 p-6 text-center text-sm text-muted-foreground">
      <p className="max-w-sm leading-6">{message}</p>
    </div>
  );
}

function CustomTooltip({ active, payload, label }: any) {
  if (!(active && payload && payload.length)) return null;

  return (
    <div className="rounded-lg border border-white/10 bg-card/80 p-3 shadow-xl shadow-black/50 backdrop-blur-md">
      <p className="mb-1 font-mono text-xs font-semibold uppercase tracking-widest text-foreground">{`${label}`}</p>
      {payload.map((entry: any, index: number) => (
        <p key={`item-${index}`} style={{ color: entry.color }} className="text-sm font-bold">
          {`${entry.name || "Value"}: ${formatTooltipValue(entry.value)}`}
        </p>
      ))}
    </div>
  );
}

function formatTooltipValue(value: unknown) {
  if (typeof value !== "number") return String(value);
  return Number.isInteger(value) ? `${value}` : value.toFixed(2);
}

function formatRate(value?: number | null) {
  if (typeof value !== "number") return "-";
  return `${(value * 100).toFixed(1)}%`;
}

function toTitleCase(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function clampMetric(value: number) {
  return Math.max(0, Math.min(100, Number(value.toFixed(2))));
}

function riskTone(risk: string) {
  if (risk === "low") return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300";
  if (risk === "medium") return "border-amber-500/20 bg-amber-500/10 text-amber-300";
  return "border-red-500/20 bg-red-500/10 text-red-300";
}
