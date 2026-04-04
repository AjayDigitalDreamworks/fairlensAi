"use client";

import Layout from "@/components/Layout";
import { loadLatestAnalysis } from "@/lib/analysis-store";
import { AnalysisPayload } from "@/types/analysis";
import { BarChart3, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

export default function MetricsPage() {
  const [analysis, setAnalysis] = useState<AnalysisPayload | null>(null);

  useEffect(() => setAnalysis(loadLatestAnalysis()), []);

  return (
    <Layout>
      <div className="space-y-8 pb-12">
        <section className="command-panel p-8">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[10px] font-mono uppercase tracking-[0.3em] text-emerald-300">
              <BarChart3 className="h-3.5 w-3.5" />
              Group Metrics
            </div>
            <h1 className="text-3xl font-bold text-white">Fairness Metrics Engine</h1>
            <p className="max-w-3xl text-sm leading-7 text-muted-foreground">
              Har sensitive slice ke liye selection rate, TPR, FPR, FNR, accuracy aur fairness score yahan structured mission-board style mein dikh raha hai.
            </p>
          </div>
        </section>

        {!analysis ? (
          <div className="command-panel p-8 text-muted-foreground">No analysis available.</div>
        ) : (
          <div className="space-y-6">
            {analysis.result.sensitive_findings.map((finding) => (
              <section key={finding.sensitive_column} className="command-panel space-y-5 p-8">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="inline-flex items-center gap-2 border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[10px] font-mono uppercase tracking-[0.3em] text-emerald-300">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      {finding.sensitive_column}
                    </div>
                    <h2 className="mt-3 text-2xl font-semibold text-white">{finding.sensitive_column}</h2>
                  </div>
                  <div className="grid min-w-[260px] grid-cols-2 gap-3">
                    <MiniStat label="Fairness" value={`${finding.fairness_score}%`} />
                    <MiniStat label="Risk" value={finding.risk_level} />
                    <MiniStat label="DI" value={String(finding.disparate_impact)} />
                    <MiniStat label="Acc spread" value={String(finding.accuracy_spread)} />
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-muted-foreground">
                        <th className="py-3 pr-3">Group</th>
                        <th className="py-3 pr-3">Count</th>
                        <th className="py-3 pr-3">Selection</th>
                        <th className="py-3 pr-3">TPR</th>
                        <th className="py-3 pr-3">FPR</th>
                        <th className="py-3 pr-3">FNR</th>
                        <th className="py-3 pr-3">Accuracy</th>
                      </tr>
                    </thead>
                    <tbody>
                      {finding.group_metrics.map((group) => (
                        <tr key={group.group} className="border-b border-white/5 text-white">
                          <td className="py-3 pr-3">{group.group}</td>
                          <td className="py-3 pr-3">{group.count}</td>
                          <td className="py-3 pr-3">{(group.selection_rate * 100).toFixed(1)}%</td>
                          <td className="py-3 pr-3">{group.true_positive_rate !== undefined ? `${(group.true_positive_rate * 100).toFixed(1)}%` : "-"}</td>
                          <td className="py-3 pr-3">{group.false_positive_rate !== undefined ? `${(group.false_positive_rate * 100).toFixed(1)}%` : "-"}</td>
                          <td className="py-3 pr-3">{group.false_negative_rate !== undefined ? `${(group.false_negative_rate * 100).toFixed(1)}%` : "-"}</td>
                          <td className="py-3 pr-3">{group.accuracy !== undefined ? `${(group.accuracy * 100).toFixed(1)}%` : "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  {finding.notes.map((note) => (
                    <div key={note} className="terminal-card p-4 text-sm text-muted-foreground">
                      {note}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </Layout>
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
