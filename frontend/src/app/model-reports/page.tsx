"use client";

import Layout from "@/components/Layout";
import { FileText, Download, ShieldCheck, History, Loader2, Database, DownloadCloud, Brain, ArrowRight, Shield, Zap } from "lucide-react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { apiFetch, withAuthToken } from "@/lib/auth";
import { ELI5ModeToggle, TermBadge } from "@/components/ELI5Tooltip";

const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:4000/api/v1").replace(/\/$/, "");

export default function ModelReportsPage() {
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState<any[]>([]);
  const [eli5Mode, setEli5Mode] = useState(false);

  useEffect(() => {
    async function fetchReports() {
      try {
        const res = await apiFetch(`${API_URL}/fairsight/history`);
        if (!res.ok) throw new Error("Failed to fetch reports");
        const data = await res.json();
        setReports(data.items || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchReports();
  }, []);

  const handleDownloadReport = (sessionId: string) => {
    window.location.href = withAuthToken(`${API_URL}/fairsight/download-report/${sessionId}`);
  };

  const handleDownloadModel = (sessionId: string) => {
    window.location.href = withAuthToken(`${API_URL}/fairsight/download-model/${sessionId}`);
  };

  const biasedCount = reports.filter(r => r.detectReport?.is_biased).length;
  const mitigatedCount = reports.filter(r => r.mitigationResult).length;

  return (
    <Layout>
      <div className="space-y-8 pb-10">
        <div className="card-glow group relative overflow-hidden p-8">
          <div className="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-primary via-secondary to-primary shadow-[0_0_15px_rgba(var(--theme-glow),0.3)]" />
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="mb-2 font-sans text-3xl font-bold tracking-tight text-white flex items-center gap-3">
                <FileText className="h-8 w-8 text-primary" />
                {eli5Mode ? "My AI Audit History" : "Live Model Reports"}
              </h1>
              <p className="text-sm text-muted-foreground max-w-2xl">
                {eli5Mode
                  ? "Every time you checked an AI model for bias, the results were saved here. You can download the reports and fixed models anytime."
                  : "Download model inference audit logs, export wrapped bias-corrected models, and access secure historic records."
                }
              </p>
            </div>
            <div className="flex flex-col items-end gap-3">
              <ELI5ModeToggle enabled={eli5Mode} onToggle={() => setEli5Mode((v) => !v)} />
              <div className={`inline-flex items-center gap-2 border border-white/10 bg-black/40 px-4 py-3 text-xs uppercase tracking-[0.25em] ${loading ? 'text-muted-foreground' : 'text-primary'}`}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <History className="h-4 w-4" />}
                {loading ? (eli5Mode ? 'Loading...' : 'Connecting Node...') : (eli5Mode ? `${reports.length} Reports Found` : 'Archive Active')}
              </div>
            </div>
          </div>
        </div>

        {/* Summary Stats */}
        {!loading && reports.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-3 animate-in fade-in slide-in-from-bottom-3">
            <div className="card-glow p-5">
              <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">
                {eli5Mode ? "Total Checks" : "Total Audits"}
              </p>
              <p className="mt-2 text-3xl font-bold text-white">{reports.length}</p>
            </div>
            <div className={`card-glow p-5 ${biasedCount > 0 ? 'border-red-500/20' : ''}`}>
              <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">
                {eli5Mode ? "Found Unfair" : "Biased Models"}
              </p>
              <p className={`mt-2 text-3xl font-bold ${biasedCount > 0 ? 'text-red-400' : 'text-white'}`}>{biasedCount}</p>
            </div>
            <div className="card-glow p-5">
              <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">
                {eli5Mode ? "Fixed Models" : "Mitigated"}
              </p>
              <p className="mt-2 text-3xl font-bold text-primary">{mitigatedCount}</p>
            </div>
          </div>
        )}

        <div className="grid gap-6">
          <div className="card-glow rounded-xl p-8 min-h-[400px]">
            <div className="flex items-center gap-3 mb-6">
               <ShieldCheck className="w-5 h-5 text-primary" />
               <h3 className="text-xl font-semibold text-white">
                 {eli5Mode ? "All Your Model Reports" : "Recent Artifact Outputs"}
               </h3>
            </div>
            
            {loading ? (
               <div className="flex items-center justify-center h-48">
                 <Loader2 className="w-8 h-8 text-primary animate-spin" />
               </div>
            ) : reports.length === 0 ? (
               <div className="flex flex-col items-center justify-center p-12 text-muted-foreground border border-white/5 bg-black/20 rounded-xl">
                 <Database className="w-12 h-12 text-primary/30 mb-4" />
                 <p>{eli5Mode ? "No AI model checks found yet." : "No model audit reports found in your database."}</p>
                 <p className="text-xs mt-2">
                   {eli5Mode
                     ? "Go to the Model Analyzer to upload and check your first AI model."
                     : "Run a new analysis in the Model Analyzer module to populate the archive."
                   }
                 </p>
                 <Button asChild className="mt-4 bg-primary text-black">
                   <Link to="/model-analyzer">
                     <ArrowRight className="mr-2 h-4 w-4" />
                     {eli5Mode ? "Check a Model" : "Go to Model Analyzer"}
                   </Link>
                 </Button>
               </div>
            ) : (
               <div className="grid gap-4 animate-in fade-in slide-in-from-bottom-4">
                 {reports.map((report) => (
                   <ReportRow 
                     key={report.sessionId}
                     item={report}
                     eli5Mode={eli5Mode}
                     onDownloadReport={() => handleDownloadReport(report.sessionId)}
                     onDownloadModel={() => handleDownloadModel(report.sessionId)}
                   />
                 ))}
               </div>
            )}
          </div>
        </div>

        {/* Cross-Navigation */}
        <div className="grid gap-4 sm:grid-cols-3 animate-in fade-in slide-in-from-bottom-6">
          <Link to="/model-analyzer" className="card-glow p-5 hover:border-primary/40 transition-all group cursor-pointer">
            <div className="flex items-center justify-between mb-2">
              <Brain className="h-5 w-5 text-primary" />
              <ArrowRight className="h-4 w-4 text-primary opacity-0 group-hover:opacity-100 transition" />
            </div>
            <h3 className="font-bold text-white text-sm">{eli5Mode ? "Check New Model" : "Model Analyzer"}</h3>
            <p className="text-xs text-muted-foreground mt-1">{eli5Mode ? "Upload and check a model for bias" : "Upload .pkl/.h5 for fairness audit"}</p>
          </Link>
          <Link to="/model-metrics" className="card-glow p-5 hover:border-primary/40 transition-all group cursor-pointer">
            <div className="flex items-center justify-between mb-2">
              <Shield className="h-5 w-5 text-primary" />
              <ArrowRight className="h-4 w-4 text-primary opacity-0 group-hover:opacity-100 transition" />
            </div>
            <h3 className="font-bold text-white text-sm">{eli5Mode ? "Fairness Numbers" : "Fairness Metrics"}</h3>
            <p className="text-xs text-muted-foreground mt-1">{eli5Mode ? "Detailed per-group fairness scores" : "DPD, EOD, Disparate Impact"}</p>
          </Link>
          <Link to="/model-mitigation" className="card-glow p-5 hover:border-primary/40 transition-all group cursor-pointer">
            <div className="flex items-center justify-between mb-2">
              <Zap className="h-5 w-5 text-primary" />
              <ArrowRight className="h-4 w-4 text-primary opacity-0 group-hover:opacity-100 transition" />
            </div>
            <h3 className="font-bold text-white text-sm">{eli5Mode ? "Fix Bias" : "Mitigation Toolkit"}</h3>
            <p className="text-xs text-muted-foreground mt-1">{eli5Mode ? "Apply fairness repairs" : "ThresholdOptimizer / AIF360 wrappers"}</p>
          </Link>
        </div>
      </div>
    </Layout>
  );
}

function ReportRow({ item, eli5Mode, onDownloadReport, onDownloadModel }: { item: any, eli5Mode: boolean, onDownloadReport: () => void, onDownloadModel: () => void }) {
  // Extract context from history payload
  const modelName = item.modelOriginalName || item.modelName || "unnamed_model.pkl";
  
  // Try to parse relative time from timestamp
  const timestamp = item.createdAt ? new Date(item.createdAt).toLocaleString() : "Unknown date";
  
  // Decide type
  let type = eli5Mode ? "Basic Check" : "Base Inference Audit";
  if (item.mitigationResult) {
     type = eli5Mode
       ? `Fixed with ${item.mitigationResult.method || "repair algorithm"}`
       : `Corrected via ${item.mitigationResult.method}`;
  } else if (item.detectReport?.fallback_used) {
     type = eli5Mode ? "Quick Check" : "Fallback Diagnostic Audit";
  }

  // Calculate generic score mapping vs actual AI severity
  const isBiased = item.detectReport?.is_biased;
  const isMitigated = !!item.mitigationResult;
  let statusText = eli5Mode ? "FAIR ✅" : "SECURE";
  let statusColor = "text-emerald-400";

  if (isMitigated) {
     statusText = eli5Mode ? "FIXED ✨" : "WRAPPED";
     statusColor = "text-primary";
  } else if (isBiased) {
     statusText = eli5Mode ? "UNFAIR ⚠️" : "BIASED";
     statusColor = "text-red-400";
  }

  return (
    <div className="flex flex-col md:flex-row items-start md:items-center justify-between p-5 border border-white/10 bg-black/20 hover:border-primary/30 transition-all rounded-lg group gap-4">
       <div className="flex-1">
         <p className="font-semibold text-white font-mono break-all line-clamp-1">{modelName}</p>
         <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-2 text-xs text-muted-foreground">
            <span className="uppercase tracking-widest text-primary/80 font-semibold">{type}</span>
            <span>&bull;</span>
            <span className="opacity-70 text-[11px]">{timestamp}</span>
            <span>&bull;</span>
            <span className="opacity-70">
              {eli5Mode ? `Predicting: ${item.labelCol}` : `Target: ${item.labelCol}`}
            </span>
            {item.sensitiveCol && (
              <>
                <span>&bull;</span>
                <span className="opacity-70">
                  {eli5Mode ? `Checking: ${item.sensitiveCol}` : `Protected: ${item.sensitiveCol}`}
                </span>
              </>
            )}
         </div>
       </div>
       <div className="flex items-center gap-6 self-end md:self-center">
          <div className="text-right hidden sm:block">
             <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-1">
               {eli5Mode ? "Status" : "State"}
             </p>
             <p className={`text-sm font-bold uppercase tracking-wider ${statusColor}`}>{statusText}</p>
          </div>
          <div className="flex gap-2">
            <Button
               title={eli5Mode ? "Download fixed model" : "Download Model Artifact"}
               variant="outline"
               size="sm"
               onClick={onDownloadModel}
               className="border-white/10 bg-black/40 hover:bg-white/10 hover:text-white transition-all w-10 sm:w-auto px-0 sm:px-4"
            >
              <DownloadCloud className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline text-xs uppercase tracking-wider">
                {eli5Mode ? "Model" : "Model"}
              </span>
            </Button>
            <Button
               title={eli5Mode ? "Download audit report" : "Download Audit JSON"}
               variant="outline"
               size="sm"
               onClick={onDownloadReport}
               className="border-white/10 bg-black/40 hover:bg-white/10 hover:text-white transition-all w-10 sm:w-auto px-0 sm:px-4"
            >
              <FileText className="w-4 h-4 sm:mr-2 text-primary group-hover:text-primary transition-colors" />
              <span className="hidden sm:inline text-xs uppercase tracking-wider text-primary group-hover:text-primary transition-colors">
                {eli5Mode ? "Report" : "Report JSON"}
              </span>
            </Button>
          </div>
       </div>
    </div>
  );
}
