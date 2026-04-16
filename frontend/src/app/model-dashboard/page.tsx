"use client";

import Layout from "@/components/Layout";
import QuickActions from "@/components/QuickActions";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Brain, Plus, Activity, Layers, ActivitySquare, Database, Loader2, Calendar, ArrowRight } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/auth";
import BiasBeforeAfter, { BiasSlice } from "@/components/BiasBeforeAfter";
import { ELI5ModeToggle, ELI5Tooltip, TermBadge } from "@/components/ELI5Tooltip";

const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:4000/api/v1").replace(/\/$/, "");

export default function ModelDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<any[]>([]);
  const [eli5Mode, setEli5Mode] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState<number>(0);

  useEffect(() => {
    async function loadHistory() {
      try {
        const res = await apiFetch(`${API_URL}/fairsight/history`);
        if (!res.ok) throw new Error("Failed to load history");
        const data = await res.json();
        setHistory(data.items || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadHistory();
  }, []);

  // Calculate dynamic stats
  const activeModels = new Set(history.map(item => item.modelName)).size;
  const avgFairness = history.length 
    ? Math.round(history.reduce((acc, curr) => {
        const dpd = curr.detectReport?.dpd || curr.mitigationResult?.dpd_before || curr.detectReport?.dpd_before || 0;
        return acc + Math.max(0, 100 - (dpd * 100)); // 100 - DPD%
      }, 0) / history.length) 
    : 0;
  const criticalAlerts = history.filter(item => item.detectReport?.is_biased).length;

  // Transform data for charts
  const validDetectHistory = history.filter(item => item.detectReport && item.modelName);
  
  // Latest N models for bar chart
  const modelData = validDetectHistory.slice(0, 6).map(item => {
    const r = item.detectReport;
    const m = item.mitigationResult;
    const dpd = m ? m.dpd_after : r.dpd;
    const acc = m ? m.accuracy_after : r.performance?.accuracy;
    
    return {
      name: item.modelName?.replace('.pkl', '')?.replace('.joblib', '') || "Unknown",
      accuracy: acc || 0,
      fairnessScore: 1 - Math.abs(dpd || 0), // Simplistic fairness score
      createdAt: item.createdAt,
    };
  }).reverse(); // chronological

  // Trend data over time
  const trendData = [...validDetectHistory].reverse().map((item, idx) => {
    const r = item.detectReport;
    return {
      epoch: `v${idx + 1}`,
      date: new Date(item.createdAt || Date.now()).toLocaleDateString(),
      disparateImpact: 1 - Math.abs(r.dpd || 0),
      equalOpportunity: 1 - Math.abs(r.eod || 0),
    };
  });

  // Build before/after bias slices for selected history item
  const selectedItem = history[selectedIdx] ?? null;
  const biasSlices = useMemo<BiasSlice[]>(() => {
    if (!selectedItem?.detectReport) return [];
    const r = selectedItem.detectReport;
    const m = selectedItem.mitigationResult;
    const dpd = r.dpd ?? 0;
    const dpdAfter = m?.dpd_after ?? null;
    const groups: BiasSlice[] = (r.by_group || []).map((g: any) => ({
      attribute: String(g.group),
      originalScore: Math.min(100, Math.round((1 - Math.abs(dpd)) * 100)),
      correctedScore: dpdAfter !== null ? Math.min(100, Math.round((1 - Math.abs(dpdAfter)) * 100)) : null,
      originalDI: 1 - Math.abs(dpd),
      correctedDI: dpdAfter !== null ? (1 - Math.abs(dpdAfter)) : null,
      riskLevel: r.severity?.dpd_severity?.level === "low" ? "low" : r.severity?.dpd_severity?.level === "moderate" ? "medium" : "high",
    }));
    if (groups.length) return groups;
    return [
      {
        attribute: selectedItem.sensitiveCol || "sensitive_attribute",
        originalScore: Math.min(100, Math.round((1 - Math.abs(dpd)) * 100)),
        correctedScore: dpdAfter !== null ? Math.min(100, Math.round((1 - Math.abs(dpdAfter)) * 100)) : null,
        originalDI: 1 - Math.abs(dpd),
        correctedDI: dpdAfter !== null ? (1 - Math.abs(dpdAfter)) : null,
        riskLevel: Math.abs(dpd) > 0.2 ? "high" : Math.abs(dpd) > 0.1 ? "medium" : "low",
      },
    ];
  }, [selectedItem]);

  return (
    <Layout>
      <div className="relative space-y-8 pb-10">
        <div className="pointer-events-none absolute right-[10%] top-[10%] h-[500px] w-[500px] rounded-full bg-primary/5 blur-[120px]" />

        {/* Header */}
        <div className="card-glow group relative overflow-hidden p-8">
          <div className="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-primary via-secondary to-primary shadow-[0_0_15px_rgba(var(--theme-glow),0.3)]" />
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="mb-2 font-sans text-3xl font-bold tracking-tight text-white flex items-center gap-3">
                <Brain className="h-8 w-8 text-primary" />
                {eli5Mode ? "My AI Models — Fairness Overview" : "Model Bias Dashboard"}
              </h1>
              <p className="text-sm text-muted-foreground">
                {eli5Mode
                  ? "This page shows all the AI models you have uploaded and how fairly they treat different groups of people."
                  : "Monitor and evaluate the fairness of your machine learning models dynamically from the database."}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <ELI5ModeToggle enabled={eli5Mode} onToggle={() => setEli5Mode((v) => !v)} />
              <Button asChild className="bg-primary text-black hover:bg-primary/90 shadow-[0_0_15px_rgba(var(--theme-glow),0.3)]">
                <Link to="/model-analyzer">
                  <Plus className="mr-2 h-4 w-4" />
                  {eli5Mode ? "Check New Model" : "Analyze New Model"}
                </Link>
              </Button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-40">
            <Loader2 className="h-8 w-8 text-primary animate-spin" />
          </div>
        ) : (
          <>
            <QuickActions view="model" />

            {/* Before/After for selected item */}
            {biasSlices.length > 0 && (
              <section className="card-glow p-8 animate-in fade-in slide-in-from-bottom-3">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-primary">
                      {eli5Mode ? "Selected model fairness" : "Bias Before vs After Mitigation"}
                    </p>
                    <h2 className="mt-1 text-lg font-semibold text-white">
                      {selectedItem?.modelName || "Model"}
                      <TermBadge term="Disparate Impact" />
                    </h2>
                  </div>
                  {history.length > 1 && (
                    <select
                      value={selectedIdx}
                      onChange={(e) => setSelectedIdx(Number(e.target.value))}
                      className="border border-white/10 bg-black/30 px-4 py-2 text-sm text-white min-w-[240px]"
                    >
                      {history.map((item, idx) => (
                        <option key={idx} value={idx}>
                          {item.modelName || `Audit ${idx + 1}`} — {new Date(item.createdAt || Date.now()).toLocaleDateString()}
                        </option>
                      ))}
                    </select>
                  )}
                  <Link
                    to="/model-mitigation"
                    className="flex items-center gap-1.5 border border-primary/20 bg-primary/5 px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest text-primary hover:bg-primary/10 transition"
                  >
                    {eli5Mode ? "Fix This →" : "Run Mitigation →"}
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
                {eli5Mode && (
                  <p className="mb-4 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-2 text-sm text-amber-300/80">
                    📖 <strong>ELI5:</strong> Faded bars = how unfair the AI was before. Bright bars = how fair it became after applying a bias repair. Green = fair (80%+), Red = still needs work.
                  </p>
                )}
                <BiasBeforeAfter
                  slices={biasSlices}
                  title={eli5Mode ? "Before vs After Bias Repair" : "Fairness by Group: Before vs After Mitigation"}
                  subtitle={
                    selectedItem?.mitigationResult
                      ? eli5Mode
                        ? `A repair was applied: ${selectedItem.mitigationResult.method || selectedItem.mitigationResult.summary?.verdict || "fairness algorithm"}`
                        : `Mitigation applied: ${selectedItem.mitigationResult.method || "N/A"}`
                      : eli5Mode
                      ? "No repair applied yet. Go to Model Mitigation to fix this."
                      : "Run mitigation from the Model Mitigation page to see corrected values."
                  }
                  showDI={!eli5Mode}
                  showDP={false}
                  compact
                />
              </section>
            )}

            {/* Quick Stats */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 animate-in fade-in slide-in-from-bottom-4 mt-8">
              <StatCard title="Unique Models Analyzed" value={activeModels.toString()} icon={<Layers className="h-4 w-4 text-primary" />} trend="All time" />
              <StatCard title="Avg Fairness Score (DB)" value={`${avgFairness}%`} icon={<ActivitySquare className="h-4 w-4 text-primary" />} trend="Aggregated" />
              <StatCard title="Historical Bias Alerts" value={criticalAlerts.toString()} icon={<Activity className="h-4 w-4 text-destructive" />} trend={criticalAlerts > 0 ? "Flagged models" : "All clean"} isWarning={criticalAlerts > 0} />
              <StatCard title="Total Audit Runs" value={history.length.toString()} icon={<Database className="h-4 w-4 text-primary" />} trend="Stored in MongoDB" />
            </div>

            {/* Charts Row */}
            {history.length > 0 && (
              <div className="grid gap-6 lg:grid-cols-2 animate-in fade-in slide-in-from-bottom-6">
                {/* Accuracy vs Fairness Tradeoff */}
                <div className="card-glow group relative flex flex-col rounded-xl p-6 min-h-[400px]">
                  <div className="mb-6">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-white">
                      {eli5Mode ? "Is Accurate = Is Fair?" : "Recent Models: Accuracy vs Fairness"}
                      <TermBadge term="Accuracy" />
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {eli5Mode
                        ? "A model can be very accurate (correct most of the time) but still be unfair to minorities. High fairness score = equal treatment."
                        : "Latest models loaded dynamically from the Fairsight audit database."}
                    </p>
                  </div>
                  <div className="flex-1 min-h-[300px]">
                    {modelData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={modelData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                          <XAxis dataKey="name" stroke="rgba(255,255,255,0.3)" tick={{fill: "rgba(255,255,255,0.5)", fontSize: 12}} />
                          <YAxis stroke="rgba(255,255,255,0.3)" tick={{fill: "rgba(255,255,255,0.5)", fontSize: 12}} />
                          <Tooltip content={<CustomTooltip />} cursor={{fill: "rgba(255,255,255,0.05)"}} />
                          <Bar dataKey="accuracy" name="Accuracy" fill="var(--chart-primary)" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="fairnessScore" name="Fairness Score" fill="var(--chart-secondary)" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No model data available.</div>
                    )}
                  </div>
                </div>

                {/* Metric Trends */}
                <div className="card-glow group relative flex flex-col rounded-xl p-6 min-h-[400px]">
                  <div className="mb-6">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-white">
                      {eli5Mode ? "Is the AI getting fairer over time?" : "Historical Fairness Over Time"}
                      <TermBadge term="Disparate Impact" />
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {eli5Mode
                        ? "Going up = your AI is becoming fairer. Going down = it's getting more biased over time."
                        : "Tracking overall Disparate Impact and Equal Opportunity trends."}
                    </p>
                  </div>
                  <div className="flex-1 min-h-[300px]">
                    {trendData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={trendData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                          <XAxis dataKey="epoch" stroke="rgba(255,255,255,0.3)" tick={{fill: "rgba(255,255,255,0.5)", fontSize: 12}} />
                          <YAxis stroke="rgba(255,255,255,0.3)" tick={{fill: "rgba(255,255,255,0.5)", fontSize: 12}} domain={[0, 1.0]} />
                          <Tooltip content={<CustomTooltip />} />
                          <Line type="monotone" dataKey="disparateImpact" name="Disparate Impact" stroke="var(--chart-primary)" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                          <Line type="monotone" dataKey="equalOpportunity" name="Equal Opportunity" stroke="var(--chart-secondary)" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No trend data available.</div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Audit Logs Table */}
            <div className="card-glow p-6 mt-8 animate-in fade-in slide-in-from-bottom-8">
               <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                 <Database className="h-5 w-5 text-primary" />
                 {eli5Mode ? "All My Model Checks" : "Database Audit Logs"}
               </h3>
               {history.length > 0 ? (
                 <div className="overflow-x-auto">
                   <table className="w-full text-sm text-left">
                     <thead className="text-xs uppercase bg-white/5 text-muted-foreground font-mono tracking-wider">
                       <tr>
                         <th className="px-4 py-3">Date</th>
                         <th className="px-4 py-3">Model</th>
                         <th className="px-4 py-3">Target</th>
                         <th className="px-4 py-3">Sensitive Attribute</th>
                         <th className="px-4 py-3">Bias Status</th>
                         <th className="px-4 py-3">Mitigation</th>
                       </tr>
                     </thead>
                     <tbody className="divide-y divide-white/5">
                       {history.map((item, i) => (
                         <tr key={item._id || i} className="hover:bg-white/[0.02]">
                           <td className="px-4 py-3 font-mono text-xs flex items-center gap-2">
                             <Calendar className="h-3 w-3" />
                             {new Date(item.createdAt || Date.now()).toLocaleString()}
                           </td>
                           <td className="px-4 py-3 font-semibold text-white">{item.modelName || <span className="text-muted-foreground italic">N/A</span>}</td>
                           <td className="px-4 py-3">{item.labelCol || <span className="text-muted-foreground italic">-</span>}</td>
                           <td className="px-4 py-3 text-primary">{item.sensitiveCol || <span className="text-muted-foreground italic">-</span>}</td>
                           <td className="px-4 py-3">
                             {item.detectReport?.is_biased ? (
                               <span className="px-2 py-1 bg-red-500/10 text-red-400 border border-red-500/30 rounded text-xs">Biased</span>
                             ) : (
                               <span className="px-2 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded text-xs">Fair</span>
                             )}
                           </td>
                           <td className="px-4 py-3">
                             {item.mitigationResult ? (
                               <span className="px-2 py-1 bg-blue-500/10 text-blue-400 border border-blue-500/30 rounded text-xs">
                                 {item.mitigationResult?.method || "Applied"}
                               </span>
                             ) : (
                               <span className="text-muted-foreground text-xs italic">None</span>
                             )}
                           </td>
                         </tr>
                       ))}
                     </tbody>
                   </table>
                 </div>
               ) : (
                 <div className="py-8 text-center text-sm text-muted-foreground">
                   No model audits found in the database. 
                 </div>
               )}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

function StatCard({ title, value, icon, trend, isWarning = false }: { title: string; value: string; icon: React.ReactNode; trend: string; isWarning?: boolean }) {
  return (
    <div className={`card-glow flex flex-col justify-between rounded-xl p-6 ${isWarning ? 'border-red-500/30 bg-red-500/5' : ''}`}>
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
        <div className={`flex h-8 w-8 items-center justify-center rounded-md border ${isWarning ? 'bg-red-500/10 border-red-500/20' : 'bg-primary/10 border-primary/20'}`}>
          {icon}
        </div>
      </div>
      <div className="mt-4 flex items-baseline gap-2">
        <p className={`text-3xl font-bold tracking-tight ${isWarning ? 'text-red-400' : 'text-white'}`}>{value}</p>
        <p className={`text-xs ${isWarning ? 'text-red-400/70' : 'text-muted-foreground'}`}>{trend}</p>
      </div>
    </div>
  );
}

function CustomTooltip({ active, payload, label }: any) {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-lg border border-primary/20 bg-black/80 p-3 shadow-xl backdrop-blur-md">
        <p className="mb-2 border-b border-white/10 pb-1 text-xs font-semibold uppercase text-white">{label}</p>
        {payload.map((entry: any, index: number) => (
          <div key={`item-${index}`} className="flex items-center gap-2 text-sm font-medium">
            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-muted-foreground">{entry.name}:</span>
            <span className="text-white">{typeof entry.value === 'number' ? (entry.value * 100).toFixed(1) + '%' : entry.value}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
}
