"use client";

import Layout from "@/components/Layout";
import { Shield, Activity, Target, GitCompare, Loader2, Info } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { apiFetch } from "@/lib/auth";
import BiasBeforeAfter, { BiasSlice } from "@/components/BiasBeforeAfter";
import { ELI5Tooltip, ELI5ModeToggle, TermBadge } from "@/components/ELI5Tooltip";

const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:4000/api/v1").replace(/\/$/, "");

export default function ModelMetricsPage() {
  const [loading, setLoading] = useState(true);
  const [historyItems, setHistoryItems] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [historyItem, setHistoryItem] = useState<any>(null);
  const [showAllRows, setShowAllRows] = useState(false);
  const [eli5Mode, setEli5Mode] = useState(false);

  useEffect(() => {
    async function loadMetrics() {
      try {
        const res = await apiFetch(`${API_URL}/fairsight/history`);
        if (!res.ok) throw new Error("Failed to load history");
        const data = await res.json();
        if (data.items && data.items.length > 0) {
          setHistoryItems(data.items);
          setHistoryItem(data.items[0]);
          setSelectedId(data.items[0]._id || "0");
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadMetrics();
  }, []);

  function selectItem(id: string) {
    setSelectedId(id);
    const found = historyItems.find((h, idx) => (h._id || String(idx)) === id);
    if (found) setHistoryItem(found);
  }

  const report = historyItem?.detectReport;
  const mitigation = historyItem?.mitigationResult;

  // Use mitigated values if they exist, otherwise baseline
  const activeDpd = mitigation ? mitigation.dpd_after : report?.dpd;
  const activeEod = mitigation ? mitigation.eod_after : report?.eod;
  const accuracy = mitigation ? mitigation.accuracy_after : report?.performance?.accuracy;

  // Calculate Disparate Impact Ratio heuristically (DIR = 1 - DPD)
  const dir = activeDpd !== undefined ? Math.max(0, 1 - activeDpd) : undefined;

  // Evaluate health
  const getStatus = (val: number, isRatio = false) => {
    if (isRatio) return val >= 0.8 && val <= 1.25 ? "Healthy" : val >= 0.7 ? "Warning" : "Critical";
    return val <= 0.1 ? "Healthy" : val <= 0.2 ? "Warning" : "Critical";
  };

  const dpStatus = activeDpd !== undefined ? getStatus(activeDpd) : "Unknown";
  const eodStatus = activeEod !== undefined ? getStatus(activeEod) : "Unknown";
  const dirStatus = dir !== undefined ? getStatus(dir, true) : "Unknown";

  // Build bias slices for Before/After chart
  const biasSlices = useMemo<BiasSlice[]>(() => {
    if (!report || !historyItem) return [];

    const dpd = report.dpd ?? 0;
    const dpdAfter = mitigation?.dpd_after ?? null;

    // Individual group data
    const byGroup: BiasSlice[] = (report.by_group || []).map((g: any) => ({
      attribute: String(g.group),
      originalScore: Math.min(100, Math.round((1 - Math.abs(dpd)) * 100)),
      correctedScore: dpdAfter !== null ? Math.min(100, Math.round((1 - Math.abs(dpdAfter)) * 100)) : null,
      originalDI: g.selection_rate ?? (1 - Math.abs(dpd)),
      correctedDI: dpdAfter !== null ? (1 - Math.abs(dpdAfter)) : null,
      riskLevel: Math.abs(dpd) > 0.2 ? "high" : Math.abs(dpd) > 0.1 ? "medium" : "low",
    }));

    if (byGroup.length) return byGroup;

    // Fallback: single overall slice
    return [
      {
        attribute: historyItem.sensitiveCol || "sensitive_attribute",
        originalScore: Math.min(100, Math.round((1 - Math.abs(dpd)) * 100)),
        correctedScore: dpdAfter !== null ? Math.min(100, Math.round((1 - Math.abs(dpdAfter)) * 100)) : null,
        originalDI: 1 - Math.abs(dpd),
        correctedDI: dpdAfter !== null ? (1 - Math.abs(dpdAfter)) : null,
        originalDP: dpd,
        correctedDP: dpdAfter,
        riskLevel: Math.abs(dpd) > 0.2 ? "high" : Math.abs(dpd) > 0.1 ? "medium" : "low",
      },
    ];
  }, [report, historyItem, mitigation]);

  return (
    <Layout>
      <div className="space-y-8 pb-10">
        {/* Header */}
        <div className="card-glow group relative overflow-hidden p-8">
          <div className="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-primary via-secondary to-primary shadow-[0_0_15px_rgba(var(--theme-glow),0.3)]" />
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="mb-2 font-sans text-3xl font-bold tracking-tight text-white flex items-center gap-3">
                <Shield className="h-8 w-8 text-primary" />
                {eli5Mode ? "How Fair Is My AI?" : "Dynamic Fairness Metrics"}
              </h1>
              <p className="text-sm text-muted-foreground max-w-2xl">
                {eli5Mode
                  ? "These numbers tell you how fairly your AI is treating different groups of people. Green = fair, Red = needs fixing."
                  : "Detailed breakdowns of Disparate Impact, Equal Opportunity, and Demographic Parity based on your latest model audit."}
              </p>
            </div>
            <div className="flex flex-col items-end gap-3">
              <ELI5ModeToggle enabled={eli5Mode} onToggle={() => setEli5Mode((v) => !v)} />
              <div className={`inline-flex items-center gap-2 border border-white/10 bg-black/40 px-4 py-3 text-xs uppercase tracking-[0.25em] ${loading ? "text-muted-foreground" : "text-primary"}`}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
                {loading ? "Fetching DB..." : `Model: ${historyItem?.modelName || "Live"}`}
              </div>
            </div>
          </div>
        </div>

        {/* History Selector */}
        {!loading && historyItems.length > 1 && (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
              {eli5Mode ? "Select model to inspect:" : "Audit run:"}
            </span>
            <select
              value={selectedId}
              onChange={(e) => selectItem(e.target.value)}
              className="border border-white/10 bg-black/30 px-4 py-2 text-sm text-white min-w-[280px]"
            >
              {historyItems.map((item, idx) => (
                <option key={item._id || idx} value={item._id || String(idx)}>
                  {item.modelName || `Audit ${idx + 1}`} — {new Date(item.createdAt || Date.now()).toLocaleString()}
                </option>
              ))}
            </select>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center items-center h-64">
            <Loader2 className="h-8 w-8 text-primary animate-spin" />
          </div>
        ) : !historyItem ? (
          <div className="card-glow p-12 text-center text-muted-foreground">
            <Info className="h-12 w-12 mx-auto mb-4 text-primary/50" />
            <p>{eli5Mode ? "No AI fairness data found yet." : "No model audit history found in the database."}</p>
            <p className="text-xs mt-2">
              {eli5Mode ? "Go to Model Analyzer and upload your model first." : "Run an analysis in the Model Analyzer first."}
            </p>
          </div>
        ) : (
          <>
            {/* Key Metrics Cards */}
            <div className="grid gap-6 md:grid-cols-3 animate-in fade-in slide-in-from-bottom-4">
              <MetricCard
                title={eli5Mode ? "Equal Treatment Ratio" : "Disparate Impact Ratio"}
                termKey="Disparate Impact"
                value={dir !== undefined ? dir.toFixed(2) : "N/A"}
                target={eli5Mode ? "Ideally = 1.0 (0.80–1.25 is acceptable)" : "0.80 - 1.25"}
                status={dirStatus}
                desc={
                  eli5Mode
                    ? "Think of this as a fairness score from 0 to 1. Below 0.80 means one group gets approved 20%+ less than another — that's illegal discrimination."
                    : "Ratio of positive predictions for unprivileged group to privileged group. Ideally 1.0."
                }
                eli5Mode={eli5Mode}
              />
              <MetricCard
                title={eli5Mode ? "Missed Opportunity Gap" : "Eq. Opportunity Diff"}
                termKey="Equalized Odds"
                value={activeEod !== undefined ? activeEod.toFixed(3) : "N/A"}
                target={eli5Mode ? "Should be close to 0 (under 0.10 is good)" : "Close to 0 (< 0.1)"}
                status={eodStatus}
                desc={
                  eli5Mode
                    ? "This measures how many more qualified people from one group are being wrongly rejected vs. another group. 0 = completely equal treatment."
                    : "Difference in true positive rates (Recall) between sensitive groups."
                }
                eli5Mode={eli5Mode}
              />
              <MetricCard
                title={eli5Mode ? "Approval Rate Gap" : "Demographic Parity Diff"}
                termKey="Demographic Parity"
                value={activeDpd !== undefined ? activeDpd.toFixed(3) : "N/A"}
                target={eli5Mode ? "Should be close to 0 (under 0.10 is good)" : "Close to 0 (< 0.1)"}
                status={dpStatus}
                desc={
                  eli5Mode
                    ? "How big is the difference in how often each group gets a 'yes'? For example, if one group gets approved 60% and another 40%, the gap is 0.20."
                    : "Absolute difference in positive prediction rates regardless of true outcome."
                }
                eli5Mode={eli5Mode}
              />
            </div>

            {/* ── Before / After Bias Visualization ── */}
            {biasSlices.length > 0 && (
              <section className="card-glow p-8 animate-in fade-in slide-in-from-bottom-5">
                <div className="mb-4 flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-white">
                    {eli5Mode ? "Did fixing the AI actually help each group?" : "Fairness Before vs After Mitigation"}
                    <TermBadge term="Fairness Score" />
                  </h2>
                </div>

                {eli5Mode && (
                  <div className="mb-4 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-300/80">
                    📖 <strong>ELI5:</strong> The faded bar = how unfair the AI was. The bright bar = how fair it became after we applied the repair. Green bars above 80% = good!
                    {!mitigation && " Run the Mitigation Toolkit to see corrected values here."}
                  </div>
                )}

                <BiasBeforeAfter
                  slices={biasSlices}
                  title={eli5Mode ? "Fairness Per Group: Before vs After Fix" : "Disparate Impact by Group: Before vs After Mitigation"}
                  subtitle={
                    mitigation
                      ? eli5Mode
                        ? `Repair method used: ${mitigation.method || "fairness algorithm"}`
                        : `Mitigation applied: ${mitigation.method || selectedId}`
                      : eli5Mode
                      ? "Go to Mitigation Toolkit to apply a repair and see improvement here."
                      : "Run mitigation from the Mitigation Toolkit to populate corrected scores."
                  }
                  showDI={!eli5Mode}
                  showDP={false}
                  compact={false}
                />
              </section>
            )}

            {/* Intersectional Table */}
            <div className="card-glow flex flex-col rounded-xl p-8 min-h-[300px] animate-in fade-in slide-in-from-bottom-6">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-white mb-2 flex items-center gap-2">
                <GitCompare className="w-4 h-4 text-primary" />
                {eli5Mode ? "Detailed Results Per Group" : "Intersectional Confusion Matrix Analysis"}
              </h3>
              <p className="text-sm text-muted-foreground mb-6">
                {eli5Mode
                  ? `How does the AI perform for each value of "${historyItem.sensitiveCol}"? Green = performing fairly, Red = needs fixing.`
                  : `Analyzing predictive performance constraints per sensitive group slice on `}
                {!eli5Mode && <b>{historyItem.sensitiveCol}</b>}.
              </p>

              {report?.by_group && report.by_group.length > 0 ? (
                <div className="overflow-x-auto w-full">
                  <table className="w-full text-sm text-left border border-white/5">
                    <thead className="text-xs uppercase bg-white/5 text-muted-foreground font-mono tracking-wider">
                      <tr>
                        <th className="px-6 py-4 border-b border-white/5">
                          {eli5Mode ? "Group" : `Group (${historyItem.sensitiveCol})`}
                        </th>
                        <th className="px-6 py-4 border-b border-white/5">
                          <ELI5Tooltip term="Selection Rate">
                            {eli5Mode ? "Approval Rate" : "Selection Rate"}
                          </ELI5Tooltip>
                        </th>
                        <th className="px-6 py-4 border-b border-white/5">
                          <ELI5Tooltip term="Accuracy">Accuracy</ELI5Tooltip>
                        </th>
                        <th className="px-6 py-4 border-b border-white/5">
                          <ELI5Tooltip term="True Positive Rate">
                            {eli5Mode ? "Correctly Approved %" : "TPR (Recall)"}
                          </ELI5Tooltip>
                        </th>
                        <th className="px-6 py-4 border-b border-white/5">
                          <ELI5Tooltip term="False Positive Rate">
                            {eli5Mode ? "Wrongly Approved %" : "FPR"}
                          </ELI5Tooltip>
                        </th>
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
                        {showAllRows ? "Show Less" : `Show ${report.by_group.length - 5} more groups`}
                      </button>
                    </div>
                  )}

                  {mitigation && (
                    <div className="mt-4 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-md">
                      <p className="text-emerald-400 text-sm font-medium">
                        {eli5Mode ? "✨ Bias Repair Applied!" : "✨ Post-Mitigation Note"}
                      </p>
                      <p className="text-emerald-400/80 text-xs mt-1">
                        {eli5Mode
                          ? `A fairness repair (${mitigation.method}) was applied. The AI's bias was reduced by ${mitigation.dpd_reduction_pct}%.`
                          : `A ${mitigation.method} wrapper was applied. Accuracy shifted from ${(mitigation.accuracy_before * 100).toFixed(1)}% to ${(mitigation.accuracy_after * 100).toFixed(1)}% while reducing Disparate Impact by ${mitigation.dpd_reduction_pct}%.`}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-center p-8 border border-white/5 bg-black/20 rounded-md flex-1 text-muted-foreground text-sm">
                  {eli5Mode
                    ? "Upload your model in the Model Analyzer to see per-group fairness results here."
                    : "Run an analysis from the Model Analyzer to populate the subset comparison matrix."}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

function MetricCard({
  title,
  termKey,
  value,
  target,
  status,
  desc,
  eli5Mode,
}: {
  title: string;
  termKey: string;
  value: string;
  target: string;
  status: string;
  desc: string;
  eli5Mode: boolean;
}) {
  const toneClass =
    status === "Healthy"
      ? "text-emerald-400"
      : status === "Warning"
      ? "text-amber-400"
      : status === "Critical"
      ? "text-red-400"
      : "text-muted-foreground";

  const borderClass =
    status === "Critical"
      ? "border-red-500/30"
      : status === "Warning"
      ? "border-amber-500/30"
      : "border-transparent";

  return (
    <div className={`card-glow flex flex-col justify-between rounded-xl p-6 transition-all duration-500 border ${borderClass}`}>
      <div className="flex items-center justify-between gap-4 mb-4">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-white flex items-center gap-1">
          <ELI5Tooltip term={termKey}>{title}</ELI5Tooltip>
        </h3>
        <Target className={`w-4 h-4 ${status === "Healthy" ? "text-emerald-400" : "text-muted-foreground"}`} />
      </div>
      <div className="mb-4">
        <p className="text-4xl font-bold tracking-tight text-white">{value}</p>
        <p className={`text-xs mt-2 uppercase tracking-[0.2em] font-semibold ${toneClass}`}>
          {eli5Mode
            ? status === "Healthy" ? "✅ Fair" : status === "Warning" ? "⚠️ Borderline" : "❌ Biased"
            : status}
        </p>
      </div>
      <div>
        <div className="mb-2 text-xs text-muted-foreground flex justify-between">
          <span>{eli5Mode ? "Acceptable range:" : "Target range:"}</span>
          <span className="text-white font-mono">{target}</span>
        </div>
        <p className="text-xs text-muted-foreground border-t border-white/10 pt-3">{desc}</p>
      </div>
    </div>
  );
}
