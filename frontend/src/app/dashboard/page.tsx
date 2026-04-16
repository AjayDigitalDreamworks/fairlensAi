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
import BiasBeforeAfter, { BiasSlice } from "@/components/BiasBeforeAfter";
import { ELI5ModeToggle, ELI5Tooltip, TermBadge } from "@/components/ELI5Tooltip";
import {
  Area,
  AreaChart,
  BarChart,
  Bar,
  CartesianGrid,
  Cell,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Plus, Activity, ArrowRight, Database, Cpu } from "lucide-react";
import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";

export default function DashboardPage() {
  const [analyses, setAnalyses] = useState<AnalysisPayload[]>([]);
  const [loading, setLoading] = useState(true);
  const [eli5Mode, setEli5Mode] = useState(false);

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
        <div className="command-panel p-10 text-muted-foreground">Loading dashboard...</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="relative space-y-8 pb-10">
        <div className="pointer-events-none absolute left-[10%] top-[10%] h-[500px] w-[500px] rounded-full bg-emerald-500/5 blur-[120px]" />

        {/* Header */}
        <div className="card-glow group relative overflow-hidden p-8">
          <div className="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-primary via-secondary to-primary shadow-[0_0_15px_rgba(var(--theme-glow),0.3)]" />
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="mb-2 font-sans text-3xl font-bold tracking-tight text-white">
                {eli5Mode ? "My AI Fairness Dashboard" : "Dashboard"}
              </h1>
              <p className="text-sm text-muted-foreground">
                {eli5Mode
                  ? "This is your fairness control room. It shows how fair your AI is, where the problems are, and what you can do to fix them."
                  : "Overview of your fairness audit portfolio — track bias trends, compliance scores, and recent audit activity."}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <ELI5ModeToggle enabled={eli5Mode} onToggle={() => setEli5Mode((v) => !v)} />
              <Button asChild className="bg-primary text-black hover:bg-primary/90">
                <Link to="/analyzer">
                  <Plus className="mr-2 h-4 w-4" />
                  {eli5Mode ? "Check My Data" : "New Audit"}
                </Link>
              </Button>
            </div>
          </div>
        </div>

        <QuickStats stats={quickStats} />

        {/* Before/After Overview */}
        {analyses.length > 0 && (() => {
          const latest = analyses[0];
          const findings = latest?.result?.sensitive_findings ?? [];
          const corrected = latest?.result?.corrected_sensitive_findings ?? [];
          const slices: BiasSlice[] = findings.map((f: any) => {
            const c = corrected.find((x: any) => x.sensitive_column === f.sensitive_column);
            return {
              attribute: f.sensitive_column,
              originalScore: f.fairness_score,
              correctedScore: c?.fairness_score ?? null,
              originalDI: f.disparate_impact,
              correctedDI: c?.disparate_impact ?? null,
              riskLevel: f.risk_level,
            };
          });
          if (!slices.length) return null;
          return (
            <section className="card-glow p-8">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-emerald-300">
                    {eli5Mode ? "Latest fairness result" : "Latest Audit — Before vs After"}
                  </p>
                  <h2 className="mt-1 text-lg font-semibold text-white">
                    {eli5Mode
                      ? `How fair is "${latest.input?.fileName}" for each group?`
                      : `${latest.input?.fileName} — Sensitive Attribute Comparison`}
                    <TermBadge term="Fairness Score" />
                  </h2>
                </div>
                <Link
                  to={`/mitigation`}
                  className="flex shrink-0 items-center gap-1.5 border border-emerald-500/20 bg-emerald-500/5 px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest text-emerald-300 hover:bg-emerald-500/10 transition"
                >
                  {eli5Mode ? "Fix This →" : "Open Mitigation →"}
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
              {eli5Mode && (
                <p className="mb-4 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-2 text-sm text-amber-300/80">
                  📖 <strong>ELI5:</strong> Each bar represents a different group (like men vs women, or age groups). Faded bar = before we tried to fix the AI. Bright bar = how fair it could be after fixing.
                </p>
              )}
              <BiasBeforeAfter
                slices={slices}
                title={eli5Mode ? "Fairness Before vs After Bias Fix" : "Fairness Score by Sensitive Attribute"}
                subtitle={eli5Mode
                  ? "Green = fair enough · Amber = borderline · Red = unfair (needs fixing)"
                  : "Baseline fairness scores and corrected outcomes per demographic slice"}
                compact
                showDI={!eli5Mode}
                showDP={false}
              />
            </section>
          );
        })()}

        {/* All tools */}
        <QuickActions view="all" />

        <section className="card-glow p-8 bg-gradient-to-br from-black to-primary/5 border-l-4 border-l-primary relative overflow-hidden">
           <div className="absolute top-0 right-0 p-4 opacity-10">
              <Activity className="h-32 w-32" />
           </div>
           <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
              <div className="space-y-2">
                 <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <Activity className="h-5 w-5 text-primary" />
                    {eli5Mode ? "See the Real Human Impact of Bias" : "Live Bias Impact Simulation"}
                 </h2>
                 <p className="text-sm text-muted-foreground max-w-2xl">
                    {eli5Mode
                      ? "Ever wonder how many real people are being unfairly rejected by an AI? The Bias Simulator lets you move a slider and watch the numbers change in real time — so you can feel the human cost of unfair AI."
                      : "Experience how algorithmic bias silently impacts human lives. Adjust model weights and witness real-time discriminatory outcomes across different demographics."}
                 </p>
              </div>
              <Button asChild className="bg-primary text-black font-bold h-12 px-8">
                 <Link to="/simulator">{eli5Mode ? "See Human Impact" : "Launch Simulator"}</Link>
              </Button>
           </div>
        </section>

        {/* Charts Row */}
        <div className="grid gap-6 lg:grid-cols-[1fr_400px] xl:grid-cols-[1fr_500px]">
          {/* Radar: Attribute Fairness */}
          <div className="card-glow group relative flex min-h-[400px] flex-col rounded-xl p-6">
            <div className="mb-6">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-white">
                {eli5Mode ? "Spider Chart: Fairness by Group" : "Fairness by Attribute"}
                <TermBadge term="Sensitive Attribute" />
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {eli5Mode
                  ? "Each spoke = a different group. Outer edge = perfectly fair. Inner = severely biased."
                  : "Baseline vs corrected scores across sensitive attributes"}
              </p>
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
                    <Radar name="Baseline" dataKey="baseline" stroke="var(--chart-primary)" strokeWidth={2} fill="var(--chart-primary)" fillOpacity={0.1} />
                    <Radar name="Corrected" dataKey="corrected" stroke="var(--chart-secondary)" strokeWidth={2} fill="var(--chart-secondary)" fillOpacity={0.4} />
                  </RadarChart>
                </ResponsiveContainer>
              ) : (
                <ChartEmpty message="Run a few audits to see fairness comparisons across sensitive attributes." />
              )}
            </div>
          </div>

          {/* Bar: Bias Distribution */}
          <div className="card-glow flex min-h-[400px] flex-col rounded-xl p-6">
            <div className="mb-6">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-white">
                {eli5Mode ? "How often is the AI this unfair?" : "Bias Score Distribution"}
                <TermBadge term="Fairness Score" />
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {eli5Mode
                  ? "Taller bars = more audits landed in that fairness range. Most should be on the right (fair)."
                  : "How bias scores are distributed across your audits"}
              </p>
            </div>
            <div className="mt-4 min-h-[250px] flex-1">
              {analyses.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.03)" />
                    <XAxis dataKey="name" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} tickLine={false} axisLine={{ stroke: "rgba(255,255,255,0.05)" }} />
                    <YAxis tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 10 }} tickLine={false} axisLine={false} />
                    <Tooltip cursor={{ fill: "rgba(var(--theme-glow), 0.05)" }} content={<CustomTooltip />} />
                    <Bar dataKey="value" name="Count" radius={[0, 0, 0, 0]}>
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
                <ChartEmpty message="Upload a dataset to see how bias scores are distributed." />
              )}
            </div>
          </div>
        </div>

        <AuditLogs audits={recentAudits} />

        {/* Performance Trend */}
        <div className="card-glow relative rounded-xl p-8">
          <div className="mb-10 flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-white">
                {eli5Mode ? "Is the AI getting fairer over time?" : "Fairness Trend Over Time"}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {eli5Mode
                  ? "This chart shows whether your AI is getting better or worse at treating people fairly with each new audit. Going up = improving!"
                  : lineTrend.description}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-4 border border-white/5 bg-black/40 px-4 py-2 backdrop-blur-sm">
              {lineTrend.series.map((series) => (
                <div key={series.key} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5" style={{ backgroundColor: series.color, boxShadow: `0 0 8px ${series.color}` }} />
                  <span className="text-[10px] font-mono uppercase text-muted-foreground">{series.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="h-[350px] w-full">
            {lineTrend.data.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={lineTrend.data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    {lineTrend.series.map((series) => (
                      <linearGradient key={`grad-${series.key}`} id={`grad-${series.key}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={series.color} stopOpacity={0.15} />
                        <stop offset="95%" stopColor={series.color} stopOpacity={0.02} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.03)" />
                  <XAxis dataKey="name" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(value) => `${Math.round(Number(value) * 100)}%`} />
                  <Tooltip content={<CustomTooltip />} />
                  {lineTrend.series.map((series) => (
                    <Area
                      key={series.key}
                      type="monotone"
                      dataKey={series.key}
                      name={series.label}
                      stroke={series.color}
                      strokeWidth={series.strokeWidth}
                      fill={`url(#grad-${series.key})`}
                      dot={{ r: series.dotRadius, fill: series.color, strokeWidth: 0 }}
                      activeDot={{ r: series.dotRadius + 2 }}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <ChartEmpty message="Fairness trends will appear here after you run multiple audits." />
            )}
          </div>
        </div>

        {/* CTA - Two CTAs: dataset and model */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="card-glow relative overflow-hidden border border-primary/20 bg-primary/5 p-8">
            <div className="mb-4 flex items-center gap-2">
              <Database className="h-5 w-5 text-primary" />
              <p className="text-[10px] font-mono uppercase tracking-widest text-primary">Dataset Analysis</p>
            </div>
            <h3 className="text-lg font-bold text-white mb-2">
              {eli5Mode ? "Check if my data is biased" : "Run Dataset Fairness Audit"}
            </h3>
            <p className="text-sm text-muted-foreground mb-6">
              {eli5Mode
                ? "Upload a CSV file of your data and we'll check if certain groups are being unfairly treated. Takes 30 seconds."
                : "Upload a CSV/XLSX dataset. FairLens auto-detects sensitive attributes and generates a corrected output with a full audit report."}
            </p>
            <Button asChild className="bg-primary text-sm font-bold text-black hover:bg-primary/90">
              <Link to="/analyzer">
                <Plus className="mr-2 h-4 w-4" />
                {eli5Mode ? "Upload My Data" : "Start Dataset Audit"}
              </Link>
            </Button>
          </div>

          <div className="card-glow relative overflow-hidden border border-secondary/20 bg-secondary/5 p-8">
            <div className="mb-4 flex items-center gap-2">
              <Cpu className="h-5 w-5 text-secondary" />
              <p className="text-[10px] font-mono uppercase tracking-widest text-secondary">Model Analysis</p>
            </div>
            <h3 className="text-lg font-bold text-white mb-2">
              {eli5Mode ? "Check if my AI model is biased" : "Run ML Model Fairness Audit"}
            </h3>
            <p className="text-sm text-muted-foreground mb-6">
              {eli5Mode
                ? "Upload your trained AI model file (.pkl, .h5) and we'll measure how fairly it treats different groups of people."
                : "Upload a .pkl, .joblib, or .h5 model file for structured fairness evaluation including DPD, EOD, and per-group performance breakdown."}
            </p>
            <Button asChild className="bg-secondary text-sm font-bold text-black hover:bg-secondary/90">
              <Link to="/model-analyzer">
                <Plus className="mr-2 h-4 w-4" />
                {eli5Mode ? "Upload My Model" : "Start Model Audit"}
              </Link>
            </Button>
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
  if (value >= 0 && value <= 1) return `${Math.round(value * 100)}%`;
  return Number.isInteger(value) ? `${value}` : value.toFixed(2);
}
