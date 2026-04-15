"use client";

import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { getAnalysis, listAnalyses } from "@/lib/api";
import { loadLatestAnalysis, saveAnalysis } from "@/lib/analysis-store";
import type { AnalysisPayload, SensitiveFinding } from "@/types/analysis";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Database,
  FileWarning,
  ShieldCheck,
  Sparkles,
  Upload,
  XCircle,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";

type CheckStatus = "pass" | "warning" | "fail";

type HealthCheck = {
  status: CheckStatus;
  metric: string;
  value: string;
  recommendation: string;
};

export default function PreventionPage() {
  const [analysis, setAnalysis] = useState<AnalysisPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function hydrate() {
      const cached = loadLatestAnalysis();
      try {
        const items = await listAnalyses();
        const latest = items[0] ?? cached ?? null;
        const full = latest ? await getAnalysis(latest.id).catch(() => latest) : null;
        if (!mounted) return;
        setAnalysis(full);
        if (full) saveAnalysis(full);
      } catch {
        if (mounted) setAnalysis(cached);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    hydrate();
    return () => {
      mounted = false;
    };
  }, []);

  const checks = useMemo(() => buildHealthChecks(analysis), [analysis]);
  const score = useMemo(() => {
    if (!checks.length) return 0;
    const points = checks.reduce((sum, check) => sum + (check.status === "pass" ? 2 : check.status === "warning" ? 1 : 0), 0);
    return Math.round((points / (checks.length * 2)) * 100);
  }, [checks]);

  const syntheticRows = useMemo(() => {
    const rows = analysis?.result?.metadata?.rows ?? 0;
    const failCount = checks.filter((check) => check.status === "fail").length;
    const warningCount = checks.filter((check) => check.status === "warning").length;
    return Math.max(250, Math.round(rows * (failCount * 0.18 + warningCount * 0.08)));
  }, [analysis, checks]);

  return (
    <Layout>
      <div className="space-y-8 pb-12">
        <section className="command-panel p-8">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[10px] font-mono uppercase tracking-[0.3em] text-emerald-300">
                <ShieldCheck className="h-3.5 w-3.5" />
                Bias Prevention
              </div>
              <h1 className="text-3xl font-bold text-white">Pre-Training Bias Scanner</h1>
              <p className="max-w-3xl text-sm leading-7 text-muted-foreground">
                Inspect dataset health before a model is trained. FairLens checks representation, proxy risk, sample depth, and release readiness from the latest audit.
              </p>
            </div>
            <div className="score-target-card min-w-[210px] p-5">
              <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">Prevention Score</p>
              <p className={`mt-3 text-4xl font-bold ${score >= 80 ? "text-emerald-400" : score >= 55 ? "text-amber-400" : "text-red-400"}`}>{score}%</p>
              <p className="mt-2 text-xs text-muted-foreground">{analysis ? analysis.input.fileName : "No dataset selected"}</p>
            </div>
          </div>
        </section>

        {loading ? (
          <div className="command-panel p-8 text-muted-foreground">Loading prevention checks...</div>
        ) : !analysis ? (
          <section className="command-panel p-10 text-center">
            <Database className="mx-auto h-10 w-10 text-emerald-400" />
            <h2 className="mt-4 text-xl font-semibold text-white">No audit available</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-muted-foreground">
              Upload a dataset once, then this scanner will turn the audit into pre-training prevention checks.
            </p>
            <Button asChild className="mt-6 bg-emerald-500 text-black hover:bg-emerald-400">
              <Link to="/analyzer">
                <Upload className="mr-2 h-4 w-4" />
                Run Dataset Audit
              </Link>
            </Button>
          </section>
        ) : (
          <>
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MiniStat label="Rows Scanned" value={(analysis.result?.metadata?.rows ?? 0).toLocaleString()} />
              <MiniStat label="Sensitive Fields" value={String(analysis.result?.metadata?.sensitive_columns?.length ?? 0)} />
              <MiniStat label="Proxy Signals" value={String((analysis.result?.root_causes ?? []).filter((cause) => cause.type === "proxy_feature").length)} />
              <MiniStat label="Release Band" value={score >= 80 ? "Ready" : score >= 55 ? "Needs Review" : "Blocked"} />
            </section>

            <section className="command-panel p-8">
              <div className="mb-6 flex items-center gap-3">
                <FileWarning className="h-5 w-5 text-emerald-400" />
                <h2 className="text-xl font-semibold text-white">Dataset Health Checks</h2>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                {checks.map((check) => (
                  <CheckItem key={check.metric} check={check} />
                ))}
              </div>
            </section>

            <section className="command-panel p-8">
              <div className="grid gap-8 lg:grid-cols-[1fr_0.8fr]">
                <div>
                  <div className="mb-4 flex items-center gap-3">
                    <Sparkles className="h-5 w-5 text-emerald-400" />
                    <h2 className="text-xl font-semibold text-white">Auto-Fix Plan</h2>
                  </div>
                  <p className="max-w-3xl text-sm leading-7 text-muted-foreground">
                    FairLens recommends balancing before training: add or synthesize underrepresented examples, review proxy variables, and lock the audit trail before model release.
                  </p>
                  <div className="mt-6 grid gap-3 sm:grid-cols-3">
                    <MiniStat label="Balanced Samples" value={syntheticRows.toLocaleString()} />
                    <MiniStat label="Priority Checks" value={String(checks.filter((check) => check.status !== "pass").length)} />
                    <MiniStat label="Target DI" value="0.80+" />
                  </div>
                </div>
                <div className="border border-emerald-500/20 bg-emerald-500/10 p-6">
                  <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-emerald-300">Next Action</p>
                  <h3 className="mt-3 text-2xl font-semibold text-white">Prevent the bias before retraining</h3>
                  <p className="mt-3 text-sm leading-7 text-muted-foreground">
                    Apply the mitigation preview, regenerate the corrected CSV, then use that corrected dataset as the training input.
                  </p>
                  <Button asChild className="mt-5 w-full bg-emerald-500 text-black hover:bg-emerald-400">
                    <Link to="/mitigation">
                      Open Mitigation Toolkit
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </Layout>
  );
}

function buildHealthChecks(analysis: AnalysisPayload | null): HealthCheck[] {
  if (!analysis) return [];
  const metadata = analysis.result?.metadata;
  const findings = [...(analysis.result?.sensitive_findings ?? []), ...(analysis.result?.intersectional_findings ?? [])];
  const worst = getWorstFinding(findings);
  const proxyFindings = (analysis.result?.root_causes ?? []).filter((cause) => cause.type === "proxy_feature");
  const minGroupCount = getMinGroupCount(worst);
  const disparateImpact = worst?.disparate_impact ?? analysis.result?.fairness_summary?.disparate_impact ?? 1;
  const parityGap = worst?.demographic_parity_difference ?? 0;

  return [
    {
      status: (metadata?.rows ?? 0) >= 1000 ? "pass" : (metadata?.rows ?? 0) >= 200 ? "warning" : "fail",
      metric: "Sample Depth",
      value: `${(metadata?.rows ?? 0).toLocaleString()} rows`,
      recommendation: (metadata?.rows ?? 0) >= 1000 ? "Enough rows for stable subgroup testing." : "Collect more rows before training a high-stakes model.",
    },
    {
      status: (metadata?.sensitive_columns?.length ?? 0) > 0 ? "pass" : "fail",
      metric: "Protected Attribute Coverage",
      value: metadata?.sensitive_columns?.join(", ") || "None detected",
      recommendation: "Keep protected attributes available for audit, then exclude or control them during training as policy requires.",
    },
    {
      status: minGroupCount === null ? "warning" : minGroupCount >= 30 ? "pass" : minGroupCount >= 10 ? "warning" : "fail",
      metric: "Minimum Group Support",
      value: minGroupCount === null ? "Group counts unavailable" : `${minGroupCount.toLocaleString()} rows in smallest group`,
      recommendation: minGroupCount !== null && minGroupCount >= 30 ? "Group sizes are auditable." : "Add examples for the smallest protected group before training.",
    },
    {
      status: disparateImpact >= 0.8 ? "pass" : disparateImpact >= 0.7 ? "warning" : "fail",
      metric: "Four-Fifths Risk",
      value: `Disparate impact ${disparateImpact.toFixed(3)}`,
      recommendation: disparateImpact >= 0.8 ? "Selection-rate ratio is in the compliance band." : "Rebalance labels or apply threshold optimization before deployment.",
    },
    {
      status: parityGap <= 0.1 ? "pass" : parityGap <= 0.2 ? "warning" : "fail",
      metric: "Parity Gap",
      value: `${(parityGap * 100).toFixed(1)}% approval-rate gap`,
      recommendation: parityGap <= 0.1 ? "Parity gap is controlled." : "Reduce group-level approval gaps with reweighing or sampling repair.",
    },
    {
      status: proxyFindings.length === 0 ? "pass" : proxyFindings.length <= 2 ? "warning" : "fail",
      metric: "Proxy Feature Scan",
      value: `${proxyFindings.length} proxy signal${proxyFindings.length === 1 ? "" : "s"} found`,
      recommendation: proxyFindings.length ? "Review correlated features such as geography, education, or experience proxies." : "No material proxy feature was flagged.",
    },
  ];
}

function CheckItem({ check }: { check: HealthCheck }) {
  const Icon = check.status === "pass" ? CheckCircle2 : check.status === "warning" ? AlertTriangle : XCircle;
  const tone =
    check.status === "pass"
      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
      : check.status === "warning"
        ? "border-amber-500/20 bg-amber-500/10 text-amber-300"
        : "border-red-500/20 bg-red-500/10 text-red-300";

  return (
    <div className={`border p-5 ${tone}`}>
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-5 w-5 flex-shrink-0" />
        <div>
          <p className="text-sm font-semibold text-white">{check.metric}</p>
          <p className="mt-1 text-sm">{check.value}</p>
          <p className="mt-3 text-xs leading-6 text-muted-foreground">{check.recommendation}</p>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="terminal-card p-5">
      <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">{label}</p>
      <p className="mt-3 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}

function getWorstFinding(findings: SensitiveFinding[]) {
  return [...findings].sort((left, right) => left.fairness_score - right.fairness_score)[0] ?? null;
}

function getMinGroupCount(finding: SensitiveFinding | null) {
  const counts = (finding?.group_metrics ?? []).map((group) => group.count).filter((count) => typeof count === "number");
  return counts.length ? Math.min(...counts) : null;
}
