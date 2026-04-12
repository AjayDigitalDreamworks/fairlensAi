"use client";

import Layout from "@/components/Layout";
import { FileText, Download, ShieldCheck, History, Loader2, Database, DownloadCloud } from "lucide-react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";

const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:4000/api/v1").replace(/\/$/, "");

export default function ModelReportsPage() {
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState<any[]>([]);

  useEffect(() => {
    async function fetchReports() {
      try {
        const res = await fetch(`${API_URL}/fairsight/history`);
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
    window.location.href = `${API_URL}/fairsight/download-report/${sessionId}`;
  };

  const handleDownloadModel = (sessionId: string) => {
    window.location.href = `${API_URL}/fairsight/download-model/${sessionId}`;
  };

  return (
    <Layout>
      <div className="space-y-8 pb-10">
        <div className="card-glow group relative overflow-hidden p-8">
          <div className="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-primary via-secondary to-primary shadow-[0_0_15px_rgba(var(--theme-glow),0.3)]" />
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="mb-2 font-sans text-3xl font-bold tracking-tight text-white flex items-center gap-3">
                <FileText className="h-8 w-8 text-primary" />
                Live Model Reports
              </h1>
              <p className="text-sm text-muted-foreground">
                Download model inference audit logs, export wrapped bias-corrected models, and access secure historic records.
              </p>
            </div>
            <div className={`inline-flex items-center gap-2 border border-white/10 bg-black/40 px-4 py-3 text-xs uppercase tracking-[0.25em] ${loading ? 'text-muted-foreground' : 'text-primary'}`}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <History className="h-4 w-4" />}
              {loading ? 'Connecting Node...' : 'Archive Active'}
            </div>
          </div>
        </div>

        <div className="grid gap-6">
          <div className="card-glow rounded-xl p-8 min-h-[400px]">
            <div className="flex items-center gap-3 mb-6">
               <ShieldCheck className="w-5 h-5 text-primary" />
               <h3 className="text-xl font-semibold text-white">Recent Artifact Outputs</h3>
            </div>
            
            {loading ? (
               <div className="flex items-center justify-center h-48">
                 <Loader2 className="w-8 h-8 text-primary animate-spin" />
               </div>
            ) : reports.length === 0 ? (
               <div className="flex flex-col items-center justify-center p-12 text-muted-foreground border border-white/5 bg-black/20 rounded-xl">
                 <Database className="w-12 h-12 text-primary/30 mb-4" />
                 <p>No model audit reports found in your database.</p>
                 <p className="text-xs mt-2">Run a new analysis in the Model Analyzer module to populate the archive.</p>
               </div>
            ) : (
               <div className="grid gap-4 animate-in fade-in slide-in-from-bottom-4">
                 {reports.map((report) => (
                   <ReportRow 
                     key={report.sessionId}
                     item={report}
                     onDownloadReport={() => handleDownloadReport(report.sessionId)}
                     onDownloadModel={() => handleDownloadModel(report.sessionId)}
                   />
                 ))}
               </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}

function ReportRow({ item, onDownloadReport, onDownloadModel }: { item: any, onDownloadReport: () => void, onDownloadModel: () => void }) {
  // Extract context from history payload
  const modelName = item.modelOriginalName || item.modelName || "unnamed_model.pkl";
  
  // Try to parse relative time from timestamp
  const timestamp = item.createdAt ? new Date(item.createdAt).toLocaleString() : "Unknown date";
  
  // Decide type
  let type = "Base Inference Audit";
  if (item.mitigationResult) {
     type = `Corrected via ${item.mitigationResult.method}`;
  } else if (item.detectReport?.fallback_used) {
     type = "Fallback Diagnostic Audit";
  }

  // Calculate generic score mapping vs actual AI severity
  const isBiased = item.detectReport?.is_biased;
  const isMitigated = !!item.mitigationResult;
  let statusText = "SECURE";
  let statusColor = "text-emerald-400";

  if (isMitigated) {
     statusText = "WRAPPED";
     statusColor = "text-primary";
  } else if (isBiased) {
     statusText = "BIASED";
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
            <span className="opacity-70">Target: {item.labelCol}</span>
         </div>
       </div>
       <div className="flex items-center gap-6 self-end md:self-center">
          <div className="text-right hidden sm:block">
             <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-1">State</p>
             <p className={`text-sm font-bold uppercase tracking-wider ${statusColor}`}>{statusText}</p>
          </div>
          <div className="flex gap-2">
            <Button
               title="Download Model Artifact"
               variant="outline"
               size="sm"
               onClick={onDownloadModel}
               className="border-white/10 bg-black/40 hover:bg-white/10 hover:text-white transition-all w-10 sm:w-auto px-0 sm:px-4"
            >
              <DownloadCloud className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline text-xs uppercase tracking-wider">Model</span>
            </Button>
            <Button
               title="Download Audit JSON"
               variant="outline"
               size="sm"
               onClick={onDownloadReport}
               className="border-white/10 bg-black/40 hover:bg-white/10 hover:text-white transition-all w-10 sm:w-auto px-0 sm:px-4"
            >
              <FileText className="w-4 h-4 sm:mr-2 text-primary group-hover:text-primary transition-colors" />
              <span className="hidden sm:inline text-xs uppercase tracking-wider text-primary group-hover:text-primary transition-colors">Report JSON</span>
            </Button>
          </div>
       </div>
    </div>
  );
}
