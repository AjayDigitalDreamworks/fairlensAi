"use client";

import Layout from "@/components/Layout";
import { Zap, Wrench, ArrowRight, Loader2, Info, CheckCircle2, TrendingUp, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useMemo } from "react";
import { apiFetch } from "@/lib/auth";
import BiasBeforeAfter, { BiasProgressBars, BiasSlice } from "@/components/BiasBeforeAfter";
import { ELI5Tooltip, ELI5ModeToggle, TermBadge } from "@/components/ELI5Tooltip";

const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:4000/api/v1").replace(/\/$/, "");

const algorithms = [
  {
    id: "ThresholdOptimizer",
    title: "Threshold Optimization",
    termKey: "Threshold Optimization",
    eli5: "Sets different pass/fail cutoffs per group so approval rates become equal.",
    desc: "Finds an optimal classification threshold for each sensitive group to satisfy equalized odds or demographic parity post-training.",
  },
  {
    id: "ExponentiatedGradient",
    title: "Exponentiated Gradient (In-Processing)",
    termKey: "Threshold Optimization",
    eli5: "Retrains the AI with a fairness rule it must follow during learning.",
    desc: "Retrains the model dynamically as a sequence of cost-sensitive classifiers to enforce fairness mathematical constraints.",
  },
  {
    id: "AdversarialDebiasing",
    title: "Adversarial Debiasing (AIF360)",
    termKey: "Adversarial Debiasing",
    eli5: "Trains a second AI to make the main AI blind to protected attributes.",
    desc: "Trains a predictor and an adversary network simultaneously to actively penalize the classifier when the adversary detects protected attributes.",
  },
  {
    id: "EqOddsPostprocessing",
    title: "Calibrated Equalized Odds (AIF360)",
    termKey: "Equalized Odds",
    eli5: "Adjusts the AI's yes/no probabilities so all groups get similar error rates.",
    desc: "Optimizes over calibrated classifier score distributions to strictly adjust probabilities and enforce equal opportunity across groups.",
  },
];

export default function ModelMitigationPage() {
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [historyItems, setHistoryItems] = useState<any[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string>("");
  const [historyItem, setHistoryItem] = useState<any>(null);
  const [selectedMethod, setSelectedMethod] = useState<string>("");
  const [mitigating, setMitigating] = useState(false);
  const [mitigationResult, setMitigationResult] = useState<any>(null);
  const [eli5Mode, setEli5Mode] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchHistory() {
      try {
        const res = await apiFetch(`${API_URL}/fairsight/history`);
        if (!res.ok) throw new Error("Failed to fetch");
        const data = await res.json();
        if (data.items && data.items.length > 0) {
          setHistoryItems(data.items);
          const latest = data.items[0];
          setHistoryItem(latest);
          setSelectedItemId(latest._id || "0");

          // Auto-select recommended
          const rec = latest.detectReport?.recommended_mitigation?.method;
          if (rec) setSelectedMethod(rec);
          else setSelectedMethod("ThresholdOptimizer");

          if (latest.mitigationResult) {
            setMitigationResult(latest.mitigationResult);
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingHistory(false);
      }
    }
    fetchHistory();
  }, []);

  // When user picks a different history item
  function selectItem(id: string) {
    setSelectedItemId(id);
    const found = historyItems.find((h) => (h._id || String(historyItems.indexOf(h))) === id);
    if (found) {
      setHistoryItem(found);
      setMitigationResult(found.mitigationResult || null);
      const rec = found.detectReport?.recommended_mitigation?.method;
      setSelectedMethod(rec || "ThresholdOptimizer");
    }
  }

  const handleMitigate = async () => {
    if (!historyItem || !selectedMethod) return;
    setMitigating(true);
    setError("");
    try {
      const res = await apiFetch(`${API_URL}/fairsight/mitigate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: historyItem.sessionId,
          method: selectedMethod,
          label_col: historyItem.labelCol,
          sensitive_col: historyItem.sensitiveCol,
        }),
      });

      if (!res.ok) throw new Error("Mitigation failed.");
      const data = await res.json();
      setMitigationResult(data.summary || data);
    } catch (err: any) {
      setError(err.message || "Mitigation failed. Please try again.");
    } finally {
      setMitigating(false);
    }
  };

  const recommendation = historyItem?.detectReport?.recommended_mitigation;
  const report = historyItem?.detectReport;

  // Build BiasSlice for before/after chart
  const biasSlices = useMemo<BiasSlice[]>(() => {
    if (!report || !historyItem) return [];

    const sensitiveAttr = historyItem.sensitiveCol || "sensitive_attribute";
    const dpd = report.dpd ?? 0;
    const dpdAfter = mitigationResult?.dpd_after ?? dpd;

    // Use by_group data if available
    const groups: BiasSlice[] = (report.by_group || []).map((g: any) => ({
      attribute: String(g.group),
      originalScore: Math.round((1 - Math.abs(dpd)) * 100),
      correctedScore: mitigationResult ? Math.round((1 - Math.abs(dpdAfter)) * 100) : null,
      originalDI: 1 - Math.abs(dpd),
      correctedDI: mitigationResult ? (1 - Math.abs(dpdAfter)) : null,
      originalDP: dpd,
      correctedDP: mitigationResult ? dpdAfter : null,
      riskLevel: report.severity?.dpd_severity?.level === "low" ? "low" : report.severity?.dpd_severity?.level === "moderate" ? "medium" : "high",
    }));

    // If no by_group, synthesize from overall metrics
    if (!groups.length) {
      return [
        {
          attribute: sensitiveAttr,
          originalScore: Math.round((1 - Math.abs(dpd)) * 100),
          correctedScore: mitigationResult ? Math.round((1 - Math.abs(dpdAfter)) * 100) : null,
          originalDI: 1 - Math.abs(dpd),
          correctedDI: mitigationResult ? (1 - Math.abs(dpdAfter)) : null,
          originalDP: dpd,
          correctedDP: mitigationResult ? dpdAfter : null,
          riskLevel: dpd > 0.2 ? "high" : dpd > 0.1 ? "medium" : "low",
        },
      ];
    }
    return groups;
  }, [report, historyItem, mitigationResult]);

  return (
    <Layout>
      <div className="space-y-8 pb-10">
        {/* Header */}
        <div className="card-glow group relative overflow-hidden p-8">
          <div className="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-primary via-secondary to-primary shadow-[0_0_15px_rgba(var(--theme-glow),0.3)]" />
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="mb-2 font-sans text-3xl font-bold tracking-tight text-white flex items-center gap-3">
                <Zap className="h-8 w-8 text-primary" />
                <ELI5Tooltip term="Mitigation">
                  {eli5Mode ? "Fix My AI's Bias" : "Live Mitigation Toolkit"}
                </ELI5Tooltip>
              </h1>
              <p className="text-sm text-muted-foreground max-w-2xl">
                {eli5Mode
                  ? "Your AI has been found to be unfair. This toolkit lets you choose a repair method and see how much fairer the AI becomes — before you go live."
                  : "Apply real post-processing algorithms and threshold optimization to enforce fairness constraints on your active model."}
              </p>
            </div>
            <div className="flex flex-col items-end gap-3">
              <ELI5ModeToggle enabled={eli5Mode} onToggle={() => setEli5Mode((v) => !v)} />
              <div className={`inline-flex items-center gap-2 border border-white/10 bg-black/40 px-4 py-3 text-xs uppercase tracking-[0.25em] ${loadingHistory ? "text-muted-foreground" : "text-primary"}`}>
                {loadingHistory ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
                {loadingHistory ? "Syncing..." : `Active Target: ${historyItem?.modelName || "None"}`}
              </div>
            </div>
          </div>
        </div>

        {loadingHistory ? (
          <div className="flex justify-center items-center h-64">
            <Loader2 className="h-8 w-8 text-primary animate-spin" />
          </div>
        ) : !historyItem ? (
          <div className="card-glow p-12 text-center text-muted-foreground">
            <Info className="h-12 w-12 mx-auto mb-4 text-primary/50" />
            <p>{eli5Mode ? "No model has been checked for bias yet." : "No model audit found."}</p>
            <p className="text-xs mt-2">
              {eli5Mode
                ? "Go to the Model Analyzer page and upload your model file first."
                : "Run an analysis in the Model Analyzer first to unlock mitigation."}
            </p>
          </div>
        ) : (
          <>
            {/* History Selector */}
            {historyItems.length > 1 && (
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                  {eli5Mode ? "Select which model to fix:" : "Select audit run:"}
                </span>
                <select
                  value={selectedItemId}
                  onChange={(e) => selectItem(e.target.value)}
                  className="border border-white/10 bg-black/30 px-4 py-2 text-sm text-white min-w-[260px]"
                >
                  {historyItems.map((item, idx) => (
                    <option key={item._id || idx} value={item._id || String(idx)}>
                      {item.modelName || `Audit ${idx + 1}`} — {new Date(item.createdAt || Date.now()).toLocaleString()}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* ── Before / After Bias Visualization ── */}
            {biasSlices.length > 0 && (
              <section className="card-glow p-8">
                <div className="mb-4 flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-white">
                    {eli5Mode ? "How fair is this model before and after the fix?" : "Bias Before vs After Mitigation"}
                    <TermBadge term="Disparate Impact" />
                  </h2>
                </div>
                {eli5Mode && (
                  <p className="mb-4 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-2 text-sm text-amber-300/80">
                    📖 <strong>ELI5:</strong> The faded bars show how unfair the model was. The bright bars show how fair it becomes after the fix. Green = fair, Red = still needs work.
                  </p>
                )}
                <BiasBeforeAfter
                  slices={biasSlices}
                  title={eli5Mode ? "Model Fairness: Before vs After Repair" : "Fairness Scores Before vs After Mitigation"}
                  subtitle={
                    mitigationResult
                      ? eli5Mode
                        ? "Showing actual improvement after the repair algorithm was applied."
                        : `Method applied: ${mitigationResult.method || selectedMethod}`
                      : eli5Mode
                      ? "After fix values will appear once you apply a repair strategy below."
                      : "Run mitigation below to see corrected scores."
                  }
                  showDI={!eli5Mode}
                  showDP={!eli5Mode}
                />
              </section>
            )}

            {/* Mitigation summary if done */}
            {mitigationResult && (
              <div className="grid gap-4 sm:grid-cols-3">
                <MitigStat
                  label={eli5Mode ? "Bias reduced by" : "DPD Reduction"}
                  value={`-${mitigationResult.dpd_reduction_pct ?? "?"}%`}
                  positive
                  tooltip="DPD"
                />
                <MitigStat
                  label={eli5Mode ? "Opportunity gap fixed by" : "EOD Reduction"}
                  value={`-${mitigationResult.eod_reduction_pct ?? "?"}%`}
                  positive
                  tooltip="EOD"
                />
                <MitigStat
                  label={eli5Mode ? "AI accuracy" : "Accuracy After"}
                  value={`${mitigationResult.accuracy_after !== undefined ? (mitigationResult.accuracy_after * 100).toFixed(1) : "?"}%`}
                  tooltip="Accuracy"
                />
              </div>
            )}

            {/* Main grid */}
            <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr] animate-in fade-in slide-in-from-bottom-4">
              <div className="card-glow rounded-xl p-8">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-white mb-6">
                  {eli5Mode ? "Choose a Repair Method" : "Available Fairness Algorithms"}
                </h3>

                {recommendation && (
                  <div className="mb-6 p-4 border border-primary/30 bg-primary/5 rounded-lg flex gap-3">
                    <Info className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-semibold text-primary uppercase tracking-wider mb-1">
                        {eli5Mode ? "🤖 AI Suggested Repair" : "AI Recommendation"}
                      </h4>
                      <p className="text-sm text-muted-foreground">{recommendation.reason}</p>
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  {algorithms.map((algo) => {
                    const isRec = recommendation?.method === algo.id;
                    const isActive = selectedMethod === algo.id;
                    return (
                      <div
                        key={algo.id}
                        onClick={() => setSelectedMethod(algo.id)}
                        className={`p-5 rounded-lg border transition-all cursor-pointer hover:border-primary/50 ${isActive ? "border-primary/80 bg-primary/10 shadow-[0_0_15px_rgba(var(--theme-glow),0.1)]" : "border-white/10 bg-black/20"}`}
                      >
                        <div className="flex items-center justify-between gap-4 mb-2">
                          <div className="flex items-center gap-2">
                            <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${isActive ? "border-primary" : "border-white/20"}`}>
                              {isActive && <div className="w-2 h-2 rounded-full bg-primary" />}
                            </div>
                            <h4 className={`font-semibold ${isActive ? "text-white" : "text-white/80"}`}>
                              <ELI5Tooltip term={algo.termKey}>{algo.title}</ELI5Tooltip>
                            </h4>
                          </div>
                          {isRec && (
                            <span className="text-[10px] uppercase tracking-[0.2em] text-primary font-mono border border-primary/20 px-2 py-1 rounded bg-primary/5">
                              {eli5Mode ? "✨ Best choice" : "Recommended"}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed pl-6">
                          {eli5Mode ? algo.eli5 : algo.desc}
                        </p>
                      </div>
                    );
                  })}
                </div>

                {error && (
                  <p className="mt-4 text-sm text-red-300 border border-red-500/20 bg-red-500/5 p-3 rounded-lg">
                    ⚠️ {error}
                  </p>
                )}
              </div>

              {/* Action panel */}
              <div className="card-glow rounded-xl p-8 flex flex-col justify-center relative overflow-hidden">
                {mitigationResult && !mitigating ? (
                  <div className="w-full relative animate-in zoom-in-95 space-y-6">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="h-6 w-6 text-primary" />
                      <h3 className="text-xl font-bold text-white">
                        {eli5Mode ? "Bias Repair Applied!" : "Mitigation Complete"}
                      </h3>
                    </div>

                    {/* Compact progress bars */}
                    {biasSlices.length > 0 && (
                      <BiasProgressBars
                        slices={biasSlices}
                        title={eli5Mode ? "Fairness improvement per group" : "Before → After Fairness"}
                      />
                    )}

                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="terminal-card p-3">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
                          {eli5Mode ? "Accuracy before" : "Orig. Accuracy"}
                        </p>
                        <p className="mt-1 font-bold text-white">
                          {mitigationResult.accuracy_before !== undefined
                            ? `${(mitigationResult.accuracy_before * 100).toFixed(1)}%`
                            : "—"}
                        </p>
                      </div>
                      <div className="terminal-card p-3">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
                          {eli5Mode ? "Accuracy after" : "Wrapped Accuracy"}
                        </p>
                        <p className="mt-1 font-bold text-primary">
                          {mitigationResult.accuracy_after !== undefined
                            ? `${(mitigationResult.accuracy_after * 100).toFixed(1)}%`
                            : "—"}
                          {mitigationResult.summary?.accuracy_impact && (
                            <span className="ml-2 text-[10px] text-muted-foreground">
                              ({mitigationResult.summary.accuracy_impact})
                            </span>
                          )}
                        </p>
                      </div>
                    </div>

                    <Button
                      disabled={mitigating}
                      onClick={handleMitigate}
                      className="w-full bg-white/5 hover:bg-white/10 text-white border border-white/10"
                      variant="outline"
                    >
                      {eli5Mode ? "Try a Different Repair Method" : "Re-Run Mitigation"}
                    </Button>
                  </div>
                ) : (
                  <div className="text-center space-y-4">
                    <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mb-4 transition-all">
                      {mitigating ? <Loader2 className="h-8 w-8 text-primary animate-spin" /> : <Zap className="h-8 w-8 text-primary" />}
                    </div>
                    <h3 className="text-xl font-bold text-white">
                      {mitigating
                        ? eli5Mode ? "Repairing the AI..." : "Applying Corrections..."
                        : eli5Mode ? "Ready to Fix Bias" : "Apply Corrections"}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {mitigating
                        ? eli5Mode
                          ? "The fairness repair is running. This usually takes a few seconds."
                          : "This may take a few seconds as the model's decision boundaries are dynamically recomputed."
                        : eli5Mode
                        ? "Select a repair method from the left, then click the button below to apply it instantly."
                        : "Select an algorithm to wrap your model's prediction layer with fairness constraints."}
                    </p>
                    <Button
                      onClick={handleMitigate}
                      disabled={mitigating || !selectedMethod}
                      className="w-full mt-4 bg-primary text-black hover:bg-primary/90 transition-all font-semibold uppercase tracking-wider text-xs h-12"
                    >
                      {mitigating ? "Simulating..." : eli5Mode ? "Apply Bias Repair Now" : "Execute Mitigation Wrapper"}
                      {!mitigating && <ArrowRight className="w-4 h-4 ml-2" />}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

function MitigStat({ label, value, positive, tooltip }: { label: string; value: string; positive?: boolean; tooltip?: string }) {
  return (
    <div className="card-glow p-5 flex flex-col gap-2">
      <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground flex items-center gap-1">
        {label}
        {tooltip && <TermBadge term={tooltip} />}
      </p>
      <div className="flex items-center gap-2">
        {positive ? <TrendingDown className="h-4 w-4 text-emerald-400" /> : <TrendingUp className="h-4 w-4 text-white" />}
        <p className={`text-2xl font-bold ${positive ? "text-emerald-400" : "text-white"}`}>{value}</p>
      </div>
    </div>
  );
}
