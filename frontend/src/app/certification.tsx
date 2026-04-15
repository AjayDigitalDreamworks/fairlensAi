"use client";

import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { getAnalysis, listAnalyses } from "@/lib/api";
import { getCorrectedScore } from "@/lib/analysis-insights";
import { loadLatestAnalysis, saveAnalysis } from "@/lib/analysis-store";
import type { AnalysisPayload, SensitiveFinding } from "@/types/analysis";
import {
  Award,
  CheckCircle2,
  Clipboard,
  Download,
  FileText,
  Link as LinkIcon,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";

type Criterion = {
  label: string;
  detail: string;
  passed: boolean;
};

export default function CertificationPage() {
  const [analysis, setAnalysis] = useState<AnalysisPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

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

  const certification = useMemo(() => buildCertification(analysis), [analysis]);

  async function copyVerification() {
    if (!certification) return;
    const text = `${certification.id} | ${certification.level} FairSight Certification | ${certification.fileName}`;
    await navigator.clipboard?.writeText(text).catch(() => undefined);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  function downloadBadge() {
    if (!certification) return;
    const svg = buildBadgeSvg(certification.level, certification.id, certification.expiresAt);
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${certification.id}-fairness-badge.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <Layout>
      <div className="space-y-8 pb-12">
        <section className="command-panel p-8">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[10px] font-mono uppercase tracking-[0.3em] text-emerald-300">
                <Award className="h-3.5 w-3.5" />
                Certification
              </div>
              <h1 className="text-3xl font-bold text-white">FairSight Certification Badge</h1>
              <p className="max-w-3xl text-sm leading-7 text-muted-foreground">
                Turn a completed audit into a shareable fairness badge with criteria, report proof, and a verification ID.
              </p>
            </div>
            {certification && (
              <div className="text-right">
                <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">Current Level</p>
                <p className={`mt-2 text-4xl font-bold ${levelColor(certification.level)}`}>{certification.level}</p>
                <p className="mt-1 text-xs text-muted-foreground">{certification.id}</p>
              </div>
            )}
          </div>
        </section>

        {loading ? (
          <div className="command-panel p-8 text-muted-foreground">Loading certification state...</div>
        ) : !analysis || !certification ? (
          <section className="command-panel p-10 text-center">
            <Award className="mx-auto h-12 w-12 text-emerald-400" />
            <h2 className="mt-4 text-xl font-semibold text-white">No certification source found</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-muted-foreground">
              Run one dataset audit to generate the evidence required for a FairSight badge.
            </p>
            <Button asChild className="mt-6 bg-emerald-500 text-black hover:bg-emerald-400">
              <Link to="/analyzer">Run Dataset Audit</Link>
            </Button>
          </section>
        ) : (
          <>
            <section className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
              <div className="command-panel p-8">
                <div className="mx-auto flex aspect-square max-w-[320px] flex-col items-center justify-center rounded-full border border-emerald-500/40 bg-emerald-500/10 p-8 text-center shadow-[0_0_40px_rgba(16,185,129,0.14)]">
                  <ShieldCheck className={`h-14 w-14 ${levelColor(certification.level)}`} />
                  <p className="mt-5 text-sm font-bold uppercase tracking-[0.3em] text-muted-foreground">FairSight AI</p>
                  <p className={`mt-2 text-4xl font-black ${levelColor(certification.level)}`}>{certification.level}</p>
                  <p className="mt-2 text-sm font-semibold text-white">Certified Fair</p>
                  <p className="mt-4 text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Expires {certification.expiresAt}</p>
                </div>
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <Button onClick={downloadBadge} className="bg-emerald-500 text-black hover:bg-emerald-400">
                    <Download className="mr-2 h-4 w-4" />
                    Download Badge
                  </Button>
                  <Button onClick={copyVerification} variant="outline" className="border-white/10 text-white hover:bg-white/5">
                    <Clipboard className="mr-2 h-4 w-4" />
                    {copied ? "Copied" : "Copy Proof"}
                  </Button>
                </div>
              </div>

              <div className="command-panel p-8">
                <div className="mb-6 flex items-center gap-3">
                  <FileText className="h-5 w-5 text-emerald-400" />
                  <div>
                    <h2 className="text-xl font-semibold text-white">Certification Evidence</h2>
                    <p className="mt-1 text-xs uppercase tracking-[0.2em] text-muted-foreground">{certification.fileName}</p>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <MiniStat label="Original Fairness" value={`${certification.originalScore.toFixed(0)}%`} />
                  <MiniStat label="Certified Score" value={`${certification.certifiedScore.toFixed(0)}%`} />
                  <MiniStat label="Disparate Impact" value={certification.disparateImpact.toFixed(3)} />
                  <MiniStat label="DP Gap" value={`${(certification.parityGap * 100).toFixed(1)}%`} />
                </div>

                <div className="mt-6 space-y-3">
                  {certification.criteria.map((item) => (
                    <CriterionRow key={item.label} item={item} />
                  ))}
                </div>

                <div className="mt-6 flex flex-wrap gap-3">
                  <Button asChild variant="outline" className="border-white/10 text-white hover:bg-white/5">
                    <Link to={`/reports?id=${analysis.id}`}>
                      <FileText className="mr-2 h-4 w-4" />
                      Open Audit Report
                    </Link>
                  </Button>
                  <Button asChild variant="outline" className="border-white/10 text-white hover:bg-white/5">
                    <Link to="/compliance">
                      <LinkIcon className="mr-2 h-4 w-4" />
                      Compliance View
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

function buildCertification(analysis: AnalysisPayload | null) {
  if (!analysis) return null;
  const findings = [...(analysis.result?.sensitive_findings ?? []), ...(analysis.result?.intersectional_findings ?? [])];
  const worst = getWorstFinding(findings);
  const originalScore = analysis.result?.fairness_summary?.overall_fairness_score ?? 0;
  const certifiedScore = getCorrectedScore(analysis) ?? originalScore;
  const disparateImpact = worst?.disparate_impact ?? analysis.result?.fairness_summary?.disparate_impact ?? 1;
  const parityGap = worst?.demographic_parity_difference ?? 0;
  const criteria: Criterion[] = [
    {
      label: "Four-fifths rule",
      detail: `Disparate impact ${disparateImpact.toFixed(3)} must be at least 0.800.`,
      passed: disparateImpact >= 0.8,
    },
    {
      label: "Demographic parity",
      detail: `Approval-rate gap ${(parityGap * 100).toFixed(1)}% must be 10% or lower.`,
      passed: parityGap <= 0.1,
    },
    {
      label: "Fairness score",
      detail: `Certified score ${certifiedScore.toFixed(1)}% should be 85% or higher.`,
      passed: certifiedScore >= 85,
    },
    {
      label: "Explainability",
      detail: "Narrative, feature, or plain-language explanation is present.",
      passed: Boolean(analysis.result?.explainability || analysis.result?.explanation?.plain_language?.length),
    },
    {
      label: "Audit documentation",
      detail: "PDF and corrected CSV artifacts are attached to the audit.",
      passed: Boolean(analysis.result?.artifacts?.reportPdfUrl && analysis.result?.artifacts?.correctedCsvUrl),
    },
  ];

  const passCount = criteria.filter((item) => item.passed).length;
  const level = passCount >= 5 ? "Platinum" : passCount >= 4 ? "Gold" : passCount >= 3 ? "Silver" : "Bronze";
  const created = new Date(analysis.createdAt);
  const expires = new Date(created);
  expires.setFullYear(expires.getFullYear() + 1);
  const dateStamp = Number.isNaN(created.getTime()) ? new Date().toISOString().slice(0, 10).replace(/-/g, "") : created.toISOString().slice(0, 10).replace(/-/g, "");

  return {
    id: `FS-${dateStamp}-${analysis.id.slice(0, 6).toUpperCase()}`,
    level,
    fileName: analysis.input?.fileName ?? "FairLens audit",
    originalScore,
    certifiedScore,
    disparateImpact,
    parityGap,
    criteria,
    expiresAt: expires.toISOString().slice(0, 10),
  };
}

function CriterionRow({ item }: { item: Criterion }) {
  const Icon = item.passed ? CheckCircle2 : XCircle;
  return (
    <div className={`border p-4 ${item.passed ? "border-emerald-500/20 bg-emerald-500/10" : "border-amber-500/20 bg-amber-500/10"}`}>
      <div className="flex items-start gap-3">
        <Icon className={`mt-0.5 h-5 w-5 ${item.passed ? "text-emerald-400" : "text-amber-400"}`} />
        <div>
          <p className="text-sm font-semibold text-white">{item.label}</p>
          <p className="mt-1 text-xs leading-6 text-muted-foreground">{item.detail}</p>
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

function levelColor(level: string) {
  if (level === "Platinum") return "text-cyan-300";
  if (level === "Gold") return "text-[#C9A961]";
  if (level === "Silver") return "text-slate-200";
  return "text-amber-500";
}

function buildBadgeSvg(level: string, id: string, expiresAt: string) {
  const fill = level === "Platinum" ? "#67e8f9" : level === "Gold" ? "#C9A961" : level === "Silver" ? "#e2e8f0" : "#f59e0b";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="720" viewBox="0 0 720 720">
  <rect width="720" height="720" fill="#1A1612"/>
  <circle cx="360" cy="360" r="270" fill="${fill}" opacity="0.14" stroke="${fill}" stroke-width="8"/>
  <circle cx="360" cy="360" r="220" fill="none" stroke="${fill}" stroke-width="2" stroke-dasharray="14 10"/>
  <text x="360" y="250" text-anchor="middle" fill="${fill}" font-family="Arial" font-size="36" font-weight="700">FAIRSIGHT AI</text>
  <text x="360" y="345" text-anchor="middle" fill="#ffffff" font-family="Arial" font-size="72" font-weight="900">${level.toUpperCase()}</text>
  <text x="360" y="405" text-anchor="middle" fill="#ffffff" font-family="Arial" font-size="30" font-weight="700">CERTIFIED FAIR</text>
  <text x="360" y="475" text-anchor="middle" fill="${fill}" font-family="Arial" font-size="22">${id}</text>
  <text x="360" y="520" text-anchor="middle" fill="#d6d3d1" font-family="Arial" font-size="20">Expires ${expiresAt}</text>
</svg>`;
}
