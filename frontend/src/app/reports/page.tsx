"use client";

import Layout from "@/components/Layout";
import { ELI5ModeToggle } from "@/components/ELI5Tooltip";
import { Button } from "@/components/ui/button";
import {
  deleteAnalysis as deleteAnalysisRequest,
  getCorrectedCsvUrl,
  getPdfReportUrl,
  listAnalyses,
} from "@/lib/api";
import {
  loadAnalysisHistory,
  loadLatestAnalysis,
  removeAnalysis as removeStoredAnalysis,
  saveAnalysis,
} from "@/lib/analysis-store";
import { AnalysisPayload } from "@/types/analysis";
import {
  AlertCircle,
  ChevronRight,
  ClipboardList,
  Download,
  Eye,
  FileText,
  Filter,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

type FilterMode = "all" | "high-risk" | "target-met" | "mitigated";

export default function ReportsPage() {
  const [searchParams] = useSearchParams();
  const urlId = searchParams.get("id");
  const [analyses, setAnalyses] = useState<AnalysisPayload[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<string[]>([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [eli5Mode, setEli5Mode] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function hydrate() {
      const cached = loadLatestAnalysis();
      const cachedHistory = loadAnalysisHistory();

      try {
        const items = await listAnalyses();
        if (!mounted) return;

        const next = items.length ? items : cachedHistory;
        const preferred =
          (urlId ? next.find((item) => item.id === urlId) : null) ??
          (cached ? next.find((item) => item.id === cached.id) : null) ??
          next[0] ??
          null;

        setAnalyses(next);
        setActiveId(preferred?.id ?? null);
        setError(items.length ? null : cachedHistory.length ? "Live archive is empty, showing cached reports." : null);

        if (preferred) saveAnalysis(preferred);
      } catch {
        if (!mounted) return;
        setAnalyses(cachedHistory);
        setActiveId(cached?.id ?? cachedHistory[0]?.id ?? null);
        setError(
          cachedHistory.length
            ? "Live archive is unavailable, showing cached report history."
            : "No report archive is available yet. Run an audit from the Analyzer page first.",
        );
      } finally {
        if (mounted) setLoading(false);
      }
    }

    hydrate();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    setSelectedIds((current) => current.filter((id) => analyses.some((item) => item.id === id)));

    if (!analyses.length) {
      setActiveId(null);
      return;
    }

    if (!activeId || !analyses.some((item) => item.id === activeId)) {
      setActiveId(analyses[0].id);
    }
  }, [activeId, analyses]);

  const activeAnalysis = useMemo(
    () => analyses.find((item) => item.id === activeId) ?? analyses[0] ?? null,
    [activeId, analyses],
  );

  const filteredReports = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return analyses.filter((report) => {
      const haystack = [
        report.input.fileName,
        report.result?.metadata?.domain ?? "",
        report.id,
        report.result?.metadata?.sensitive_columns?.join(" ") ?? "",
      ]
        .join(" ")
        .toLowerCase();

      if (query && !haystack.includes(query)) return false;
      if (filterMode === "high-risk") return report.result?.fairness_summary?.risk_level === "high";
      if (filterMode === "target-met") return isTargetMet(report);
      if (filterMode === "mitigated") return Boolean(report.mitigationPreview);
      return true;
    });
  }, [analyses, filterMode, searchTerm]);

  const allVisibleSelected = filteredReports.length > 0 && filteredReports.every((report) => selectedIds.includes(report.id));
  const selectedReports = analyses.filter((report) => selectedIds.includes(report.id));

  const reportStats = useMemo(() => {
    const now = new Date();
    const monthlyCount = analyses.filter((report) => {
      const created = new Date(report.createdAt);
      return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
    }).length;

    const averageBias = analyses.length
      ? analyses.reduce((sum, report) => sum + getBiasSignal(report), 0) / analyses.length
      : 0;

    const averageCompliance = analyses.length
      ? analyses.reduce((sum, report) => sum + (getCorrectedScore(report) ?? report.result?.fairness_summary?.overall_fairness_score ?? 0), 0) / analyses.length
      : 0;

    return [
      { label: "Total Reports", value: String(analyses.length).padStart(2, "0") },
      { label: "This Month", value: String(monthlyCount).padStart(2, "0") },
      { label: "Avg Bias Score", value: `${formatMetric(averageBias)}%` },
      { label: "Avg Compliance", value: `${formatMetric(averageCompliance)}%` },
    ];
  }, [analyses]);

  const activeSummary = activeAnalysis?.result?.explanation?.executive_summary ?? "Select an audit record to inspect its report details.";
  const activeGeminiSummary = activeAnalysis?.result?.explanation?.gemini_interpretation?.text ?? "";
  const anomalyFindings = activeAnalysis ? buildAnomalyFindings(activeAnalysis) : [];
  const correctiveProtocols = activeAnalysis ? buildCorrectiveProtocols(activeAnalysis) : [];

  function inspectReport(report: AnalysisPayload) {
    setActiveId(report.id);
    saveAnalysis(report);
  }

  function toggleReportSelection(reportId: string) {
    setSelectedIds((current) =>
      current.includes(reportId) ? current.filter((id) => id !== reportId) : [...current, reportId],
    );
  }

  function toggleVisibleSelection() {
    if (!filteredReports.length) return;

    if (allVisibleSelected) {
      const visibleIds = new Set(filteredReports.map((report) => report.id));
      setSelectedIds((current) => current.filter((id) => !visibleIds.has(id)));
      return;
    }

    const next = new Set(selectedIds);
    filteredReports.forEach((report) => next.add(report.id));
    setSelectedIds(Array.from(next));
  }

  async function handleDelete(ids: string[]) {
    if (!ids.length) return;
    if (!window.confirm(ids.length === 1 ? "Delete this audit report from the archive?" : `Delete ${ids.length} audit reports from the archive?`)) {
      return;
    }

    setError(null);
    setBusyIds((current) => Array.from(new Set([...current, ...ids])));
    if (ids.length > 1) setBulkDeleting(true);

    try {
      await Promise.all(ids.map((id) => deleteAnalysisRequest(id)));
      setAnalyses((current) => {
        const remaining = current.filter((report) => !ids.includes(report.id));
        const nextActiveId = activeId && ids.includes(activeId) ? remaining[0]?.id ?? null : activeId;
        setActiveId(nextActiveId);
        if (nextActiveId) {
          const nextActive = remaining.find((report) => report.id === nextActiveId) ?? remaining[0];
          if (nextActive) saveAnalysis(nextActive);
        }
        return remaining;
      });
      ids.forEach((id) => removeStoredAnalysis(id));
      setSelectedIds((current) => current.filter((id) => !ids.includes(id)));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete the selected archive entries.");
    } finally {
      setBusyIds((current) => current.filter((id) => !ids.includes(id)));
      setBulkDeleting(false);
    }
  }

  function handleBulkDownload() {
    const targets = selectedReports.length ? selectedReports : filteredReports;
    targets.forEach((report) => triggerBrowserDownload(getPdfReportUrl(report.id)));
  }

  function handleContextExport() {
    const targets = selectedReports.length ? selectedReports : filteredReports;
    if (!targets.length) return;

    const header = [
      "report_id",
      "file_name",
      "domain",
      "created_at",
      "protocol_type",
      "risk_level",
      "bias_signal",
      "original_fairness",
      "corrected_fairness",
      "rows",
      "target_met",
    ];

    const lines = targets.map((report) => [
      report.id,
      report.input.fileName,
      report.result?.metadata?.domain ?? "unknown",
      report.createdAt,
      getProtocolType(report),
      report.result?.fairness_summary?.risk_level ?? "unknown",
      getBiasSignal(report).toFixed(2),
      (report.result?.fairness_summary?.overall_fairness_score ?? 0).toFixed(2),
      String(getCorrectedScore(report) ?? ""),
      String(report.result?.metadata?.rows ?? 0),
      isTargetMet(report) ? "yes" : "no",
    ]);

    downloadBlob(
      [header, ...lines].map((row) => row.map(csvEscape).join(",")).join("\n"),
      `fairlens-audit-report-${new Date().toISOString().slice(0, 10)}.csv`,
      "text/csv;charset=utf-8",
    );
  }

  return (
    <Layout>
      <div className="relative space-y-8 overflow-hidden pb-12">
        <div className="pointer-events-none absolute right-0 top-0 h-96 w-96 bg-emerald-500/5 blur-[120px]" />

        <div className="card-glow relative overflow-hidden p-8">
          <div className="absolute left-0 top-0 h-full w-1 bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.5)]" />
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <h1 className="mb-2 font-sans text-3xl font-bold tracking-tight text-white">
                {eli5Mode ? "My Dataset Audit History" : "Audit History & Reports"}
              </h1>
              <p className="text-sm text-muted-foreground">
                {eli5Mode
                  ? "Every time you checked a dataset for bias, the results were saved here. You can download reports and corrected data anytime."
                  : "Access, download, and manage your audit report archive."
                }
              </p>
            </div>

            <div className="flex flex-col items-end gap-3">
              <ELI5ModeToggle enabled={eli5Mode} onToggle={() => setEli5Mode((v) => !v)} />
              {activeAnalysis && !loading && (
                <div className="flex flex-wrap gap-3">
                  <Button
                    className="h-auto rounded-none bg-emerald-500 px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-black hover:bg-emerald-400"
                    onClick={() => triggerBrowserDownload(getPdfReportUrl(activeAnalysis.id))}
                  >
                    <Download className="mr-3 h-4 w-4" />
                    {eli5Mode ? "Download Report" : "Audit PDF"}
                  </Button>
                  <Button
                    variant="outline"
                    className="h-auto rounded-none border-white/5 bg-white/5 px-6 py-3 font-mono text-[10px] uppercase tracking-widest text-white hover:bg-white/10"
                    onClick={() => triggerBrowserDownload(getCorrectedCsvUrl(activeAnalysis.id))}
                  >
                    <FileText className="mr-3 h-4 w-4" />
                    {eli5Mode ? "Download Fixed Data" : "Corrected CSV"}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div className="card-glow flex items-start gap-3 border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-100">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-400" />
            <p>{error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {reportStats.map((stat) => (
            <div key={stat.label} className="card-glow space-y-1 border-white/5 p-6 transition-all hover:border-emerald-500/30">
              <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">{stat.label}</p>
              <p className="font-mono text-3xl font-black tracking-tight text-white drop-shadow-[0_0_10px_rgba(16,185,129,0.2)]">
                {stat.value}
              </p>
            </div>
          ))}
        </div>

        <div className="space-y-4">
          <div className="flex flex-col gap-4 md:flex-row">
            <div className="group relative flex-1">
              <Search className="absolute left-4 top-3.5 h-4 w-4 text-emerald-500 transition-colors group-focus-within:text-emerald-400" />
              <input
                type="text"
                placeholder="Search by filename, domain, or ID..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="w-full rounded-none border border-white/5 bg-black/40 py-3 pl-12 pr-4 text-sm text-white placeholder:text-muted-foreground focus:border-emerald-500/50 focus:outline-none"
              />
            </div>

            <div className="relative min-w-[220px]">
              <Filter className="pointer-events-none absolute left-4 top-3.5 h-4 w-4 text-emerald-500" />
              <select
                value={filterMode}
                onChange={(event) => setFilterMode(event.target.value as FilterMode)}
                className="h-full w-full appearance-none rounded-none border border-white/5 bg-white/2 py-3 pl-12 pr-10 font-mono text-[10px] uppercase tracking-widest text-white hover:border-emerald-500/30 focus:border-emerald-500/50 focus:outline-none"
              >
                <option value="all" className="bg-slate-950 text-white">All Reports</option>
                <option value="high-risk" className="bg-slate-950 text-white">High Risk</option>
                <option value="target-met" className="bg-slate-950 text-white">Target Met</option>
                <option value="mitigated" className="bg-slate-950 text-white">Mitigated</option>
              </select>
            </div>
          </div>

          <p className="text-[10px] font-mono uppercase tracking-[0.24em] text-muted-foreground">
            Showing {filteredReports.length} of {analyses.length} archived audits
            {selectedReports.length ? ` | ${selectedReports.length} selected` : ""}
          </p>
        </div>

        <div className="card-glow relative overflow-hidden border-emerald-500/20">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-white/5 bg-white/2">
                  <th className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleVisibleSelection}
                        className="h-4 w-4 cursor-pointer accent-emerald-500"
                        aria-label="Select all visible reports"
                      />
                      <span>File Name</span>
                    </div>
                  </th>
                  <th className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Type</th>
                  <th className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Date</th>
                  <th className="px-6 py-5 text-center text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Bias Score</th>
                  <th className="px-6 py-5 text-center text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Rows</th>
                  <th className="px-6 py-5 text-center text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center text-sm text-muted-foreground">Loading report archive...</td>
                  </tr>
                ) : filteredReports.length ? (
                  filteredReports.map((report) => {
                    const isActive = report.id === activeAnalysis?.id;
                    const isBusy = busyIds.includes(report.id);
                    const biasSignal = getBiasSignal(report);

                    return (
                      <tr
                        key={report.id}
                        onClick={() => inspectReport(report)}
                        className={`group cursor-pointer text-[11px] transition-all ${isActive ? "bg-emerald-500/8" : "hover:bg-emerald-500/5"}`}
                      >
                        <td className="px-6 py-5">
                          <div className="flex items-start gap-4">
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(report.id)}
                              onChange={() => toggleReportSelection(report.id)}
                              onClick={(event) => event.stopPropagation()}
                              className="mt-1 h-4 w-4 cursor-pointer accent-emerald-500"
                              aria-label={`Select ${report.input.fileName}`}
                            />
                            <div className="space-y-1">
                              <p className="font-bold uppercase tracking-wide text-white transition-colors group-hover:text-emerald-400">
                                {report.input.fileName.replace(/\.[^.]+$/, "")}
                              </p>
                              <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
                                {report.result?.metadata?.domain ?? "unknown"} | {report.id.slice(0, 8)}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <span className="border border-white/5 bg-white/5 px-3 py-1 text-[9px] font-black uppercase text-muted-foreground transition-colors group-hover:text-white">
                            {getProtocolType(report).toUpperCase()}
                          </span>
                        </td>
                        <td className="px-6 py-5 font-mono tracking-tighter text-muted-foreground opacity-70">
                          {formatRelativeTimestamp(report.createdAt)}
                        </td>
                        <td className="px-6 py-5">
                          <div className="flex justify-center">
                            <span className={`border px-3 py-1.5 font-mono text-[10px] font-black ${getBiasColor(biasSignal)}`}>
                              {formatMetric(biasSignal)}%
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-5 text-center font-mono text-muted-foreground opacity-70">
                          {formatDensity(report.result?.metadata?.rows ?? 0)}
                        </td>
                        <td className="px-6 py-5">
                          <div className="flex items-center justify-center gap-3">
                            <button
                              className="rounded-none border border-white/5 bg-white/2 p-2 text-emerald-400 transition hover:bg-emerald-500/10 hover:text-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
                              onClick={(event) => {
                                event.stopPropagation();
                                inspectReport(report);
                              }}
                              disabled={isBusy || bulkDeleting}
                              aria-label={`View ${report.input.fileName}`}
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            <button
                              className="rounded-none border border-white/5 bg-white/2 p-2 text-teal-400 transition hover:bg-teal-500/10 hover:text-teal-300 disabled:cursor-not-allowed disabled:opacity-40"
                              onClick={(event) => {
                                event.stopPropagation();
                                triggerBrowserDownload(getPdfReportUrl(report.id));
                              }}
                              disabled={isBusy || bulkDeleting}
                              aria-label={`Download report for ${report.input.fileName}`}
                            >
                              <Download className="h-4 w-4" />
                            </button>
                            <button
                              className="rounded-none border border-white/5 bg-white/2 p-2 text-muted-foreground transition hover:bg-red-500/10 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-40"
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleDelete([report.id]);
                              }}
                              disabled={isBusy || bulkDeleting}
                              aria-label={`Delete ${report.input.fileName}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center text-sm text-muted-foreground">
                      No reports match your current search or filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card-glow relative overflow-hidden border-teal-500/20 bg-gradient-to-br from-emerald-500/5 to-teal-500/5 p-10">
          <div className="pointer-events-none absolute right-0 top-0 h-64 w-64 bg-emerald-500/5 blur-[100px]" />
          <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
            <h2 className="flex items-center gap-3 text-sm font-bold uppercase tracking-[0.3em] text-white">
              <ClipboardList className="h-5 w-5 text-emerald-400" />
              Report Summary
            </h2>
            {activeAnalysis && (
              <div className="flex flex-wrap items-center gap-3 text-[10px] font-mono uppercase tracking-[0.24em] text-muted-foreground">
                <span>Original {formatMetric(activeAnalysis.result?.fairness_summary?.overall_fairness_score ?? 0)}%</span>
                <span className="text-emerald-300">
                  Corrected {formatMetric(getCorrectedScore(activeAnalysis) ?? activeAnalysis.result?.fairness_summary?.overall_fairness_score ?? 0)}%
                </span>
              </div>
            )}
          </div>

          <div className="grid gap-6 font-mono text-[11px] leading-relaxed md:grid-cols-3">
            <div className="space-y-4 border border-white/5 bg-black/40 p-6 transition-all hover:border-emerald-500/20">
              <h3 className="flex items-center gap-2 font-bold uppercase tracking-widest text-white">
                <FileText className="h-3 w-3 text-emerald-500" />
                Executive Summary
              </h3>
              <p className="text-muted-foreground opacity-80">{activeSummary}</p>
            </div>

            <div className="space-y-4 border border-cyan-500/20 bg-cyan-500/5 p-6 transition-all hover:border-cyan-400/30">
              <h3 className="flex items-center gap-2 font-bold uppercase tracking-widest text-white">
                <Eye className="h-3 w-3 text-cyan-300" />
                Narrative Interpretation
              </h3>
              <p className="whitespace-pre-wrap text-sm leading-7 text-muted-foreground opacity-90">
                {activeGeminiSummary || "Generate a narrative interpretation from the Explainability page to see the plain-language audit explanation here."}
              </p>
            </div>

            <div className="space-y-4 border border-white/5 bg-black/40 p-6 transition-all hover:border-emerald-500/20">
              <h3 className="flex items-center gap-2 font-bold uppercase tracking-widest text-white">
                <ShieldCheck className="h-3 w-3 text-emerald-500" />
                Key Findings
              </h3>
              <ul className="space-y-3">
                {anomalyFindings.length ? (
                  anomalyFindings.map((item) => (
                    <li key={item} className="flex items-start gap-3 text-muted-foreground opacity-80">
                      <ChevronRight className="mt-0.5 h-3 w-3 flex-shrink-0 text-emerald-500" />
                      {item}
                    </li>
                  ))
                ) : (
                  <li className="text-muted-foreground opacity-80">No anomaly findings are available for this report.</li>
                )}
              </ul>
            </div>

            <div className="space-y-4 border border-white/5 bg-black/40 p-6 transition-all hover:border-emerald-500/20">
              <h3 className="flex items-center gap-2 font-bold uppercase tracking-widest text-white">
                <RefreshCw className="h-3 w-3 text-emerald-500" />
                Recommendations
              </h3>
              <ul className="space-y-3">
                {correctiveProtocols.length ? (
                  correctiveProtocols.map((item) => (
                    <li key={item} className="flex items-start gap-3 text-muted-foreground opacity-80">
                      <ChevronRight className="mt-0.5 h-3 w-3 flex-shrink-0 text-teal-500" />
                      {item}
                    </li>
                  ))
                ) : (
                  <li className="text-muted-foreground opacity-80">No recommendations available for this report.</li>
                )}
              </ul>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-4">
          <Button
            className="h-auto rounded-none bg-emerald-500 px-8 py-8 text-[10px] font-bold uppercase tracking-widest text-black shadow-[0_0_20px_rgba(16,185,129,0.2)] hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
            onClick={handleBulkDownload}
            disabled={!filteredReports.length}
          >
            <Download className="mr-3 h-4 w-4" />
            Download All Reports
          </Button>
          <Button
            variant="outline"
            className="h-auto rounded-none border-white/5 bg-white/5 px-8 py-8 font-mono text-[10px] uppercase tracking-widest text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
            onClick={handleContextExport}
            disabled={!filteredReports.length}
          >
            <FileText className="mr-3 h-4 w-4" />
            Export Context (CSV)
          </Button>
          <Button
            variant="outline"
            className="h-auto rounded-none border border-red-500/10 px-8 py-8 font-mono text-[10px] uppercase tracking-widest text-red-400 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() => void handleDelete(selectedReports.map((report) => report.id))}
            disabled={!selectedReports.length || bulkDeleting}
          >
            <Trash className="mr-3 h-4 w-4" />
            {bulkDeleting ? "Deleting..." : `Delete Selected${selectedReports.length ? ` (${selectedReports.length})` : ""}`}
          </Button>
        </div>
      </div>
    </Layout>
  );
}

function getCorrectedScore(report: AnalysisPayload) {
  return report.result?.artifacts?.corrected_fairness_summary?.overall_fairness_score ?? report.result?.fairness_summary?.corrected_fairness_score ?? null;
}

function getBiasSignal(report: AnalysisPayload) {
  return Math.max(0, 100 - (report.result?.fairness_summary?.overall_fairness_score ?? 100));
}

function getProtocolType(report: AnalysisPayload) {
  if (report.mitigationPreview) return "Mitigation Report";
  if (isTargetMet(report)) return "Compliance Report";
  if (report.result?.metadata?.prediction_column) return "Model Evaluation";
  return "Dataset Analysis";
}

function getBiasColor(score: number) {
  if (score < 20) return "border-emerald-500/20 bg-emerald-500/10 text-emerald-400";
  if (score < 40) return "border-teal-500/20 bg-teal-500/10 text-teal-400";
  return "border-yellow-500/20 bg-yellow-500/10 text-yellow-400";
}

function isTargetMet(report: AnalysisPayload) {
  const correctedScore = getCorrectedScore(report);
  return typeof correctedScore === "number" ? correctedScore >= 95 : (report.result?.fairness_summary?.overall_fairness_score ?? 0) >= 95;
}

function buildAnomalyFindings(report: AnalysisPayload) {
  const findings = [...(report.result?.sensitive_findings ?? [])]
    .sort((left, right) => left.fairness_score - right.fairness_score)
    .map(
      (finding) =>
        `${finding.sensitive_column} fairness ${formatMetric(finding.fairness_score)}% with ${finding.risk_level} risk and disparate impact ${finding.disparate_impact.toFixed(2)}.`,
    );

  return Array.from(new Set([...findings, ...(report.result?.root_causes?.map((cause) => cause.details) ?? [])])).slice(0, 3);
}

function buildCorrectiveProtocols(report: AnalysisPayload) {
  return (report.result?.recommendations?.map((rec) => `${rec.title}: ${rec.description}`) ?? []).slice(0, 3);
}

function formatRelativeTimestamp(value: string) {
  const createdAt = new Date(value);
  const diffMs = Date.now() - createdAt.getTime();
  if (Number.isNaN(createdAt.getTime()) || diffMs < 0) return "UNKNOWN";

  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 60) return `${Math.max(minutes, 1)} MIN AGO`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} HOUR${hours === 1 ? "" : "S"} AGO`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} DAY${days === 1 ? "" : "S"} AGO`;

  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks} WEEK${weeks === 1 ? "" : "S"} AGO`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months} MONTH${months === 1 ? "" : "S"} AGO`;

  const years = Math.floor(days / 365);
  return `${years} YEAR${years === 1 ? "" : "S"} AGO`;
}

function formatDensity(rows: number) {
  return `${rows.toLocaleString()} ROWS`;
}

function formatMetric(value: number) {
  if (!Number.isFinite(value)) return "0";
  if (value >= 10) return value.toFixed(0);
  if (value >= 1) return value.toFixed(1);
  return value.toFixed(2);
}

function triggerBrowserDownload(url: string) {
  if (typeof window === "undefined") return;
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noreferrer";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function downloadBlob(content: string, fileName: string, contentType: string) {
  if (typeof window === "undefined") return;
  const blob = new Blob([content], { type: contentType });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(objectUrl);
}

function csvEscape(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}
