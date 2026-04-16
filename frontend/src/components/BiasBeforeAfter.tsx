"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from "recharts";
import { TrendingUp, TrendingDown, ArrowRight, ShieldCheck, AlertTriangle } from "lucide-react";
import { ELI5Tooltip, TermBadge } from "./ELI5Tooltip";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BiasSlice {
  attribute: string;
  originalScore: number;       // 0–100
  correctedScore?: number | null;
  originalDI?: number | null;
  correctedDI?: number | null;
  originalDP?: number | null;
  correctedDP?: number | null;
  riskLevel?: string;
}

interface Props {
  slices: BiasSlice[];
  title?: string;
  subtitle?: string;
  showDI?: boolean;
  showDP?: boolean;
  compact?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(v: number | null | undefined, decimals = 1): string {
  if (v == null || !isFinite(v)) return "—";
  return v.toFixed(decimals);
}

function pct(v: number | null | undefined, decimals = 0): string {
  if (v == null || !isFinite(v)) return "—";
  return `${v.toFixed(decimals)}%`;
}

function riskColor(level?: string) {
  if (level === "low") return "text-emerald-400";
  if (level === "medium") return "text-amber-400";
  return "text-red-400";
}

function scoreColor(score: number) {
  if (score >= 90) return "#10b981";  // emerald
  if (score >= 75) return "#f59e0b";  // amber
  return "#ef4444";                    // red
}

// ─── Custom Tooltip ──────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!(active && payload && payload.length)) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-black/90 p-3 shadow-xl shadow-black/60 backdrop-blur-md">
      <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-widest text-white">
        {label}
      </p>
      {payload.map((entry: any, i: number) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <span
            className="h-2 w-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: entry.fill || entry.color }}
          />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-bold text-white">
            {typeof entry.value === "number" ? `${entry.value.toFixed(1)}%` : entry.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Before / After Bias Visualization ───────────────────────────────────────

export default function BiasBeforeAfter({
  slices,
  title = "Before vs After Bias Correction",
  subtitle,
  showDI = true,
  showDP = true,
  compact = false,
}: Props) {
  const chartData = useMemo(
    () =>
      slices.map((s) => ({
        name: s.attribute
          .replace(/_/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase()),
        original: Number((s.originalScore ?? 0).toFixed(1)),
        corrected: Number((s.correctedScore ?? s.originalScore ?? 0).toFixed(1)),
        lift: Number(
          ((s.correctedScore ?? s.originalScore ?? 0) - (s.originalScore ?? 0)).toFixed(1)
        ),
        originalDI: s.originalDI != null ? Number((s.originalDI * 100).toFixed(1)) : null,
        correctedDI:
          s.correctedDI != null
            ? Number((s.correctedDI * 100).toFixed(1))
            : s.originalDI != null
            ? Number((s.originalDI * 100).toFixed(1))
            : null,
      })),
    [slices]
  );

  const totalLift = useMemo(() => {
    const valid = slices.filter(
      (s) => s.correctedScore != null && s.originalScore != null
    );
    if (!valid.length) return 0;
    return (
      valid.reduce((a, s) => a + (s.correctedScore! - s.originalScore!), 0) /
      valid.length
    );
  }, [slices]);

  const hasCorrected = slices.some((s) => s.correctedScore != null);

  if (!slices.length) {
    return (
      <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-dashed border-white/10 bg-black/20 p-6 text-center text-sm text-muted-foreground">
        <p>No fairness data available. Run a bias audit to see before/after comparisons.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-widest text-white">
            {title}
          </h3>
          {subtitle && (
            <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>

        {hasCorrected && (
          <div
            className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold ${
              totalLift >= 0
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : "border-red-500/30 bg-red-500/10 text-red-300"
            }`}
          >
            {totalLift >= 0 ? (
              <TrendingUp className="h-3.5 w-3.5" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5" />
            )}
            Avg lift{" "}
            <span className="font-bold">
              {totalLift >= 0 ? "+" : ""}
              {totalLift.toFixed(1)} pts
            </span>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4">
        <LegendDot color="#ef4444" label="Before correction" />
        {hasCorrected && <LegendDot color="#10b981" label="After correction" />}
        <div className="ml-auto">
          <ELI5Tooltip term="Fairness Score" side="bottom">
            <span className="cursor-help text-[10px] font-mono uppercase tracking-widest text-muted-foreground underline decoration-dashed">
              What is Fairness Score?
            </span>
          </ELI5Tooltip>
        </div>
      </div>

      {/* Bar Chart: Fairness Score */}
      <div className={compact ? "h-[240px]" : "h-[300px]"}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 10, right: 10, left: -20, bottom: 10 }}
            barGap={4}
            barCategoryGap="30%"
          >
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
              stroke="rgba(255,255,255,0.04)"
            />
            <XAxis
              dataKey="name"
              tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: "rgba(255,255,255,0.05)" }}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip content={<ChartTooltip />} />
            <ReferenceLine
              y={80}
              stroke="rgba(251,191,36,0.4)"
              strokeDasharray="4 4"
              label={{
                value: "80% Fairness Floor",
                position: "insideTopRight",
                fill: "rgba(251,191,36,0.6)",
                fontSize: 9,
              }}
            />
            <ReferenceLine
              y={95}
              stroke="rgba(16,185,129,0.4)"
              strokeDasharray="4 4"
              label={{
                value: "95% Target",
                position: "insideTopRight",
                fill: "rgba(16,185,129,0.6)",
                fontSize: 9,
              }}
            />
            <Bar dataKey="original" name="Before Correction" radius={[4, 4, 0, 0]}>
              {chartData.map((entry) => (
                <Cell
                  key={entry.name}
                  fill={scoreColor(entry.original)}
                  opacity={0.7}
                />
              ))}
            </Bar>
            {hasCorrected && (
              <Bar dataKey="corrected" name="After Correction" radius={[4, 4, 0, 0]}>
                {chartData.map((entry) => (
                  <Cell
                    key={`c-${entry.name}`}
                    fill={scoreColor(entry.corrected)}
                    opacity={0.95}
                  />
                ))}
              </Bar>
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Comparison Cards */}
      {!compact && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {slices.map((slice) => (
            <SliceComparisonCard key={slice.attribute} slice={slice} showDI={showDI} showDP={showDP} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Individual Slice Comparison Card ────────────────────────────────────────

function SliceComparisonCard({
  slice,
  showDI,
  showDP,
}: {
  slice: BiasSlice;
  showDI: boolean;
  showDP: boolean;
}) {
  const improved =
    slice.correctedScore != null && slice.correctedScore > slice.originalScore;
  const lift =
    slice.correctedScore != null
      ? slice.correctedScore - slice.originalScore
      : null;

  return (
    <div className="rounded-xl border border-white/8 bg-black/20 p-4 transition-all hover:border-white/15">
      {/* Title row */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold capitalize text-white">
          {slice.attribute.replace(/_/g, " ")}
        </p>
        <div className="flex items-center gap-1.5">
          {slice.riskLevel && (
            <span
              className={`text-[9px] font-mono uppercase tracking-widest ${riskColor(slice.riskLevel)}`}
            >
              {slice.riskLevel} risk
            </span>
          )}
          {improved != null && slice.correctedScore != null && (
            <span
              className={`rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest ${
                improved
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-300"
              }`}
            >
              {improved ? "Fixed" : "Review"}
            </span>
          )}
        </div>
      </div>

      {/* Fairness score before → after */}
      <div className="mb-3 flex items-center gap-2">
        <ScorePill label="Before" value={slice.originalScore} />
        {slice.correctedScore != null && (
          <>
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <ScorePill label="After" value={slice.correctedScore} highlight />
          </>
        )}
        {lift != null && (
          <span
            className={`ml-auto text-xs font-bold ${lift > 0 ? "text-emerald-400" : "text-amber-400"}`}
          >
            {lift > 0 ? "+" : ""}
            {lift.toFixed(1)} pts
          </span>
        )}
      </div>

      {/* Secondary metrics */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
        {showDI && slice.originalDI != null && (
          <>
            <span className="text-muted-foreground">
              <ELI5Tooltip term="Disparate Impact">DI Before</ELI5Tooltip>
            </span>
            <span className="font-mono text-white">{fmt(slice.originalDI, 3)}</span>

            {slice.correctedDI != null && (
              <>
                <span className="text-muted-foreground">
                  <ELI5Tooltip term="Disparate Impact">DI After</ELI5Tooltip>
                </span>
                <span className="font-mono text-emerald-300">
                  {fmt(slice.correctedDI, 3)}
                </span>
              </>
            )}
          </>
        )}

        {showDP && slice.originalDP != null && (
          <>
            <span className="text-muted-foreground">
              <ELI5Tooltip term="Demographic Parity">DP Gap Before</ELI5Tooltip>
            </span>
            <span className="font-mono text-white">{fmt(slice.originalDP, 3)}</span>

            {slice.correctedDP != null && (
              <>
                <span className="text-muted-foreground">
                  <ELI5Tooltip term="Demographic Parity">DP Gap After</ELI5Tooltip>
                </span>
                <span className="font-mono text-emerald-300">
                  {fmt(slice.correctedDP, 3)}
                </span>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ScorePill({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  const color = scoreColor(value);
  return (
    <div className="flex flex-col items-center">
      <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <span
        className="text-base font-bold tabular-nums"
        style={{ color: highlight ? color : "rgba(255,255,255,0.8)" }}
      >
        {value.toFixed(0)}%
      </span>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="h-2.5 w-2.5 rounded-sm flex-shrink-0"
        style={{ backgroundColor: color }}
      />
      <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

// ─── Simpler horizontal bar variant for compact use ──────────────────────────

export function BiasProgressBars({
  slices,
  title = "Fairness Scores by Group",
}: {
  slices: BiasSlice[];
  title?: string;
}) {
  return (
    <div className="space-y-4">
      <p className="text-[10px] font-mono font-semibold uppercase tracking-[0.3em] text-muted-foreground">
        {title}
      </p>
      {slices.map((slice) => {
        const orig = slice.originalScore ?? 0;
        const corr = slice.correctedScore ?? orig;
        const lift = corr - orig;
        return (
          <div key={slice.attribute} className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="capitalize text-white">
                {slice.attribute.replace(/_/g, " ")}
              </span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-muted-foreground line-through">
                  {orig.toFixed(0)}%
                </span>
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                <span
                  className="font-mono font-bold"
                  style={{ color: scoreColor(corr) }}
                >
                  {corr.toFixed(0)}%
                </span>
                {lift !== 0 && (
                  <span
                    className={`text-[10px] font-bold ${lift > 0 ? "text-emerald-400" : "text-red-400"}`}
                  >
                    ({lift > 0 ? "+" : ""}
                    {lift.toFixed(1)})
                  </span>
                )}
              </div>
            </div>
            {/* Before bar */}
            <div className="relative h-2 overflow-hidden rounded-full bg-white/5">
              <div
                className="absolute left-0 top-0 h-full rounded-full opacity-40 transition-all duration-500"
                style={{
                  width: `${Math.min(100, orig)}%`,
                  backgroundColor: scoreColor(orig),
                }}
              />
              {/* After bar (overlay) */}
              {slice.correctedScore != null && (
                <div
                  className="absolute left-0 top-0 h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${Math.min(100, corr)}%`,
                    backgroundColor: scoreColor(corr),
                    opacity: 0.9,
                  }}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
