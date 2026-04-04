"use client";

import AuditLogs from "@/components/AuditLogs";
import Layout from "@/components/Layout";
import QuickActions from "@/components/QuickActions";
import QuickStats from "@/components/QuickStats";
import { Button } from "@/components/ui/button";
import {
  buildBiasDistribution,
  buildPerformanceTrend,
  buildQuickStats,
  buildRadarTrendData,
  buildRecentAuditLogs,
} from "@/lib/analysis-insights";
import { listAnalyses } from "@/lib/api";
import { loadAnalysisHistory } from "@/lib/analysis-store";
import type { AnalysisPayload } from "@/types/analysis";
import {
  BarChart,
  Bar,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, MoreVertical, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";

export default function DashboardPage() {
  const [analyses, setAnalyses] = useState<AnalysisPayload[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function hydrate() {
      try {
        const items = await listAnalyses();
        setAnalyses(items);
      } catch {
        setAnalyses(loadAnalysisHistory());
      } finally {
        setLoading(false);
      }
    }

    hydrate();
  }, []);

  const quickStats = useMemo(() => buildQuickStats(analyses), [analyses]);
  const radarData = useMemo(() => buildRadarTrendData(analyses), [analyses]);
  const barData = useMemo(() => buildBiasDistribution(analyses), [analyses]);
  const lineTrend = useMemo(() => buildPerformanceTrend(analyses), [analyses]);
  const recentAudits = useMemo(() => buildRecentAuditLogs(analyses), [analyses]);

  if (loading) {
    return (
      <Layout>
        <div className="command-panel p-10 text-muted-foreground">Loading trend dashboard...</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="relative space-y-8 pb-10">
        <div className="pointer-events-none absolute left-[10%] top-[10%] h-[500px] w-[500px] rounded-full bg-emerald-500/5 blur-[120px]" />
        <div className="pointer-events-none absolute right-[10%] top-[40%] h-[500px] w-[500px] rounded-full bg-teal-500/5 blur-[120px]" />

        <div className="card-glow group relative overflow-hidden p-8">
          <div className="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)]" />
          <h1 className="mb-2 font-sans text-3xl font-bold tracking-tight text-white">Welcome back, Operator</h1>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground opacity-60">
            Neural core online. Scanning long-range fairness trends, portfolio bias telemetry, and operational recommendations.
          </p>
        </div>

        <QuickStats stats={quickStats} />
        <QuickActions />

        <div className="grid gap-6 lg:grid-cols-[1fr_400px] xl:grid-cols-[1fr_500px]">
          <div className="card-glow group relative flex min-h-[400px] flex-col rounded-xl p-6">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-widest text-white opacity-80">Group Fairness Comparison</h3>
              <MoreVertical className="h-4 w-4 cursor-pointer text-muted-foreground" />
            </div>
            <div className="min-h-[300px] flex-1">
              {radarData.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart cx="50%" cy="50%" outerRadius="75%" data={radarData}>
                    <PolarGrid stroke="rgba(255,255,255,0.05)" />
                    <PolarAngleAxis
                      dataKey="subject"
                      tick={{ fill: "rgba(var(--theme-glow), 0.4)", fontSize: 10, fontWeight: 600 }}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Radar
                      name="Baseline"
                      dataKey="baseline"
                      stroke="var(--chart-primary)"
                      strokeWidth={2}
                      fill="var(--chart-primary)"
                      fillOpacity={0.1}
                    />
                    <Radar
                      name="Debiased"
                      dataKey="corrected"
                      stroke="var(--chart-secondary)"
                      strokeWidth={2}
                      fill="var(--chart-secondary)"
                      fillOpacity={0.4}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              ) : (
                <ChartEmpty message="Run a few audits to build attribute-level fairness trend telemetry." />
              )}
            </div>
          </div>

          <div className="card-glow flex min-h-[400px] flex-col rounded-xl p-6">
            <div className="mb-6 flex items-start justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-widest text-white opacity-80">Bias Metrics Distribution</h3>
                <p className="mt-1 font-mono text-[10px] font-bold uppercase tracking-tighter text-primary/60">Histogram Frequency</p>
              </div>
              <MoreVertical className="h-4 w-4 cursor-pointer text-muted-foreground" />
            </div>
            <div className="mt-4 min-h-[250px] flex-1">
              {analyses.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.03)" />
                    <XAxis
                      dataKey="name"
                      tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }}
                      tickLine={false}
                      axisLine={{ stroke: "rgba(255,255,255,0.05)" }}
                    />
                    <YAxis
                      tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip cursor={{ fill: "rgba(var(--theme-glow), 0.05)" }} content={<CustomTooltip />} />
                    <Bar dataKey="value" name="Frequency" radius={[0, 0, 0, 0]}>
                      {barData.map((entry, index) => (
                        <Cell key={`${entry.range}-${index}`} fill={index % 2 === 0 ? "url(#colorUv)" : "url(#colorPv)"} />
                      ))}
                    </Bar>
                    <defs>
                      <linearGradient id="colorUv" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--chart-primary)" stopOpacity={1} />
                        <stop offset="95%" stopColor="var(--chart-primary)" stopOpacity={0.2} />
                      </linearGradient>
                      <linearGradient id="colorPv" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--chart-secondary)" stopOpacity={1} />
                        <stop offset="95%" stopColor="var(--chart-secondary)" stopOpacity={0.2} />
                      </linearGradient>
                    </defs>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <ChartEmpty message="No distribution telemetry yet. Upload a dataset to begin the archive." />
              )}
            </div>
          </div>
        </div>

        <AuditLogs audits={recentAudits} />

        <div className="card-glow relative rounded-xl p-8">
          <div className="pointer-events-none absolute right-0 top-0 h-32 w-32 bg-primary/5 blur-3xl" />
          <div className="mb-10 flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-widest text-white opacity-80">Performance Disparity Analysis</h3>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground/60">
                {lineTrend.description}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-4 border border-white/5 bg-black/40 px-4 py-2 backdrop-blur-sm">
              {lineTrend.series.map((series) => (
                <div key={series.key} className="flex items-center gap-2">
                  <span
                    className="h-1.5 w-1.5"
                    style={{
                      backgroundColor: series.color,
                      boxShadow: `0 0 8px ${series.color}`,
                    }}
                  />
                  <span className="font-mono text-[10px] uppercase text-primary/80">{series.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="h-[350px] w-full">
            {lineTrend.data.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={lineTrend.data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.03)" />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `${Math.round(Number(value) * 100)}%`}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  {lineTrend.series.map((series) => (
                    <Line
                      key={series.key}
                      type="monotone"
                      dataKey={series.key}
                      name={series.label}
                      stroke={series.color}
                      strokeWidth={series.strokeWidth}
                      dot={{ r: series.dotRadius, fill: series.color, strokeWidth: 0 }}
                      activeDot={{ r: series.dotRadius + 2 }}
                      strokeDasharray={series.dashArray}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <ChartEmpty message="Monthly disparity trend will appear here after audits start landing in the archive." />
            )}
          </div>
        </div>

        <div className="card-glow relative overflow-hidden border border-emerald-500/20 bg-emerald-500/5 p-8">
          <div className="pointer-events-none absolute right-0 top-0 h-64 w-64 translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500/10 blur-3xl" />
          <div className="relative z-10 flex flex-col items-center gap-6 md:flex-row md:items-start">
            <div className="flex items-center justify-center border border-emerald-500/30 bg-emerald-500/20 p-4">
              <AlertTriangle className="h-6 w-6 text-emerald-400" />
            </div>

            <div className="flex-1 space-y-3 text-center md:text-left">
              <h3 className="text-xl font-bold uppercase tracking-wide text-white">Operational Initialization</h3>
              <p className="max-w-3xl font-mono text-sm leading-relaxed text-muted-foreground">
                Begin by uploading your raw dataset or connecting the latest model export. FairLens will parse the schema,
                detect sensitive attributes, run the fairness audit, and generate the detailed remediation view inside the analyzer flow.
              </p>
              <div className="pt-4">
                <Button
                  asChild
                  className="border border-emerald-400 bg-emerald-500 px-8 py-6 text-[10px] font-bold uppercase tracking-[0.3em] text-black shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all hover:brightness-110"
                >
                  <Link to="/analyzer">
                    <Plus className="mr-2 h-4 w-4" />
                    Launch FairLens Analysis
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

function ChartEmpty({ message }: { message: string }) {
  return (
    <div className="flex h-full min-h-[240px] items-center justify-center border border-dashed border-white/10 bg-black/20 p-6 text-center text-sm text-muted-foreground">
      <p className="max-w-sm leading-6">{message}</p>
    </div>
  );
}

function CustomTooltip({ active, payload, label }: any) {
  if (!(active && payload && payload.length)) return null;

  return (
    <div className="rounded-lg border border-white/10 bg-card/80 p-3 shadow-xl shadow-black/50 backdrop-blur-md">
      <p className="mb-1 font-mono text-xs font-semibold uppercase tracking-widest text-foreground">{`Range: ${label}`}</p>
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
  if (value >= 0 && value <= 1) return `${Math.round(value * 100)}%`;
  return Number.isInteger(value) ? `${value}` : value.toFixed(2);
}
