"use client";

import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Brain,
  CheckCircle2,
  Cpu,
  History,
  Loader2,
  Radar,
  ShieldCheck,
  Target,
  Upload,
  Download,
  Wand2,
  Info,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import ReactMarkdown from 'react-markdown';

const liveStages = [
  "Model file received",
  "Architecture analyzed",
  "Inference pipeline validated",
  "Dataset inspected & sensitive attributes detected",
  "Baseline predictions calculated",
  "Fairness metrics evaluated",
];

const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:4000/api/v1").replace(/\/$/, "");

export default function ModelAnalyzer() {
  const [file, setFile] = useState<File | null>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);

  // Upload results & auto-detected config
  const [sessionId, setSessionId] = useState<string>("");
  const [columns, setColumns] = useState<string[]>([]);
  const [detectedSensitive, setDetectedSensitive] = useState<any[]>([]);
  
  // Selection state
  const [labelCol, setLabelCol] = useState("");
  const [sensitiveCol, setSensitiveCol] = useState("");

  // UI State
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [liveIndex, setLiveIndex] = useState(0);

  // Results State
  const [report, setReport] = useState<any>(null);
  
  // Mitigation State
  const [isMitigating, setIsMitigating] = useState(false);
  const [mitigationMethod, setMitigationMethod] = useState("ThresholdOptimizer");
  const [mitigationResult, setMitigationResult] = useState<any>(null);

  // Gemini State
  const [isLoadingGemini, setIsLoadingGemini] = useState(false);
  const [geminiSuggestions, setGeminiSuggestions] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !isMitigating) {
      setLiveIndex(0);
      return;
    }
    const timer = window.setInterval(() => {
      setLiveIndex((current) => Math.min(current + 1, liveStages.length - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [loading, isMitigating]);

  // Step 1: Upload Files
  async function onUpload() {
    if (!file || !csvFile) {
      setError("Please select both a model file and a CSV dataset.");
      return;
    }
    setLoading(true);
    setError("");
    setReport(null);
    setMitigationResult(null);
    setGeminiSuggestions(null);

    try {
      const formData = new FormData();
      formData.append("model_file", file);
      formData.append("csv_file", csvFile);

      const res = await fetch(`${API_URL}/fairsight/upload`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Upload failed.");
      const data = await res.json();
      
      setSessionId(data.session_id);
      setColumns(data.columns);
      setDetectedSensitive(data.detected_sensitive_columns || []);

      // Auto-select if detected
      if (data.detected_sensitive_columns?.length > 0) {
        setSensitiveCol(data.detected_sensitive_columns[0].column);
      } else if (data.columns.length > 0) {
        setSensitiveCol(data.columns[0]);
      }

      if (data.label_candidates?.length > 0) {
        setLabelCol(data.label_candidates[0]);
      } else if (data.columns.length > 0) {
        setLabelCol(data.columns[data.columns.length - 1]);
      }
      
      setLoading(false);
    } catch (err: any) {
      setError(err.message || "An error occurred during upload.");
      setLoading(false);
    }
  }

  // Step 2: Run Detect
  async function onDetect() {
    if (!sessionId || !labelCol || !sensitiveCol) return;
    setLoading(true);
    setError("");

    try {
      const detectRes = await fetch(`${API_URL}/fairsight/detect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          label_col: labelCol,
          sensitive_col: sensitiveCol,
        }),
      });

      if (!detectRes.ok) throw new Error("Bias detection failed. The model might not be compatible.");
      const detectData = await detectRes.json();
      setReport(detectData);
      
      // Auto-select the system recommended mitigation method
      if (detectData.recommended_mitigation?.method) {
        setMitigationMethod(detectData.recommended_mitigation.method);
      }

      setLoading(false);
    } catch (err: any) {
      setError(err.message || "An error occurred during detection.");
      setLoading(false);
    }
  }

  // Step 3: Mitigate
  async function onMitigate() {
    setIsMitigating(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/fairsight/mitigate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          label_col: labelCol,
          sensitive_col: sensitiveCol,
          method: mitigationMethod
        }),
      });

      if (!res.ok) throw new Error("Mitigation failed.");
      const data = await res.json();
      setMitigationResult(data);
      setIsMitigating(false);
    } catch (err: any) {
      setError(err.message || "An error occurred during mitigation.");
      setIsMitigating(false);
    }
  }

  // Step 4: Get Gemini Suggestions
  async function onGetSuggestions() {
    setIsLoadingGemini(true);
    try {
      const res = await fetch(`${API_URL}/fairsight/gemini-suggestions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          label_col: labelCol,
          sensitive_col: sensitiveCol,
        }),
      });
      if (!res.ok) throw new Error("Failed to get suggestions.");
      const data = await res.json();
      setGeminiSuggestions(data.suggestions_markdown);
    } catch (err: any) {
      console.error(err);
      setError("Failed to load Gemini analysis.");
    } finally {
      setIsLoadingGemini(false);
    }
  }

  return (
    <Layout>
      <div className="space-y-8 pb-12">
        {/* Header */}
        <section className="card-glow group relative overflow-hidden p-8">
          <div className="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-primary via-secondary to-primary shadow-[0_0_15px_rgba(var(--theme-glow),0.3)]" />
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="space-y-3 relative z-10 w-full md:w-auto">
              <div className="inline-flex items-center gap-2 border border-primary/20 bg-primary/10 px-3 py-1 text-[10px] font-mono uppercase tracking-[0.3em] text-primary">
                <Cpu className="h-3.5 w-3.5" />
                FairSight Model Pipeline
              </div>
              <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                <Brain className="h-8 w-8 text-primary" />
                Model Analyzer & Mitigator
              </h1>
              <p className="max-w-3xl text-sm leading-7 text-muted-foreground">
                Upload your trained ML model for structured fairness evaluation to determine Disparate Impact and Equalized Odds. Seamlessly integrate Fairness-aware wrappers (Post-processing & In-processing) via AIF360/Fairlearn.
              </p>
            </div>
          </div>
        </section>

        {/* Setup Section */}
        <div className="grid gap-8 xl:grid-cols-[1.2fr_0.8fr]">
          <section className="space-y-6">
            <div className="card-glow p-6">
              <div className="flex items-center gap-3 mb-6">
                <Upload className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold text-white">1. Upload Assets</h2>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-xs font-mono uppercase tracking-[0.3em] text-muted-foreground">Model Artifact</label>
                  <input
                    type="file"
                    accept=".pkl,.joblib,.h5,.onnx,.pb"
                    onChange={(event) => setFile(event.target.files?.[0] || null)}
                    className="w-full border border-white/10 bg-black/40 px-4 py-3 text-sm text-white"
                  />
                  <p className="text-[10px] text-muted-foreground">Formats: .pkl, .joblib, .h5</p>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-mono uppercase tracking-[0.3em] text-muted-foreground">Test Dataset (CSV)</label>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={(event) => setCsvFile(event.target.files?.[0] || null)}
                    className="w-full border border-white/10 bg-black/40 px-4 py-3 text-sm text-white"
                  />
                  <p className="text-[10px] text-muted-foreground">Data used for validation.</p>
                </div>
              </div>
              <div className="mt-6 flex justify-end">
                <Button onClick={onUpload} disabled={loading || !file || !csvFile} className="bg-primary text-black">
                  {loading && !sessionId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
                  {loading && !sessionId ? "Uploading..." : sessionId ? "Re-upload" : "Upload & Analyze"}
                </Button>
              </div>
            </div>

            {sessionId && (
              <div className="card-glow p-6 animate-in fade-in slide-in-from-bottom-4">
                <div className="flex items-center gap-3 mb-6">
                  <Target className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-semibold text-white">2. Execution Mapping</h2>
                </div>
                
                {detectedSensitive.length > 0 && (
                  <div className="mb-6 p-4 border border-primary/20 bg-primary/5">
                    <p className="text-xs font-mono uppercase tracking-[0.2em] text-primary flex items-center gap-2 mb-2">
                      <ShieldCheck className="h-4 w-4" /> Detected Sensitive Attributes
                    </p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {detectedSensitive.map((d, i) => (
                        <span key={i} className="px-2 py-1 bg-black/50 border border-white/10 text-xs text-secondary/80">
                          {d.column} <span className="opacity-50">({d.unique_count} groups)</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-xs font-mono uppercase tracking-[0.3em] text-muted-foreground">Label Column (Y)</label>
                    <select
                      value={labelCol}
                      onChange={(e) => setLabelCol(e.target.value)}
                      className="w-full border border-white/10 bg-black/40 px-4 py-3 text-sm text-white"
                    >
                      {columns.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-mono uppercase tracking-[0.3em] text-muted-foreground">Protected Attribute (A)</label>
                    <select
                      value={sensitiveCol}
                      onChange={(e) => setSensitiveCol(e.target.value)}
                      className="w-full border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-white text-primary"
                    >
                      {columns.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>

                {error && (
                  <div className="flex items-start gap-3 border border-red-500/30 bg-red-500/10 p-4 mt-6 text-sm text-red-300">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="mt-6 flex justify-end gap-3">
                  <Button onClick={onDetect} disabled={loading} className="bg-primary shadow-[0_0_15px_rgba(var(--theme-glow),0.3)] text-black">
                    {loading && sessionId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Radar className="mr-2 h-4 w-4" />}
                    {loading && sessionId ? "Auditing Pipeline..." : "Run Base Audit"}
                  </Button>
                </div>
              </div>
            )}
          </section>

          {/* Activity Feed */}
          <section className="card-glow relative p-6">
            <div className="mb-5 flex items-center gap-3">
              <Activity className="h-5 w-5 text-primary" />
              <h2 className="text-xl font-semibold text-white">Execution Feed</h2>
            </div>
            <div className="space-y-4">
              {loading || report || isMitigating ? (
                liveStages.map((stage, index) => {
                  let status = "pending";
                  if (loading || isMitigating) {
                    if (index < liveIndex) status = "completed";
                    if (index === liveIndex) status = "running";
                  } else if (report) {
                    status = "completed";
                  }
                  const active = (loading || isMitigating) && index === liveIndex;
                  return (
                    <div key={index} className={`relative pl-7 transition-opacity ${status === 'pending' ? 'opacity-40' : 'opacity-100'}`}>
                       <div className={`absolute left-0 top-1 h-3 w-3 rounded-full ${status === "running" ? "bg-amber-400 animate-pulse shadow-[0_0_12px_rgba(251,191,36,0.7)]" : status === "completed" ? "bg-primary shadow-[0_0_12px_rgba(var(--theme-glow),0.7)]" : "bg-white/20"} `} />
                       <div className="absolute left-[5px] top-5 h-full w-px bg-primary/20" />
                       <div className={`p-4 border ${active ? 'border-amber-500/30 bg-amber-500/5' : 'border-white/5 bg-black/20'}`}>
                         <div className="flex flex-wrap items-center justify-between gap-3">
                           <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-white">{stage}</p>
                           <span className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{status}</span>
                         </div>
                       </div>
                    </div>
                  );
                })
              ) : (
                <div className="p-5 border border-white/5 bg-black/20 text-sm text-muted-foreground">
                  Awaiting model payload...
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Analysis Results */}
        {report && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-6">
            <div className="flex items-center gap-3 border-b border-white/10 pb-4">
              <h2 className="text-2xl font-bold text-white">Base Model Audit Findings</h2>
              <div className={`px-3 py-1 rounded text-xs uppercase tracking-widest font-semibold border ${
                report.severity?.overall_severity?.level === 'low' ? 'border-primary/50 text-primary bg-primary/10' :
                report.severity?.overall_severity?.level === 'moderate' ? 'border-amber-500/50 text-amber-400 bg-amber-500/10' :
                'border-red-500/50 text-red-400 bg-red-500/10'
              }`}>
                {report.severity?.overall_severity?.level} Bias
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              <MetricCard title="DPD" value={`${(report.dpd * 100).toFixed(1)}%`} threshold="10.0%" severity={report.severity?.dpd_severity?.level} />
              <MetricCard title="EOD" value={`${(report.eod * 100).toFixed(1)}%`} threshold="10.0%" severity={report.severity?.eod_severity?.level} />
              <MetricCard title="Accuracy" value={`${(report.performance?.accuracy * 100).toFixed(1)}%`} />
              <MetricCard title="F1 Score" value={`${(report.performance?.f1 * 100).toFixed(1)}%`} />
            </div>

            {/* Per-Group Table */}
            <div className="card-glow p-6 overflow-x-auto">
              <h3 className="text-lg font-semibold text-white mb-4">Per-Group Performance ({sensitiveCol})</h3>
              <table className="w-full text-sm text-left">
                <thead className="text-xs uppercase bg-white/5 text-muted-foreground font-mono tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Group</th>
                    <th className="px-4 py-3">Selection Rate</th>
                    <th className="px-4 py-3">TPR (Recall)</th>
                    <th className="px-4 py-3">FPR</th>
                    <th className="px-4 py-3">Accuracy</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {report.by_group.map((g: any, i: number) => (
                    <tr key={i} className="hover:bg-white/[0.02]">
                      <td className="px-4 py-3 font-semibold text-white">{g.group}</td>
                      <td className="px-4 py-3">{(g.selection_rate * 100).toFixed(1)}%</td>
                      <td className="px-4 py-3">{(g.true_positive_rate * 100).toFixed(1)}%</td>
                      <td className="px-4 py-3">{(g.false_positive_rate * 100).toFixed(1)}%</td>
                      <td className="px-4 py-3">{(g.accuracy * 100).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Gemini Analysis Block */}
            <div className="terminal-card border-secondary/30 p-6 relative">
               <div className="absolute right-6 top-6">
                 {!geminiSuggestions && (
                   <Button onClick={onGetSuggestions} disabled={isLoadingGemini} variant="outline" className="border-secondary/50 text-secondary hover:bg-secondary/10">
                     {isLoadingGemini ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Wand2 className="h-4 w-4 mr-2" />}
                     Synthesize Insights with Gemini AI
                   </Button>
                 )}
               </div>
               
               <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-6">
                 <Wand2 className="h-5 w-5 text-secondary" /> AI Fairness Synthesis
               </h3>
               
               {geminiSuggestions ? (
                 <div className="prose prose-invert prose-p:text-muted-foreground prose-a:text-secondary max-w-none text-sm leading-relaxed">
                   <ReactMarkdown>{geminiSuggestions}</ReactMarkdown>
                 </div>
               ) : (
                 <div className="text-muted-foreground text-sm flex items-center gap-2">
                   <Info className="h-4 w-4" /> Run synthesis to generate a human-readable executive summary and targeted guidance.
                 </div>
               )}
            </div>

            {/* Mitigation Interface */}
            {report.is_biased && (
              <section className="mt-12 space-y-6">
                <div className="flex items-center gap-3 border-b border-white/10 pb-4">
                  <h2 className="text-2xl font-bold text-white">Bias Mitigation & Wrapper Injection</h2>
                </div>
                
                <div className="grid gap-8 lg:grid-cols-2">
                  <div className="card-glow p-6">
                    <h3 className="text-lg font-semibold text-white mb-4">Select Mitigation Strategy</h3>
                    
                    <div className="bg-primary/10 border border-primary/20 p-4 mb-6">
                      <p className="text-xs font-mono text-primary uppercase tracking-wider mb-1">System Recommendation</p>
                      <p className="text-sm text-white font-semibold">{report.recommended_mitigation?.method}</p>
                      <p className="text-xs text-primary/80 mt-1">{report.recommended_mitigation?.reason}</p>
                    </div>

                    <select
                      value={mitigationMethod}
                      onChange={(e) => setMitigationMethod(e.target.value)}
                      className="w-full border border-white/10 bg-black/40 px-4 py-3 text-sm text-white mb-6"
                    >
                      <option value="ThresholdOptimizer">ThresholdOptimizer (Post-processing)</option>
                      <option value="ExponentiatedGradient">ExponentiatedGradient (In-processing)</option>
                      <option value="Reweighing">Reweighing (Pre-processing)</option>
                    </select>

                    <Button onClick={onMitigate} disabled={isMitigating} className="w-full bg-primary text-black">
                      {isMitigating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
                      {isMitigating ? "Applying algorithm..." : "Execute Mitigation Wrapper"}
                    </Button>
                  </div>

                  {mitigationResult && (
                    <div className="card-glow p-6 border-primary/30">
                      <h3 className="text-lg font-semibold text-primary mb-4 flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5" /> Mitigation Complete
                      </h3>
                      
                      <div className="space-y-4">
                        <div className="flex justify-between items-center py-2 border-b border-white/10">
                          <span className="text-sm text-muted-foreground">Status</span>
                          <span className="text-sm font-semibold text-white">{mitigationResult.summary.verdict}</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-white/10">
                          <span className="text-sm text-muted-foreground">DPD Reduction</span>
                          <span className="text-sm font-semibold text-primary">-{mitigationResult.dpd_reduction_pct}%</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-white/10">
                          <span className="text-sm text-muted-foreground">EOD Reduction</span>
                          <span className="text-sm font-semibold text-primary">-{mitigationResult.eod_reduction_pct}%</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-white/10">
                          <span className="text-sm text-muted-foreground">Original Accuracy</span>
                          <span className="text-sm text-white">{(mitigationResult.accuracy_before * 100).toFixed(1)}%</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-white/10">
                          <span className="text-sm text-muted-foreground">Wrapped Accuracy</span>
                          <span className="text-sm text-white">
                            {(mitigationResult.accuracy_after * 100).toFixed(1)}% 
                            <span className="text-muted-foreground ml-2">({mitigationResult.summary.accuracy_impact})</span>
                          </span>
                        </div>
                      </div>

                      <div className="mt-6 flex flex-col sm:flex-row gap-3">
                        <Button 
                          asChild
                          variant="outline" 
                          className="flex-1 border-primary/50 text-white hover:bg-primary/20"
                        >
                          <a href={`${API_URL}/fairsight/download-model/${sessionId}`} download>
                            <Download className="mr-2 h-4 w-4" /> Download Wrapped Model
                          </a>
                        </Button>
                        <Button 
                          asChild
                          variant="outline" 
                          className="flex-1 border-secondary/50 text-white hover:bg-secondary/20"
                        >
                          <a href={`${API_URL}/fairsight/download-report/${sessionId}`} download>
                            <Download className="mr-2 h-4 w-4" /> Export Report (JSON)
                          </a>
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}

            {!report.is_biased && (
              <div className="mt-12 card-glow p-8 border-primary/30 bg-primary/5 text-center">
                <CheckCircle2 className="h-12 w-12 text-primary mx-auto mb-4" />
                <h3 className="text-xl font-bold text-white mb-2">Model Operating Within Fair Parameters</h3>
                <p className="text-muted-foreground max-w-lg mx-auto mb-6">
                  The current model architecture does not exhibit significant bias against the tested properties. No downstream mitigation wrapper is required at this time.
                </p>
                <Button 
                  asChild
                  variant="outline" 
                  className="border-primary/50 text-white hover:bg-primary/20"
                >
                  <a href={`${API_URL}/fairsight/download-report/${sessionId}`} download>
                    <Download className="mr-2 h-4 w-4" /> Export Verification Report
                  </a>
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}

function MetricCard({ title, value, threshold, severity }: { title: string, value: string, threshold?: string, severity?: string }) {
  const isHigh = severity === 'high' || severity === 'severe';
  return (
    <div className={`card-glow p-5 flex flex-col justify-between ${isHigh ? 'border-red-500/30 bg-red-500/5' : ''}`}>
      <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">{title}</p>
      <p className={`mt-3 text-3xl font-semibold ${isHigh ? 'text-red-400' : 'text-white'}`}>{value}</p>
      {threshold && (
        <p className="mt-2 text-xs text-muted-foreground">
          Thresh: &lt;{threshold}
        </p>
      )}
    </div>
  );
}
