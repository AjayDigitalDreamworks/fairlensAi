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
  Shield,
  Zap,
  BarChart3,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import ReactMarkdown from 'react-markdown';
import { apiFetch, withAuthToken } from "@/lib/auth";
import { ELI5ModeToggle, ELI5Tooltip, TermBadge } from "@/components/ELI5Tooltip";

const liveStages = [
  "Model file received",
  "Architecture analyzed",
  "Inference pipeline validated",
  "Dataset inspected & sensitive attributes detected",
  "Baseline predictions calculated",
  "Fairness metrics evaluated",
];

const eli5Stages = [
  "Got your AI model file ✓",
  "Figured out how the AI is built ✓",
  "Checked if the AI can make predictions ✓",
  "Found which groups of people the AI treats differently ✓",
  "Ran the AI on your data to see what it predicts ✓",
  "Measured how fairly the AI treats each group ✓",
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
  const [eli5Mode, setEli5Mode] = useState(false);

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
      setError(eli5Mode
        ? "Please choose both your AI model file and a CSV data file."
        : "Please select both a model file and a CSV dataset.");
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

      const res = await apiFetch(`${API_URL}/fairsight/upload`, {
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
      const detectRes = await apiFetch(`${API_URL}/fairsight/detect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          label_col: labelCol,
          sensitive_col: sensitiveCol,
        }),
      });

      if (!detectRes.ok) throw new Error(eli5Mode
        ? "The bias check failed. Your AI model file might not be compatible."
        : "Bias detection failed. The model might not be compatible.");
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
      const res = await apiFetch(`${API_URL}/fairsight/mitigate`, {
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
      const res = await apiFetch(`${API_URL}/fairsight/gemini-suggestions`, {
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
      setError(eli5Mode ? "Couldn't get AI suggestions right now." : "Failed to load Gemini analysis.");
    } finally {
      setIsLoadingGemini(false);
    }
  }

  const stageLabels = eli5Mode ? eli5Stages : liveStages;

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
                {eli5Mode ? "AI Fairness Checker" : "FairSight Model Pipeline"}
              </div>
              <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                <Brain className="h-8 w-8 text-primary" />
                {eli5Mode ? "Check My AI for Bias" : "Model Analyzer & Mitigator"}
              </h1>
              <p className="max-w-3xl text-sm leading-7 text-muted-foreground">
                {eli5Mode
                  ? "Upload your trained AI model and a test dataset. We'll check if it treats different groups of people fairly, and offer tools to fix any unfairness we find."
                  : <>Upload your trained ML model for structured fairness evaluation to determine <ELI5Tooltip term="Disparate Impact">Disparate Impact</ELI5Tooltip> and <ELI5Tooltip term="Equalized Odds">Equalized Odds</ELI5Tooltip>. Seamlessly integrate Fairness-aware wrappers (Post-processing & In-processing) via AIF360/Fairlearn.</>
                }
              </p>
            </div>
            <ELI5ModeToggle enabled={eli5Mode} onToggle={() => setEli5Mode((v) => !v)} />
          </div>
        </section>

        {/* Setup Section */}
        <div className="grid gap-8 xl:grid-cols-[1.2fr_0.8fr]">
          <section className="space-y-6">
            <div className="card-glow p-6">
              <div className="flex items-center gap-3 mb-6">
                <Upload className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold text-white">
                  {eli5Mode ? "1. Upload Your Files" : "1. Upload Assets"}
                </h2>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-xs font-mono uppercase tracking-[0.3em] text-muted-foreground">
                    {eli5Mode ? "Your AI Model File" : "Model Artifact"}
                  </label>
                  <input
                    type="file"
                    accept=".pkl,.joblib,.h5,.onnx,.pb"
                    onChange={(event) => setFile(event.target.files?.[0] || null)}
                    className="w-full border border-white/10 bg-black/40 px-4 py-3 text-sm text-white"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    {eli5Mode ? "Supported: .pkl, .joblib, .h5 files" : "Formats: .pkl, .joblib, .h5"}
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-mono uppercase tracking-[0.3em] text-muted-foreground">
                    {eli5Mode ? "Your Test Data (CSV)" : "Test Dataset (CSV)"}
                  </label>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={(event) => setCsvFile(event.target.files?.[0] || null)}
                    className="w-full border border-white/10 bg-black/40 px-4 py-3 text-sm text-white"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    {eli5Mode ? "The data your AI will be tested on." : "Data used for validation."}
                  </p>
                </div>
              </div>
              <div className="mt-6 flex justify-end">
                <Button onClick={onUpload} disabled={loading || !file || !csvFile} className="bg-primary text-black">
                  {loading && !sessionId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
                  {loading && !sessionId
                    ? eli5Mode ? "Uploading..." : "Uploading..."
                    : sessionId
                    ? eli5Mode ? "Upload New Files" : "Re-upload"
                    : eli5Mode ? "Upload & Check" : "Upload & Analyze"
                  }
                </Button>
              </div>
            </div>

            {sessionId && (
              <div className="card-glow p-6 animate-in fade-in slide-in-from-bottom-4">
                <div className="flex items-center gap-3 mb-6">
                  <Target className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-semibold text-white">
                    {eli5Mode ? "2. Tell Us What to Check" : "2. Execution Mapping"}
                  </h2>
                </div>
                
                {detectedSensitive.length > 0 && (
                  <div className="mb-6 p-4 border border-primary/20 bg-primary/5">
                    <p className="text-xs font-mono uppercase tracking-[0.2em] text-primary flex items-center gap-2 mb-2">
                      <ShieldCheck className="h-4 w-4" />
                      {eli5Mode ? "We Found These Protected Groups" : "Detected Sensitive Attributes"}
                    </p>
                    {eli5Mode && (
                      <p className="text-xs text-muted-foreground mb-2">
                        These are columns in your data that might represent protected characteristics like race, gender, or age.
                      </p>
                    )}
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
                    <label className="text-xs font-mono uppercase tracking-[0.3em] text-muted-foreground flex items-center gap-1">
                      {eli5Mode ? "What the AI predicts" : "Label Column (Y)"}
                      <TermBadge term="Accuracy" />
                    </label>
                    {eli5Mode && (
                      <p className="text-[10px] text-muted-foreground">Which column is the AI trying to predict? (e.g., "approved", "hired")</p>
                    )}
                    <select
                      value={labelCol}
                      onChange={(e) => setLabelCol(e.target.value)}
                      className="w-full border border-white/10 bg-black/40 px-4 py-3 text-sm text-white"
                    >
                      {columns.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-mono uppercase tracking-[0.3em] text-muted-foreground flex items-center gap-1">
                      {eli5Mode ? "Protected group to check" : "Protected Attribute (A)"}
                      <TermBadge term="Sensitive Attribute" />
                    </label>
                    {eli5Mode && (
                      <p className="text-[10px] text-muted-foreground">Which column identifies the group you want to check fairness for? (e.g., "gender", "race")</p>
                    )}
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
                    {loading && sessionId
                      ? eli5Mode ? "Checking for Bias..." : "Auditing Pipeline..."
                      : eli5Mode ? "Check for Bias" : "Run Base Audit"
                    }
                  </Button>
                </div>
              </div>
            )}
          </section>

          {/* Activity Feed */}
          <section className="card-glow relative p-6">
            <div className="mb-5 flex items-center gap-3">
              <Activity className="h-5 w-5 text-primary" />
              <h2 className="text-xl font-semibold text-white">
                {eli5Mode ? "What's Happening" : "Execution Feed"}
              </h2>
            </div>
            <div className="space-y-4">
              {loading || report || isMitigating ? (
                stageLabels.map((stage, index) => {
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
                           <span className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                             {eli5Mode
                               ? status === "completed" ? "Done ✓" : status === "running" ? "Working..." : "Waiting"
                               : status
                             }
                           </span>
                         </div>
                       </div>
                    </div>
                  );
                })
              ) : (
                <div className="p-5 border border-white/5 bg-black/20 text-sm text-muted-foreground">
                  {eli5Mode ? "Upload your AI model to get started..." : "Awaiting model payload..."}
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Analysis Results */}
        {report && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-6">
            <div className="flex items-center gap-3 border-b border-white/10 pb-4">
              <h2 className="text-2xl font-bold text-white">
                {eli5Mode ? "How Fair Is Your AI?" : "Base Model Audit Findings"}
              </h2>
              <div className={`px-3 py-1 rounded text-xs uppercase tracking-widest font-semibold border ${
                report.severity?.overall_severity?.level === 'low' ? 'border-primary/50 text-primary bg-primary/10' :
                report.severity?.overall_severity?.level === 'moderate' ? 'border-amber-500/50 text-amber-400 bg-amber-500/10' :
                'border-red-500/50 text-red-400 bg-red-500/10'
              }`}>
                {eli5Mode
                  ? report.severity?.overall_severity?.level === 'low' ? "✅ Fair" : report.severity?.overall_severity?.level === 'moderate' ? "⚠️ Somewhat Unfair" : "❌ Unfair"
                  : `${report.severity?.overall_severity?.level} Bias`
                }
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              <MetricCard
                title={eli5Mode ? "Approval Gap" : "DPD"}
                value={`${(report.dpd * 100).toFixed(1)}%`}
                threshold="10.0%"
                severity={report.severity?.dpd_severity?.level}
                termKey="DPD"
                eli5Desc={eli5Mode ? "How much more one group gets approved vs another" : undefined}
              />
              <MetricCard
                title={eli5Mode ? "Missed Opportunity Gap" : "EOD"}
                value={`${(report.eod * 100).toFixed(1)}%`}
                threshold="10.0%"
                severity={report.severity?.eod_severity?.level}
                termKey="EOD"
                eli5Desc={eli5Mode ? "How many more qualified people are wrongly rejected from one group" : undefined}
              />
              <MetricCard
                title={eli5Mode ? "How Correct Is It?" : "Accuracy"}
                value={`${(report.performance?.accuracy * 100).toFixed(1)}%`}
                termKey="Accuracy"
                eli5Desc={eli5Mode ? "How often the AI gets the right answer overall" : undefined}
              />
              <MetricCard
                title="F1 Score"
                value={`${(report.performance?.f1 * 100).toFixed(1)}%`}
                eli5Desc={eli5Mode ? "Balanced measure of precision and recall" : undefined}
              />
            </div>

            {/* Per-Group Table */}
            <div className="card-glow p-6 overflow-x-auto">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                {eli5Mode ? `How Each Group Is Treated (${sensitiveCol})` : `Per-Group Performance (${sensitiveCol})`}
                <TermBadge term="Selection Rate" />
              </h3>
              {eli5Mode && (
                <p className="text-xs text-muted-foreground mb-4">
                  This table shows how the AI performs for each value of "{sensitiveCol}". Look for big differences between groups — that's unfairness.
                </p>
              )}
              <table className="w-full text-sm text-left">
                <thead className="text-xs uppercase bg-white/5 text-muted-foreground font-mono tracking-wider">
                  <tr>
                    <th className="px-4 py-3">{eli5Mode ? "Group" : "Group"}</th>
                    <th className="px-4 py-3">
                      <ELI5Tooltip term="Selection Rate">
                        {eli5Mode ? "Approval %" : "Selection Rate"}
                      </ELI5Tooltip>
                    </th>
                    <th className="px-4 py-3">
                      <ELI5Tooltip term="True Positive Rate">
                        {eli5Mode ? "Correctly Approved %" : "TPR (Recall)"}
                      </ELI5Tooltip>
                    </th>
                    <th className="px-4 py-3">
                      <ELI5Tooltip term="False Positive Rate">
                        {eli5Mode ? "Wrongly Approved %" : "FPR"}
                      </ELI5Tooltip>
                    </th>
                    <th className="px-4 py-3">
                      <ELI5Tooltip term="Accuracy">Accuracy</ELI5Tooltip>
                    </th>
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
                     {eli5Mode ? "Explain in Plain English" : "Synthesize Insights with Gemini AI"}
                   </Button>
                 )}
               </div>
               
               <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-6">
                 <Wand2 className="h-5 w-5 text-secondary" />
                 {eli5Mode ? "AI Expert Summary" : "AI Fairness Synthesis"}
               </h3>
               
               {geminiSuggestions ? (
                 <div className="prose prose-invert prose-p:text-muted-foreground prose-a:text-secondary max-w-none text-sm leading-relaxed">
                   <ReactMarkdown>{geminiSuggestions}</ReactMarkdown>
                 </div>
               ) : (
                 <div className="text-muted-foreground text-sm flex items-center gap-2">
                   <Info className="h-4 w-4" />
                   {eli5Mode
                     ? "Click the button above to get an easy-to-understand summary of what's happening with your AI."
                     : "Run synthesis to generate a human-readable executive summary and targeted guidance."
                   }
                 </div>
               )}
            </div>

            {/* Mitigation Interface */}
            {report.is_biased && (
              <section className="mt-12 space-y-6">
                <div className="flex items-center gap-3 border-b border-white/10 pb-4">
                  <h2 className="text-2xl font-bold text-white">
                    {eli5Mode ? "Fix the Bias" : "Bias Mitigation & Wrapper Injection"}
                  </h2>
                  <TermBadge term="Mitigation" />
                </div>
                
                <div className="grid gap-8 lg:grid-cols-2">
                  <div className="card-glow p-6">
                    <h3 className="text-lg font-semibold text-white mb-4">
                      {eli5Mode ? "Choose a Repair Method" : "Select Mitigation Strategy"}
                    </h3>
                    
                    <div className="bg-primary/10 border border-primary/20 p-4 mb-6">
                      <p className="text-xs font-mono text-primary uppercase tracking-wider mb-1">
                        {eli5Mode ? "✨ AI Recommended Fix" : "System Recommendation"}
                      </p>
                      <p className="text-sm text-white font-semibold">{report.recommended_mitigation?.method}</p>
                      <p className="text-xs text-primary/80 mt-1">{report.recommended_mitigation?.reason}</p>
                    </div>

                    <select
                      value={mitigationMethod}
                      onChange={(e) => setMitigationMethod(e.target.value)}
                      className="w-full border border-white/10 bg-black/40 px-4 py-3 text-sm text-white mb-6"
                    >
                      <option value="ThresholdOptimizer">
                        {eli5Mode ? "Threshold Optimizer (adjusts pass/fail cutoffs)" : "ThresholdOptimizer (Post-processing)"}
                      </option>
                      <option value="ExponentiatedGradient">
                        {eli5Mode ? "Exponentiated Gradient (retrains with fairness rules)" : "ExponentiatedGradient (In-processing)"}
                      </option>
                      <option value="Reweighing">
                        {eli5Mode ? "Reweighing (balances training data importance)" : "Reweighing (Pre-processing)"}
                      </option>
                    </select>

                    <Button onClick={onMitigate} disabled={isMitigating} className="w-full bg-primary text-black">
                      {isMitigating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
                      {isMitigating
                        ? eli5Mode ? "Fixing the AI..." : "Applying algorithm..."
                        : eli5Mode ? "Apply Bias Fix" : "Execute Mitigation Wrapper"
                      }
                    </Button>
                  </div>

                  {mitigationResult && (
                    <div className="card-glow p-6 border-primary/30">
                      <h3 className="text-lg font-semibold text-primary mb-4 flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5" />
                        {eli5Mode ? "Bias Fix Applied! ✅" : "Mitigation Complete"}
                      </h3>
                      
                      <div className="space-y-4">
                        <div className="flex justify-between items-center py-2 border-b border-white/10">
                          <span className="text-sm text-muted-foreground">{eli5Mode ? "Result" : "Status"}</span>
                          <span className="text-sm font-semibold text-white">{mitigationResult.summary.verdict}</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-white/10">
                          <span className="text-sm text-muted-foreground">
                            {eli5Mode ? "Bias reduced by" : "DPD Reduction"}
                          </span>
                          <span className="text-sm font-semibold text-primary">-{mitigationResult.dpd_reduction_pct}%</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-white/10">
                          <span className="text-sm text-muted-foreground">
                            {eli5Mode ? "Opportunity gap fixed by" : "EOD Reduction"}
                          </span>
                          <span className="text-sm font-semibold text-primary">-{mitigationResult.eod_reduction_pct}%</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-white/10">
                          <span className="text-sm text-muted-foreground">
                            {eli5Mode ? "Accuracy before fix" : "Original Accuracy"}
                          </span>
                          <span className="text-sm text-white">{(mitigationResult.accuracy_before * 100).toFixed(1)}%</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-white/10">
                          <span className="text-sm text-muted-foreground">
                            {eli5Mode ? "Accuracy after fix" : "Wrapped Accuracy"}
                          </span>
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
                          <a href={withAuthToken(`${API_URL}/fairsight/download-model/${sessionId}`)} download>
                            <Download className="mr-2 h-4 w-4" />
                            {eli5Mode ? "Download Fixed Model" : "Download Wrapped Model"}
                          </a>
                        </Button>
                        <Button 
                          asChild
                          variant="outline" 
                          className="flex-1 border-secondary/50 text-white hover:bg-secondary/20"
                        >
                          <a href={withAuthToken(`${API_URL}/fairsight/download-report/${sessionId}`)} download>
                            <Download className="mr-2 h-4 w-4" />
                            {eli5Mode ? "Download Report" : "Export Report (JSON)"}
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
                <h3 className="text-xl font-bold text-white mb-2">
                  {eli5Mode ? "Great News — Your AI Is Fair! 🎉" : "Model Operating Within Fair Parameters"}
                </h3>
                <p className="text-muted-foreground max-w-lg mx-auto mb-6">
                  {eli5Mode
                    ? "Your AI model treats different groups of people equally. No bias fix is needed right now."
                    : "The current model architecture does not exhibit significant bias against the tested properties. No downstream mitigation wrapper is required at this time."
                  }
                </p>
                <Button 
                  asChild
                  variant="outline" 
                  className="border-primary/50 text-white hover:bg-primary/20"
                >
                  <a href={withAuthToken(`${API_URL}/fairsight/download-report/${sessionId}`)} download>
                    <Download className="mr-2 h-4 w-4" />
                    {eli5Mode ? "Download Fairness Report" : "Export Verification Report"}
                  </a>
                </Button>
              </div>
            )}

            {/* Cross-Navigation */}
            <div className="grid gap-4 sm:grid-cols-3 mt-8 animate-in fade-in slide-in-from-bottom-8">
              <Link to="/model-explainability" className="card-glow p-5 hover:border-primary/40 transition-all group cursor-pointer">
                <div className="flex items-center justify-between mb-2">
                  <Brain className="h-5 w-5 text-primary" />
                  <ArrowRight className="h-4 w-4 text-primary opacity-0 group-hover:opacity-100 transition" />
                </div>
                <h3 className="font-bold text-white text-sm">{eli5Mode ? "Why Did It Decide That?" : "Explainability"}</h3>
                <p className="text-xs text-muted-foreground mt-1">{eli5Mode ? "See which features matter most" : "Feature importance analysis"}</p>
              </Link>
              <Link to="/model-metrics" className="card-glow p-5 hover:border-primary/40 transition-all group cursor-pointer">
                <div className="flex items-center justify-between mb-2">
                  <Shield className="h-5 w-5 text-primary" />
                  <ArrowRight className="h-4 w-4 text-primary opacity-0 group-hover:opacity-100 transition" />
                </div>
                <h3 className="font-bold text-white text-sm">{eli5Mode ? "Fairness Numbers" : "Fairness Metrics"}</h3>
                <p className="text-xs text-muted-foreground mt-1">{eli5Mode ? "Detailed per-group scores" : "DPD, EOD, Disparate Impact"}</p>
              </Link>
              <Link to="/model-dashboard" className="card-glow p-5 hover:border-primary/40 transition-all group cursor-pointer">
                <div className="flex items-center justify-between mb-2">
                  <BarChart3 className="h-5 w-5 text-primary" />
                  <ArrowRight className="h-4 w-4 text-primary opacity-0 group-hover:opacity-100 transition" />
                </div>
                <h3 className="font-bold text-white text-sm">{eli5Mode ? "All My Models" : "Model Dashboard"}</h3>
                <p className="text-xs text-muted-foreground mt-1">{eli5Mode ? "See all audit history" : "Full audit history overview"}</p>
              </Link>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

function MetricCard({ title, value, threshold, severity, termKey, eli5Desc }: { title: string, value: string, threshold?: string, severity?: string, termKey?: string, eli5Desc?: string }) {
  const isHigh = severity === 'high' || severity === 'severe';
  return (
    <div className={`card-glow p-5 flex flex-col justify-between ${isHigh ? 'border-red-500/30 bg-red-500/5' : ''}`}>
      <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground flex items-center gap-1">
        {termKey ? <ELI5Tooltip term={termKey}>{title}</ELI5Tooltip> : title}
      </p>
      <p className={`mt-3 text-3xl font-semibold ${isHigh ? 'text-red-400' : 'text-white'}`}>{value}</p>
      {threshold && (
        <p className="mt-2 text-xs text-muted-foreground">
          {eli5Desc || `Thresh: <${threshold}`}
        </p>
      )}
      {!threshold && eli5Desc && (
        <p className="mt-2 text-xs text-muted-foreground">{eli5Desc}</p>
      )}
    </div>
  );
}
