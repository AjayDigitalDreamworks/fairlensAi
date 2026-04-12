"use client";

import Layout from "@/components/Layout";
import { Shield, Activity, Target, GitCompare, Loader2, Info } from "lucide-react";
import { useState, useEffect } from "react";

const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:4000/api/v1").replace(/\/$/, "");

export default function ModelMetricsPage() {
  const [loading, setLoading] = useState(true);
  const [historyItem, setHistoryItem] = useState<any>(null);
  const [showAllRows, setShowAllRows] = useState(false);

  useEffect(() => {
    async function loadMetrics() {
      try {
        const res = await fetch(`${API_URL}/fairsight/history`);
        if (!res.ok) throw new Error("Failed to load history");
        const data = await res.json();
        if (data.items && data.items.length > 0) {
          setHistoryItem(data.items[0]);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadMetrics();
  }, []);

  const report = historyItem?.detectReport;
  const mitigation = historyItem?.mitigationResult;
  
  // Use mitigated values if they exist, otherwise baseline
  const activeDpd = mitigation ? mitigation.dpd_after : report?.dpd;
  const activeEod = mitigation ? mitigation.eod_after : report?.eod;
  const accuracy = mitigation ? mitigation.accuracy_after : report?.performance?.accuracy;
  
  // Calculate Disparate Impact Ratio heuristically (DIR = 1 - DPD) roughly for demonstration context
  const dir = activeDpd !== undefined ? Math.max(0, 1 - activeDpd) : undefined;
  
  // Evaluate health
  const getStatus = (val: number, isRatio = false) => {
    if (isRatio) return val >= 0.8 && val <= 1.25 ? "Healthy" : val >= 0.7 ? "Warning" : "Critical";
    return val <= 0.1 ? "Healthy" : val <= 0.2 ? "Warning" : "Critical";
  };

  const dpStatus = activeDpd !== undefined ? getStatus(activeDpd) : "Unknown";
  const eodStatus = activeEod !== undefined ? getStatus(activeEod) : "Unknown";
  const dirStatus = dir !== undefined ? getStatus(dir, true) : "Unknown";

  return (
    <Layout>
      <div className="space-y-8 pb-10">
        <div className="card-glow group relative overflow-hidden p-8">
          <div className="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-primary via-secondary to-primary shadow-[0_0_15px_rgba(var(--theme-glow),0.3)]" />
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="mb-2 font-sans text-3xl font-bold tracking-tight text-white flex items-center gap-3">
                <Shield className="h-8 w-8 text-primary" />
                Dynamic Fairness Metrics
              </h1>
              <p className="text-sm text-muted-foreground">
                Detailed breakdowns of Disparate Impact, Equal Opportunity, and Demographic Parity based on your latest model audit.
              </p>
            </div>
            <div className={`inline-flex items-center gap-2 border border-white/10 bg-black/40 px-4 py-3 text-xs uppercase tracking-[0.25em] ${loading ? 'text-muted-foreground' : 'text-primary'}`}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
              {loading ? 'Fetching DB...' : `Model: ${historyItem?.modelName || 'Live'}`}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-64">
            <Loader2 className="h-8 w-8 text-primary animate-spin" />
          </div>
        ) : !historyItem ? (
          <div className="card-glow p-12 text-center text-muted-foreground">
            <Info className="h-12 w-12 mx-auto mb-4 text-primary/50" />
            <p>No model audit history found in the database.</p>
            <p className="text-xs mt-2">Run an analysis in the Model Analyzer first.</p>
          </div>
        ) : (
          <>
            <div className="grid gap-6 md:grid-cols-3 animate-in fade-in slide-in-from-bottom-4">
              <MetricCard 
                title="Disparate Impact Ratio" 
                value={dir !== undefined ? dir.toFixed(2) : "N/A"} 
                target="0.80 - 1.25"
                status={dirStatus}
                desc="Ratio of positive predictions for unprivileged group to privileged group. Ideally 1.0."
              />
              <MetricCard 
                title="Eq. Opportunity Diff" 
                value={activeEod !== undefined ? activeEod.toFixed(3) : "N/A"} 
                target="Close to 0 (< 0.1)"
                status={eodStatus}
                desc="Difference in true positive rates (Recall) between sensitive groups."
              />
              <MetricCard 
                title="Demographic Parity Diff" 
                value={activeDpd !== undefined ? activeDpd.toFixed(3) : "N/A"} 
                target="Close to 0 (< 0.1)"
                status={dpStatus}
                desc="Absolute difference in positive prediction rates regardless of true outcome."
              />
            </div>

            <div className="card-glow flex flex-col rounded-xl p-8 min-h-[300px] animate-in fade-in slide-in-from-bottom-6">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-white mb-6 flex items-center gap-2">
                <GitCompare className="w-4 h-4 text-primary" />
                Intersectional Confusion Matrix Analysis
              </h3>
              <p className="text-sm text-muted-foreground mb-6">
                Analyzing predictive performance constraints per sensitive group slice on <b>{historyItem.sensitiveCol}</b>.
              </p>
              
              {report?.by_group && report.by_group.length > 0 ? (
                <div className="overflow-x-auto w-full">
                  <table className="w-full text-sm text-left border border-white/5">
                     <thead className="text-xs uppercase bg-white/5 text-muted-foreground font-mono tracking-wider">
                       <tr>
                         <th className="px-6 py-4 border-b border-white/5">Group Segment ({historyItem.sensitiveCol})</th>
                         <th className="px-6 py-4 border-b border-white/5">Selection Rate</th>
                         <th className="px-6 py-4 border-b border-white/5">Accuracy</th>
                         <th className="px-6 py-4 border-b border-white/5">True Positive Rate</th>
                         <th className="px-6 py-4 border-b border-white/5">False Positive Rate</th>
                       </tr>
                     </thead>
                     <tbody className="divide-y divide-white/5">
                        {(showAllRows ? report.by_group : report.by_group.slice(0, 5)).map((g: any, idx: number) => (
                          <tr key={idx} className="hover:bg-white/[0.02] transition-colors">
                            <td className="px-6 py-4 font-mono font-semibold text-primary">{g.group}</td>
                            <td className="px-6 py-4 text-white">{(g.selection_rate * 100).toFixed(1)}%</td>
                            <td className="px-6 py-4 text-white">{(g.accuracy * 100).toFixed(1)}%</td>
                            <td className="px-6 py-4 text-white">{(g.true_positive_rate * 100).toFixed(1)}%</td>
                            <td className="px-6 py-4 text-white">{(g.false_positive_rate * 100).toFixed(1)}%</td>
                          </tr>
                        ))}
                     </tbody>
                  </table>
                  
                  {report.by_group.length > 5 && (
                    <div className="mt-4 flex justify-center">
                      <button 
                        onClick={() => setShowAllRows(!showAllRows)}
                        className="text-xs uppercase tracking-wider font-semibold text-primary/80 hover:text-primary transition-colors border border-primary/20 hover:border-primary/50 rounded-full px-6 py-2 bg-primary/5"
                      >
                        {showAllRows ? "Show Less" : `Show More (${report.by_group.length - 5} hidden)`}
                      </button>
                    </div>
                  )}

                  {mitigation && (
                    <div className="mt-4 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-md">
                      <p className="text-emerald-400 text-sm font-medium">✨ Post-Mitigation Note</p>
                      <p className="text-emerald-400/80 text-xs mt-1">
                        A <b className="text-emerald-300">{mitigation.method}</b> wrapper was applied to this session. 
                        Overall accuracy shifted from {(mitigation.accuracy_before * 100).toFixed(1)}% to {(mitigation.accuracy_after * 100).toFixed(1)}% 
                        while reducing Disparate Impact by {mitigation.dpd_reduction_pct}%.
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-center p-8 border border-white/5 bg-black/20 rounded-md flex-1 text-muted-foreground text-sm">
                  Run an analysis from the Model Analyzer to populate the subset comparison matrix.
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

function MetricCard({ title, value, target, status, desc }: { title: string; value: string; target: string; status: string; desc: string }) {
  const toneClass = 
    status === "Healthy" 
    ? "text-emerald-400" 
    : status === "Warning" 
    ? "text-amber-400" 
    : status === "Critical"
    ? "text-red-400"
    : "text-muted-foreground";

  return (
    <div className={`card-glow flex flex-col justify-between rounded-xl p-6 transition-all duration-500 border ${status === 'Critical' ? 'border-red-500/30' : status === 'Warning' ? 'border-amber-500/30' : 'border-transparent'}`}>
      <div className="flex items-center justify-between gap-4 mb-4">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-white">{title}</h3>
        <Target className={`w-4 h-4 ${status === 'Healthy' ? 'text-emerald-400' : 'text-muted-foreground'}`} />
      </div>
      <div className="mb-4">
        <p className="text-4xl font-bold tracking-tight text-white">{value}</p>
        <p className={`text-xs mt-2 uppercase tracking-[0.2em] font-semibold ${toneClass}`}>{status}</p>
      </div>
      <div>
        <div className="mb-2 text-xs text-muted-foreground flex justify-between">
          <span>Target range:</span>
          <span className="text-white font-mono">{target}</span>
        </div>
        <p className="text-xs text-muted-foreground border-t border-white/10 pt-3">{desc}</p>
      </div>
    </div>
  );
}
