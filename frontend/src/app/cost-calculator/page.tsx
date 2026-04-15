"use client";

import Layout from "@/components/Layout";
import { useEffect, useState, useCallback } from "react";
import { getDemoData, calculateROI, formatDollar } from "@/lib/compliance-api";
import { adaptAnalysisToComplianceDemo } from "@/lib/compliance-adapter";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  DollarSign, TrendingDown, TrendingUp, Shield, AlertTriangle,
  ArrowRight, Banknote, Scale, Building2, ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const COLORS = ["#ef4444", "#f59e0b", "#3b82f6", "#8b5cf6"];

function StatCard({ icon: Icon, label, value, subtext, color = "primary", trend }: any) {
  return (
    <div className="card-glow group relative overflow-hidden p-6">
      <div className={`absolute left-0 top-0 h-full w-1 bg-${color === 'red' ? 'red-500' : color === 'green' ? 'emerald-500' : 'primary'}`} />
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-bold text-white">{value}</p>
          {subtext && <p className="mt-1 text-xs text-muted-foreground">{subtext}</p>}
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${
          color === 'red' ? 'bg-red-500/10 text-red-400' :
          color === 'green' ? 'bg-emerald-500/10 text-emerald-400' :
          'bg-primary/10 text-primary'
        }`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      {trend && (
        <div className={`mt-3 flex items-center gap-1 text-xs font-medium ${
          trend > 0 ? 'text-emerald-400' : 'text-red-400'
        }`}>
          {trend > 0 ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
          {Math.abs(trend)}% {trend > 0 ? 'reduction' : 'increase'}
        </div>
      )}
    </div>
  );
}

export default function CostCalculatorPage() {
  const [domain, setDomain] = useState<"credit" | "hiring">("credit");
  const [demoData, setDemoData] = useState<any>(null);
  const [roiData, setRoiData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [portfolioSize, setPortfolioSize] = useState(10000);
  const [avgValue, setAvgValue] = useState(32000);

  const loadData = useCallback(async (d: string) => {
    setLoading(true);
    try {
      const { listAnalyses } = await import("@/lib/api");
      const history = await listAnalyses();
      let demoDataMerged = null;

      if (history && history.length > 0) {
          demoDataMerged = adaptAnalysisToComplianceDemo(history[0], d);
      }

      // If DB fails to provide anything (e.g., initial load with no models), use our standard demo data route
      const demo = demoDataMerged || await getDemoData(d);
      setDemoData(demo);

      const roi = await calculateROI({
        domain: d,
        portfolio_size: portfolioSize,
        avg_transaction_value: d === "hiring" ? 85000 : avgValue,
        before_severity: demo?.violations?.overall_status === "COMPLIANT" ? "low" : "high",
        after_severity: "low",
        disparate_impact_before: demo?.metrics?.disparate_impact ?? 0.72,
        disparate_impact_after: 0.88,
        dpd_before: demo?.metrics?.dpd ?? 0.18,
        dpd_after: 0.04,
        eod_before: demo?.metrics?.eod ?? 0.15,
        eod_after: 0.05,
        fairness_score_before: demo?.metrics?.fairness_score ?? 68,
        fairness_score_after: 91,
      });

      // If we have actual DB models that returned cost_exposure, inject it
      if (demoDataMerged?.cost_exposure) {
          demo.cost_exposure = demoDataMerged.cost_exposure;
      } else {
          // Sync demo cost_exposure mapping to whatever ROI spits out for consistency in UI
          demo.cost_exposure = {
               total_annual_exposure: roi.before.total_exposure,
               litigation_risk: { expected_cost: roi.before.breakdown.litigation, probability: 0.55 },
               regulatory_fines: { expected_fine: roi.before.breakdown.regulatory },
               reputation_damage: { estimated_revenue_loss: roi.before.breakdown.reputation, churn_rate: 0.07 },
               opportunity_cost: { estimated_loss: roi.before.breakdown.opportunity, missed_qualified_applicants: 360 },
          };
      }

      // Check if mitigating the model actually saved ROI
      if (demoDataMerged?.roi_projection) {
          setRoiData(demoDataMerged.roi_projection);
      } else {
          setRoiData(roi);
      }
    } catch (err) {
      console.error("Failed to load demo data:", err);
      // Use embedded fallback data
      setDemoData({
        cost_exposure: {
          total_annual_exposure: 2340000,
          litigation_risk: { expected_cost: 825000, probability: 0.55 },
          regulatory_fines: { expected_fine: 650000 },
          reputation_damage: { estimated_revenue_loss: 560000, churn_rate: 0.07 },
          opportunity_cost: { estimated_loss: 305000, missed_qualified_applicants: 360 },
        },
        metrics: { disparate_impact: 0.72, dpd: 0.18, eod: 0.15, fairness_score: 68, accuracy: 0.87 },
        violations: { violations_found: 3, compliance_rate: 40, violations: [
          { regulation: "ECOA", violation_type: "Disparate Impact", severity: "HIGH", description: "Selection rate ratio (0.720) falls below the 4/5ths (80%) threshold" },
          { regulation: "ECOA", violation_type: "Demographic Parity Disparity", severity: "MODERATE", description: "Approval rate difference (0.1800) exceeds 10% threshold" },
          { regulation: "FCRA", violation_type: "Equalized Odds Violation", severity: "MODERATE", description: "Error rates differ significantly across groups" },
        ]},
        roi_projection: {
          before: { total_exposure: 2340000, fairness_score: 68 },
          after: { total_exposure: 180000, fairness_score: 91 },
          savings: { total_annual_savings: 2160000, percentage_reduction: 92.3, fairness_improvement: 23 },
        },
      });
      setRoiData({
        before: { total_exposure: 2340000, fairness_score: 68, breakdown: { litigation: 825000, regulatory: 650000, reputation: 560000, opportunity: 305000 } },
        after: { total_exposure: 180000, fairness_score: 91, breakdown: { litigation: 45000, regulatory: 52000, reputation: 48000, opportunity: 35000 } },
        savings: { total_annual_savings: 2160000, percentage_reduction: 92.3, fairness_improvement: 23 },
      });
    } finally {
      setLoading(false);
    }
  }, [portfolioSize, avgValue]);

  useEffect(() => { loadData(domain); }, [domain, loadData]);

  const cost = demoData?.cost_exposure;
  const roi = roiData || demoData?.roi_projection;

  const pieData = cost ? [
    { name: "Litigation", value: cost.litigation_risk?.expected_cost || 0 },
    { name: "Regulatory Fines", value: cost.regulatory_fines?.expected_fine || 0 },
    { name: "Reputation", value: cost.reputation_damage?.estimated_revenue_loss || 0 },
    { name: "Opportunity Cost", value: cost.opportunity_cost?.estimated_loss || 0 },
  ] : [];

  const roiBarData = roi ? [
    { name: "Before Mitigation", value: roi.before?.total_exposure || 0, fill: "#ef4444" },
    { name: "After Mitigation", value: roi.after?.total_exposure || 0, fill: "#10b981" },
  ] : [];

  const breakdownData = roi ? [
    { category: "Litigation", before: roi.before?.breakdown?.litigation || 0, after: roi.after?.breakdown?.litigation || 0 },
    { category: "Regulatory", before: roi.before?.breakdown?.regulatory || 0, after: roi.after?.breakdown?.regulatory || 0 },
    { category: "Reputation", before: roi.before?.breakdown?.reputation || 0, after: roi.after?.breakdown?.reputation || 0 },
    { category: "Opportunity", before: roi.before?.breakdown?.opportunity || 0, after: roi.after?.breakdown?.opportunity || 0 },
  ] : [];

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center space-y-4">
            <div className="h-12 w-12 mx-auto border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-muted-foreground text-sm">Loading cost analysis...</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="relative space-y-8 pb-10">
        {/* Header */}
        <div className="card-glow group relative overflow-hidden p-8">
          <div className="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-red-500 via-amber-500 to-emerald-500" />
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-500/10">
                  <DollarSign className="h-6 w-6 text-red-400" />
                </div>
                <h1 className="font-sans text-3xl font-bold tracking-tight text-white">
                  Bias Cost Calculator
                </h1>
              </div>
              <p className="text-sm text-muted-foreground max-w-2xl">
                Translate fairness metrics into dollar-denominated risk exposure. See litigation costs, regulatory fines,
                reputation damage, and ROI of bias mitigation — all mapped to real ECOA/EEOC precedent data.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => setDomain("credit")}
                className={`gap-2 ${domain === "credit" ? "bg-primary text-black" : "bg-white/5 text-white border border-white/10 hover:bg-white/10"}`}
              >
                <Banknote className="h-4 w-4" /> Financial Credit
              </Button>
              <Button
                onClick={() => setDomain("hiring")}
                className={`gap-2 ${domain === "hiring" ? "bg-primary text-black" : "bg-white/5 text-white border border-white/10 hover:bg-white/10"}`}
              >
                <Building2 className="h-4 w-4" /> Hiring
              </Button>
            </div>
          </div>
        </div>

        {/* Scenario Banner */}
        <div className="card-glow p-4 border-l-4 border-amber-500">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-white">{demoData?.scenario || "AI Model Under Audit"}</p>
              <p className="text-xs text-muted-foreground">{demoData?.description || "Analyzing bias impact"}</p>
            </div>
          </div>
        </div>

        {/* Top-Level Cost Stats */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icon={DollarSign}
            label="Total Annual Exposure"
            value={formatDollar(cost?.total_annual_exposure || 0)}
            subtext="Based on current bias levels"
            color="red"
          />
          <StatCard
            icon={Scale}
            label="Litigation Risk"
            value={formatDollar(cost?.litigation_risk?.expected_cost || 0)}
            subtext={`${((cost?.litigation_risk?.probability || 0) * 100).toFixed(0)}% probability`}
            color="red"
          />
          <StatCard
            icon={Shield}
            label="After Mitigation"
            value={formatDollar(roi?.after?.total_exposure || 0)}
            subtext="Projected with corrections"
            color="green"
          />
          <StatCard
            icon={TrendingDown}
            label="Annual Savings"
            value={formatDollar(roi?.savings?.total_annual_savings || 0)}
            subtext={`${roi?.savings?.percentage_reduction || 0}% risk reduction`}
            color="green"
            trend={roi?.savings?.percentage_reduction}
          />
        </div>

        {/* ROI Before/After */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Before vs After Chart */}
          <div className="card-glow p-6">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-white mb-1">ROI: Before vs After Mitigation</h3>
            <p className="text-xs text-muted-foreground mb-6">Total annual risk exposure comparison</p>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-center">
                <p className="text-xs text-red-400 font-semibold uppercase">Before</p>
                <p className="text-2xl font-bold text-red-400 mt-1">{formatDollar(roi?.before?.total_exposure || 0)}</p>
                <p className="text-xs text-muted-foreground mt-1">Fairness: {roi?.before?.fairness_score || 68}%</p>
              </div>
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4 text-center">
                <p className="text-xs text-emerald-400 font-semibold uppercase">After</p>
                <p className="text-2xl font-bold text-emerald-400 mt-1">{formatDollar(roi?.after?.total_exposure || 0)}</p>
                <p className="text-xs text-muted-foreground mt-1">Fairness: {roi?.after?.fairness_score || 91}%</p>
              </div>
            </div>

            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={roiBarData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.03)" />
                  <XAxis dataKey="name" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}K`} />
                  <Tooltip formatter={(v: number) => [`$${v.toLocaleString()}`, "Exposure"]} contentStyle={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }} />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {roiBarData.map((entry: any, i: number) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Cost Breakdown Pie */}
          <div className="card-glow p-6">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-white mb-1">Cost Breakdown</h3>
            <p className="text-xs text-muted-foreground mb-6">Where your bias exposure comes from</p>
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={4}
                    dataKey="value"
                    label={({ name, value }: any) => `${name}: ${formatDollar(value)}`}
                  >
                    {pieData.map((_: any, i: number) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => `$${v.toLocaleString()}`} contentStyle={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Detailed Breakdown Comparison */}
        <div className="card-glow p-6">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-white mb-1">Category-by-Category Impact</h3>
          <p className="text-xs text-muted-foreground mb-6">Before vs after mitigation by cost category</p>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={breakdownData} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.03)" />
                <XAxis dataKey="category" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}K`} />
                <Tooltip formatter={(v: number) => `$${v.toLocaleString()}`} contentStyle={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }} />
                <Bar dataKey="before" name="Before" fill="#ef4444" radius={[4, 4, 0, 0]} />
                <Bar dataKey="after" name="After" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Regulatory Violations */}
        {demoData?.violations?.violations?.length > 0 && (
          <div className="card-glow p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-white">Regulatory Violations Detected</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  {demoData.violations.violations_found} violation(s) — Compliance rate: {demoData.violations.compliance_rate}%
                </p>
              </div>
              <div className={`px-3 py-1 rounded-full text-xs font-bold ${
                demoData.violations.compliance_rate >= 80 ? 'bg-emerald-500/10 text-emerald-400' :
                demoData.violations.compliance_rate >= 50 ? 'bg-amber-500/10 text-amber-400' :
                'bg-red-500/10 text-red-400'
              }`}>
                {demoData.violations.overall_status || "NON-COMPLIANT"}
              </div>
            </div>
            <div className="space-y-3">
              {demoData.violations.violations.map((v: any, i: number) => (
                <div key={i} className="rounded-lg border border-white/5 bg-black/30 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className={`h-5 w-5 mt-0.5 shrink-0 ${
                        v.severity === "CRITICAL" || v.severity === "HIGH" ? "text-red-400" : "text-amber-400"
                      }`} />
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-bold text-primary">{v.regulation}</span>
                          {v.section && <span className="text-[10px] text-muted-foreground font-mono">§ {v.section}</span>}
                        </div>
                        <p className="text-sm font-medium text-white">{v.violation_type}</p>
                        <p className="text-xs text-muted-foreground mt-1">{v.description}</p>
                        {v.remediation && (
                          <p className="text-xs text-primary/80 mt-2 flex items-start gap-1">
                            <ArrowRight className="h-3 w-3 mt-0.5 shrink-0" />
                            {v.remediation}
                          </p>
                        )}
                      </div>
                    </div>
                    <span className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      v.severity === "CRITICAL" ? "bg-red-500/20 text-red-400" :
                      v.severity === "HIGH" ? "bg-red-500/10 text-red-400" :
                      v.severity === "MODERATE" ? "bg-amber-500/10 text-amber-400" :
                      "bg-blue-500/10 text-blue-400"
                    }`}>
                      {v.severity}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Portfolio Size Configurator */}
        <div className="card-glow p-6">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-white mb-4">Configure Your Portfolio</h3>
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <label className="block text-xs text-muted-foreground mb-2">Portfolio Size (decisions/year)</label>
              <input
                type="range"
                min={1000}
                max={100000}
                step={1000}
                value={portfolioSize}
                onChange={(e) => setPortfolioSize(Number(e.target.value))}
                className="w-full accent-primary"
              />
              <p className="text-sm font-bold text-white mt-1">{portfolioSize.toLocaleString()} decisions</p>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-2">Avg Transaction Value ($)</label>
              <input
                type="range"
                min={5000}
                max={250000}
                step={5000}
                value={avgValue}
                onChange={(e) => setAvgValue(Number(e.target.value))}
                className="w-full accent-primary"
              />
              <p className="text-sm font-bold text-white mt-1">${avgValue.toLocaleString()}</p>
            </div>
          </div>
          <Button
            onClick={() => loadData(domain)}
            className="mt-4 bg-primary text-black hover:bg-primary/90"
          >
            Recalculate Exposure
          </Button>
        </div>
      </div>
    </Layout>
  );
}
