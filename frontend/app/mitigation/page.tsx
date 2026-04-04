"use client";

import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { createMitigationPreview } from "@/lib/api";
import { loadLatestAnalysis, saveAnalysis } from "@/lib/analysis-store";
import { AnalysisPayload } from "@/types/analysis";
import { Cpu, Orbit, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

const strategies = [
  { id: "reweighing", title: "Dynamic reweighing", note: "Fastest structural rebalance preview." },
  { id: "threshold_optimization", title: "Threshold optimization", note: "Tune decision cutoffs by group behavior." },
  { id: "resampling", title: "Resampling protocol", note: "Improve representation through sampling shifts." },
  { id: "adversarial_debiasing", title: "Adversarial debiasing", note: "Aggressive fairness-oriented modeling preview." },
];

export default function MitigationPage() {
  const [analysis, setAnalysis] = useState<AnalysisPayload | null>(null);
  const [strategy, setStrategy] = useState("reweighing");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => setAnalysis(loadLatestAnalysis()), []);

  const correctedScore =
    analysis?.result.artifacts?.corrected_fairness_summary?.overall_fairness_score ??
    analysis?.result.fairness_summary.corrected_fairness_score;

  const runPreview = async () => {
    if (!analysis) return;
    setLoading(true);
    setError("");
    try {
      const updated = await createMitigationPreview(analysis.id, strategy);
      setAnalysis(updated);
      saveAnalysis(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mitigation preview failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="space-y-8 pb-12">
        <section className="command-panel p-8">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[10px] font-mono uppercase tracking-[0.3em] text-emerald-300">
              <Orbit className="h-3.5 w-3.5" />
              Mitigation Lab
            </div>
            <h1 className="text-3xl font-bold text-white">Bias Mitigation Toolkit</h1>
            <p className="max-w-3xl text-sm leading-7 text-muted-foreground">
              Corrected fairness score aur strategy preview ko yahan clean lab-style dashboard mein dikhaya gaya hai.
              95+ target ko track kiya ja sakta hai, but preview real dataset behavior ke basis par hi aayega.
            </p>
          </div>
        </section>

        {!analysis ? (
          <div className="command-panel p-8 text-muted-foreground">Run an analysis first.</div>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
            <section className="command-panel space-y-4 p-8">
              <div className="flex items-center gap-3">
                <Cpu className="h-5 w-5 text-emerald-400" />
                <h2 className="text-xl font-semibold text-white">Strategy bank</h2>
              </div>
              {strategies.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setStrategy(item.id)}
                  className={`w-full border p-4 text-left transition ${
                    strategy === item.id
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                      : "border-white/10 bg-black/20 text-white hover:bg-white/5"
                  }`}
                >
                  <p className="font-medium">{item.title}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{item.note}</p>
                </button>
              ))}
              <Button onClick={runPreview} disabled={loading} className="w-full bg-emerald-500 text-black hover:bg-emerald-400">
                {loading ? "Running preview..." : "Generate mitigation preview"}
              </Button>
              {error && <p className="text-sm text-red-300">{error}</p>}
            </section>

            <section className="command-panel space-y-6 p-8">
              <div className="grid gap-4 md:grid-cols-3">
                <Metric label="Original fairness" value={`${analysis.result.fairness_summary.overall_fairness_score}%`} />
                <Metric label="Corrected dataset" value={typeof correctedScore === "number" ? `${correctedScore}%` : "--"} />
                <Metric
                  label="95+ target gap"
                  value={typeof correctedScore === "number" ? `${Math.max(0, 95 - correctedScore).toFixed(2)}` : "--"}
                />
              </div>

              {!analysis.mitigationPreview ? (
                <div className="terminal-card p-5 text-muted-foreground">No mitigation preview yet.</div>
              ) : (
                <>
                  <div className="grid gap-4 md:grid-cols-3">
                    <Metric label="Current fairness" value={`${analysis.mitigationPreview.current_score}%`} />
                    <Metric label="Projected fairness" value={`${analysis.mitigationPreview.projected_score}%`} />
                    <Metric label="Improvement" value={`+${analysis.mitigationPreview.projected_improvement}%`} />
                  </div>

                  <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
                    <div className="terminal-card p-5">
                      <div className="mb-4 flex items-center gap-3">
                        <Sparkles className="h-4 w-4 text-emerald-400" />
                        <h3 className="font-semibold text-white">Execution steps</h3>
                      </div>
                      <div className="space-y-3">
                        {analysis.mitigationPreview.execution_steps.map((step) => (
                          <p key={step} className="text-sm text-muted-foreground">- {step}</p>
                        ))}
                      </div>
                    </div>

                    <div className="terminal-card p-5">
                      <div className="mb-4 flex items-center gap-3">
                        <ShieldCheck className="h-4 w-4 text-emerald-400" />
                        <h3 className="font-semibold text-white">Operational notes</h3>
                      </div>
                      <div className="space-y-3">
                        {analysis.mitigationPreview.operational_notes.map((note) => (
                          <p key={note} className="text-sm text-muted-foreground">- {note}</p>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-xl font-semibold text-white">Group projection</h3>
                    <div className="grid gap-4 md:grid-cols-2">
                      {analysis.mitigationPreview.group_projection.map((group) => (
                        <div key={group.sensitive_column} className="terminal-card p-5">
                          <p className="text-lg font-semibold text-white">{group.sensitive_column}</p>
                          <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-muted-foreground">
                            <p>Current {group.fairness_score}%</p>
                            <p>Projected {group.projected_fairness_score}%</p>
                            <p>DI {group.disparate_impact}</p>
                            <p>Projected DI {group.projected_disparate_impact}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </section>
          </div>
        )}
      </div>
    </Layout>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="score-target-card p-4">
      <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}
