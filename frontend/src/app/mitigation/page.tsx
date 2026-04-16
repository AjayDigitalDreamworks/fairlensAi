"use client";

import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { createMitigationPreview, getAnalysis, listAnalyses, getCorrectedCsvUrl, getPdfReportUrl } from "@/lib/api";
import { loadLatestAnalysis, saveAnalysis } from "@/lib/analysis-store";
import { formatMetric } from "@/lib/analysis-insights";
import { AnalysisPayload } from "@/types/analysis";
import BiasBeforeAfter, { BiasProgressBars, BiasSlice } from "@/components/BiasBeforeAfter";
import { ELI5Tooltip, ELI5ModeToggle, TermBadge } from "@/components/ELI5Tooltip";
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
  Activity,
  Info,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";

const strategies = [
  {
    id: "reweighing",
    title: "Dynamic Reweighing",
    eli5: "Adjusting how much the AI values each training example to be fairer.",
    note: "Adjusts sample weights across intersectional groups to neutralize representation bias during model training.",
    icon: Target,
    termKey: "Reweighing",
  },
  {
    id: "threshold_optimization",
    title: "Threshold Optimization",
    eli5: "Setting a different pass/fail cutoff per group so approval rates become equal.",
    note: "Calibrates per-group decision boundaries to equalize selection rates while preserving predictive accuracy.",
    icon: TrendingUp,
    termKey: "Threshold Optimization",
  },
  {
    id: "resampling",
    title: "Strategic Resampling",
    eli5: "Balancing training data by adding more examples from underrepresented groups.",
    note: "Oversamples minority groups and undersamples majority groups to correct for training distribution skew.",
    icon: ArrowUpRight,
    termKey: "Strategic Resampling",
  },
  {
    id: "adversarial_debiasing",
    title: "Adversarial Debiasing",
    eli5: "Training the AI to be blind to protected attributes like gender or race.",
    note: "Trains a secondary adversary network to remove protected-attribute signals from the learned representation.",
    icon: ShieldCheck,
    termKey: "Adversarial Debiasing",
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
  const [eli5Mode, setEli5Mode] = useState(false);

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

  // Build BiasSlice[] for the BiasBeforeAfter chart
  const biasSlices = useMemo<BiasSlice[]>(() => {
    return originalFindings.map((f) => {
      const corrected = correctedFindings.find((c) => c.sensitive_column === f.sensitive_column);
      return {
        attribute: f.sensitive_column,
        originalScore: f.fairness_score,
        correctedScore: corrected?.fairness_score ?? null,
        originalDI: f.disparate_impact,
        correctedDI: corrected?.disparate_impact ?? null,
        originalDP: f.demographic_parity_difference,
        correctedDP: corrected?.demographic_parity_difference ?? null,
        riskLevel: f.risk_level,
      };
    });
  }, [originalFindings, correctedFindings]);

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
              <h1 className="text-3xl font-bold text-white">
                <ELI5Tooltip term="Mitigation">Mitigation Toolkit</ELI5Tooltip>
              </h1>
              <p className="max-w-3xl text-sm leading-7 text-muted-foreground">
                {eli5Mode
                  ? "This page shows you how to fix your AI's unfair behavior. Choose a repair strategy, run a preview, and see how fair your AI becomes — before you go live."
                  : "Review corrected fairness outcomes, compare before-and-after metrics per sensitive attribute, and simulate alternative mitigation strategies with projected impact analysis."}
              </p>
            </div>

            <div className="flex flex-col items-end gap-3">
              <ELI5ModeToggle enabled={eli5Mode} onToggle={() => setEli5Mode((v) => !v)} />
              {/* Analysis selector */}
              {analyses.length > 0 && (
                <select
                  value={analysisId ?? ""}
                  onChange={(e) => setAnalysisId(e.target.value)}
                  className="min-w-[260px] border border-white/10 bg-black/30 px-4 py-3 text-sm text-white"
                >
                  {analyses.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.input?.fileName ?? "Unknown"} | {new Date(item.createdAt || Date.now()).toLocaleString()}
                    </option>
                  ))}
                </select>
              )}
            </div>
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
                label={eli5Mode ? "AI Fairness Before Fix" : "Original Fairness"}
                value={typeof originalScore === "number" ? `${formatMetric(originalScore)}%` : "--"}
                accent="white"
                tooltip={eli5Mode ? undefined : "Fairness Score"}
              />
              <ScoreCard
                label={eli5Mode ? "AI Fairness After Fix" : "Corrected Fairness"}
                value={typeof correctedScore === "number" ? `${formatMetric(correctedScore)}%` : "--"}
                accent={typeof correctedScore === "number" && correctedScore >= 95 ? "emerald" : "amber"}
                tooltip={eli5Mode ? undefined : "Corrected Fairness"}
              />
              <ScoreCard
                label={eli5Mode ? "Points Needed to Pass" : "Compliance Gap"}
                value={targetGap !== null ? (targetGap === 0 ? "On Target" : `${formatMetric(targetGap)} pts`) : "--"}
                accent={targetGap === 0 ? "emerald" : "amber"}
                tooltip={eli5Mode ? undefined : "Compliance Gap"}
              />
              <ScoreCard
                label={eli5Mode ? "Does it pass the law?" : "95+ Target"}
                value={targetMet ? "PASSED" : "NOT MET"}
                accent={targetMet ? "emerald" : "red"}
                icon={targetMet ? CheckCircle2 : XCircle}
              />
            </section>

            {/* ── Before / After Bias Visualization ── */}
            <section className="command-panel p-8">
              <div className="mb-2 flex items-center gap-2">
                <Activity className="h-5 w-5 text-emerald-400" />
                <h2 className="text-xl font-semibold text-white">
                  {eli5Mode ? "How did the AI improve for each group?" : "Before vs After Bias Correction"}
                  <TermBadge term="Fairness Score" />
                </h2>
              </div>
              {eli5Mode && (
                <p className="mb-4 text-sm text-amber-300/80 border border-amber-500/20 bg-amber-500/5 px-4 py-2 rounded-lg">
                  📖 <strong>ELI5:</strong> This chart shows each group (like gender or race) before the fix (faded bar) and after the fix (bright bar). Taller bright bars = fairer AI.
                </p>
              )}
              <BiasBeforeAfter
                slices={biasSlices}
                title={eli5Mode ? "Fairness by Group — Before vs After Fix" : "Sensitive Attribute Fairness: Before vs After Correction"}
                subtitle={eli5Mode ? "Red = still unfair · Amber = borderline · Green = fair (80%+)" : "Scores closer to 100 indicate fairer AI outcomes for each demographic group"}
                showDI={!eli5Mode}
                showDP={!eli5Mode}
              />
            </section>

            {/* Main grid */}
            <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
              {/* Strategy selection */}
              <section className="command-panel space-y-4 p-8">
                <div className="flex items-center gap-3">
                  <Cpu className="h-5 w-5 text-emerald-400" />
                  <h2 className="text-xl font-semibold text-white">
                    {eli5Mode ? "Choose a Repair Strategy" : "Strategy Selector"}
                  </h2>
                </div>
                <p className="text-sm text-muted-foreground">
                  {eli5Mode
                    ? "Pick one of the methods below to reduce unfair outcomes. Then click 'Generate Preview' to see the projected effect."
                    : "Select a mitigation approach and generate a projected impact preview based on the current analysis data."}
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
                        <p className="font-medium">
                          <ELI5Tooltip term={item.termKey}>{item.title}</ELI5Tooltip>
                        </p>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {eli5Mode ? item.eli5 : item.note}
                      </p>
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
                  <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-emerald-300">
                    {eli5Mode ? "Download your fixed data" : "Export Artifacts"}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={getCorrectedCsvUrl(analysis.id)}
                      className="inline-flex items-center gap-2 border border-white/10 bg-black/20 px-4 py-2 text-xs uppercase tracking-[0.2em] text-muted-foreground hover:bg-white/5 hover:text-white transition"
                    >
                      <Download className="h-3.5 w-3.5" /> {eli5Mode ? "Fixed Dataset (CSV)" : "Corrected CSV"}
                    </a>
                    <a
                      href={getPdfReportUrl(analysis.id)}
                      className="inline-flex items-center gap-2 border border-white/10 bg-black/20 px-4 py-2 text-xs uppercase tracking-[0.2em] text-muted-foreground hover:bg-white/5 hover:text-white transition"
                    >
                      <Download className="h-3.5 w-3.5" /> {eli5Mode ? "Full Report (PDF)" : "Audit Report PDF"}
                    </a>
                  </div>
                </div>
              </section>

              {/* Results panel */}
              <section className="command-panel space-y-6 p-8">
                {/* Before/After compact progress bars */}
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-emerald-300">
                    {eli5Mode ? "Quick fairness progress per group" : "Before vs After Correction"}
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-white">
                    {eli5Mode ? "Which groups improved?" : "Sensitive Attribute Comparison"}
                  </h2>
                </div>

                {biasSlices.length > 0 ? (
                  <BiasProgressBars
                    slices={biasSlices}
                    title={eli5Mode ? "Fairness score: was → now (100% = perfectly fair)" : "Fairness scores: original → corrected"}
                  />
                ) : (
                  <div className="terminal-card p-5 text-muted-foreground">
                    No sensitive findings available.
                  </div>
                )}

                {/* Mitigation preview results */}
                {analysis.mitigationPreview && (
                  <>
                    <div className="border-t border-white/10 pt-6">
                      <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-emerald-300">
                        {eli5Mode ? "What happens if we apply this fix?" : "Strategy Preview Results"}
                      </p>
                      <h3 className="mt-2 text-lg font-semibold text-white capitalize">
                        {analysis.mitigationPreview.strategy.replace(/_/g, " ")} — {eli5Mode ? "Estimated Results" : "Projected Impact"}
                      </h3>
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                      <ScoreCard label={eli5Mode ? "AI Fairness Now" : "Current"} value={`${analysis.mitigationPreview.current_score}%`} accent="white" />
                      <ScoreCard label={eli5Mode ? "AI Fairness After Fix" : "Projected"} value={`${analysis.mitigationPreview.projected_score}%`} accent="emerald" />
                      <ScoreCard label={eli5Mode ? "Improvement" : "Lift"} value={`+${analysis.mitigationPreview.projected_improvement}%`} accent="emerald" />
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="terminal-card p-5">
                        <div className="mb-4 flex items-center gap-3">
                          <Sparkles className="h-4 w-4 text-emerald-400" />
                          <h3 className="font-semibold text-white">
                            {eli5Mode ? "What will happen step-by-step" : "Execution Steps"}
                          </h3>
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
                          <h3 className="font-semibold text-white">
                            {eli5Mode ? "Important things to know" : "Mitigation Notes"}
                          </h3>
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
                        <h3 className="text-lg font-semibold text-white">
                          {eli5Mode ? "Projected fairness per group" : "Per-Group Projection"}
                          <TermBadge term="Demographic Parity" />
                        </h3>
                        <div className="grid gap-3 md:grid-cols-2">
                          {analysis.mitigationPreview?.group_projection?.map((group) => (
                            <div key={group.sensitive_column} className="terminal-card p-5">
                              <p className="text-sm font-semibold text-white capitalize">
                                {group.sensitive_column.replace(/_/g, " ")}
                              </p>
                              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                                <MetricLine label={eli5Mode ? "Now" : "Current"} value={`${group.fairness_score}%`} />
                                <MetricLine label={eli5Mode ? "After fix" : "Projected"} value={`${group.projected_fairness_score}%`} accent />
                                <MetricLine label={<ELI5Tooltip term="Disparate Impact">DI</ELI5Tooltip>} value={String(group.disparate_impact)} />
                                <MetricLine label={<ELI5Tooltip term="Disparate Impact">Projected DI</ELI5Tooltip>} value={String(group.projected_disparate_impact)} accent />
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
                    <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-emerald-300">
                      {eli5Mode ? "What you should do next" : "Remediation Recommendations"}
                    </p>
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
                            {rec.priority === "high" ? (eli5Mode ? "⚠️ Urgent" : "high") : (eli5Mode ? "📋 Soon" : rec.priority)}
                          </span>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">{rec.description}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Simulator deep-link */}
                {biasSlices.length > 0 && (
                  <div className="border-t border-white/10 pt-4">
                    <Link
                      to={`/simulator?bias=${Math.round((biasSlices[0]?.originalDP ?? 0) * 100)}&attribute=${encodeURIComponent(biasSlices[0]?.attribute ?? "")}`}
                      className="flex items-center gap-2 border border-[#C9A961]/20 bg-[#C9A961]/10 px-4 py-3 text-sm text-[#C9A961] hover:bg-[#C9A961]/20 transition w-fit"
                    >
                      <Activity className="h-4 w-4" />
                      {eli5Mode ? "See the real human impact of this bias →" : "Simulate live impact in Bias Simulator →"}
                    </Link>
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
  tooltip,
}: {
  label: string | React.ReactNode;
  value: string;
  accent?: "white" | "emerald" | "amber" | "red";
  icon?: React.ComponentType<{ className?: string }>;
  tooltip?: string;
}) {
  const accentMap = {
    white: "text-white",
    emerald: "text-emerald-400",
    amber: "text-amber-400",
    red: "text-red-400",
  };
  return (
    <div className="score-target-card p-4">
      <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground flex items-center gap-1">
        {label}
        {tooltip && <TermBadge term={tooltip} />}
      </p>
      <div className="mt-2 flex items-center gap-2">
        {Icon && <Icon className={`h-5 w-5 ${accentMap[accent]}`} />}
        <p className={`text-2xl font-semibold ${accentMap[accent]}`}>{value}</p>
      </div>
    </div>
  );
}

function MetricLine({ label, value, accent }: { label: React.ReactNode; value: string; accent?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
      <p className={`mt-1 text-sm font-medium ${accent ? "text-emerald-400" : "text-white"}`}>{value}</p>
    </div>
  );
}
