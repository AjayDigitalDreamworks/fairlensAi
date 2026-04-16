"use client";

import Layout from "@/components/Layout";
import { Brain, Layers, Search, BarChart3, Loader2, ArrowRight, Zap, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip } from "recharts";
import { useState, useEffect, useMemo } from "react";
import { apiFetch } from "@/lib/auth";
import { Link } from "react-router-dom";
import BiasBeforeAfter, { BiasSlice } from "@/components/BiasBeforeAfter";
import { ELI5ModeToggle, ELI5Tooltip, TermBadge } from "@/components/ELI5Tooltip";

const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:4000/api/v1").replace(/\/$/, "");

export default function ModelExplainabilityPage() {
  const [loading, setLoading] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);
  const [shapData, setShapData] = useState<{feature: string, importance: number}[]>([]);
  const [latestModel, setLatestModel] = useState<string>("Unknown");
  const [eli5Mode, setEli5Mode] = useState(false);
  const [historyItems, setHistoryItems] = useState<any[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);

  // Fetch the latest history to see if there is a model we can auto-analyze
  useEffect(() => {
    async function checkLatest() {
      try {
        const res = await apiFetch(`${API_URL}/fairsight/history`);
        if (res.ok) {
          const data = await res.json();
          if (data.items && data.items.length > 0) {
            setHistoryItems(data.items);
            setLatestModel(data.items[0].modelName || "Latest Upload");
          }
        }
      } catch (err) {
        // ignore
      }
    }
    checkLatest();
  }, []);

  const selectedItem = historyItems[selectedIdx] ?? null;

  async function analyzeLatest() {
    setLoading(true);
    try {
      // Step 1: Get the latest session from history
      const histRes = await apiFetch(`${API_URL}/fairsight/history`);
      if (!histRes.ok) throw new Error("Could not fetch history");
      const histData = await histRes.json();
      
      if (!histData.items || histData.items.length === 0) {
        alert(eli5Mode
          ? "No AI models found. Please upload and check a model first."
          : "No models found in database. Please upload and analyze a model first.");
        setLoading(false);
        return;
      }
      
      const target = histData.items[selectedIdx] || histData.items[0];
      setLatestModel(target.modelName);

      // Step 2: Request explainability for this session
      const explainRes = await apiFetch(`${API_URL}/fairsight/explain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: target.sessionId,
          label_col: target.labelCol,
          sensitive_col: target.sensitiveCol,
        }),
      });

      if (!explainRes.ok) throw new Error("Server rejected explainability request. Note: Temporary sessions reset if the server restarts.");
      
      const explainData = await explainRes.json();
      setShapData(explainData.global_feature_importance || []);
      setAnalyzed(true);
    } catch (err: any) {
      alert(eli5Mode
        ? "Could not analyze the model. Make sure the backend is running and you've uploaded a model recently. " + err.message
        : "Failed to analyze. Ensure the ml-service is running and you have uploaded a model recently without restarting it. " + err.message);
    } finally {
      setLoading(false);
    }
  }

  // Build before/after bias slices for selected history item
  const biasSlices = useMemo<BiasSlice[]>(() => {
    if (!selectedItem?.detectReport) return [];
    const r = selectedItem.detectReport;
    const m = selectedItem.mitigationResult;
    const dpd = r.dpd ?? 0;
    const dpdAfter = m?.dpd_after ?? null;
    const groups: BiasSlice[] = (r.by_group || []).map((g: any) => ({
      attribute: String(g.group),
      originalScore: Math.min(100, Math.round((1 - Math.abs(dpd)) * 100)),
      correctedScore: dpdAfter !== null ? Math.min(100, Math.round((1 - Math.abs(dpdAfter)) * 100)) : null,
      originalDI: 1 - Math.abs(dpd),
      correctedDI: dpdAfter !== null ? (1 - Math.abs(dpdAfter)) : null,
      riskLevel: Math.abs(dpd) > 0.2 ? "high" : Math.abs(dpd) > 0.1 ? "medium" : "low",
    }));
    if (groups.length) return groups;
    return [
      {
        attribute: selectedItem.sensitiveCol || "sensitive_attribute",
        originalScore: Math.min(100, Math.round((1 - Math.abs(dpd)) * 100)),
        correctedScore: dpdAfter !== null ? Math.min(100, Math.round((1 - Math.abs(dpdAfter)) * 100)) : null,
        originalDI: 1 - Math.abs(dpd),
        correctedDI: dpdAfter !== null ? (1 - Math.abs(dpdAfter)) : null,
        riskLevel: Math.abs(dpd) > 0.2 ? "high" : Math.abs(dpd) > 0.1 ? "medium" : "low",
      },
    ];
  }, [selectedItem]);

  // Determine if the selected model's sensitive feature is in the SHAP list
  const sensitiveFeatureInShap = shapData.find(
    (d) => d.feature.toLowerCase() === (selectedItem?.sensitiveCol || "").toLowerCase()
  );

  return (
    <Layout>
      <div className="space-y-8 pb-10">
        <div className="card-glow group relative overflow-hidden p-8">
          <div className="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-primary via-secondary to-primary shadow-[0_0_15px_rgba(var(--theme-glow),0.3)]" />
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="mb-2 font-sans text-3xl font-bold tracking-tight text-white flex items-center gap-3">
                <Brain className="h-8 w-8 text-primary" />
                {eli5Mode ? "Why Did My AI Decide That?" : "Dynamic Model Explainability"}
              </h1>
              <p className="text-sm text-muted-foreground max-w-2xl">
                {eli5Mode
                  ? <>This page shows which inputs (features) your AI relies on most to make decisions. If a protected attribute like <b>{selectedItem?.sensitiveCol || "gender"}</b> ranks high, your AI may be discriminating.</>
                  : <>Understand how your model makes decisions using feature importance coefficients extracted directly from your <b>{latestModel}</b> build.</>
                }
              </p>
            </div>
            <div className="flex flex-col items-end gap-3">
              <ELI5ModeToggle enabled={eli5Mode} onToggle={() => setEli5Mode((v) => !v)} />
              <div className="flex gap-2">
                {historyItems.length > 1 && (
                  <select
                    value={selectedIdx}
                    onChange={(e) => setSelectedIdx(Number(e.target.value))}
                    className="border border-white/10 bg-black/30 px-3 py-2 text-xs text-white min-w-[200px]"
                  >
                    {historyItems.map((item, idx) => (
                      <option key={idx} value={idx}>
                        {item.modelName || `Audit ${idx + 1}`} — {new Date(item.createdAt || Date.now()).toLocaleDateString()}
                      </option>
                    ))}
                  </select>
                )}
                <Button onClick={analyzeLatest} disabled={loading} className="bg-primary text-black hover:bg-primary/90 shadow-[0_0_15px_rgba(var(--theme-glow),0.3)]">
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                  {loading
                    ? eli5Mode ? "Analyzing..." : "Extracting Matrix..."
                    : eli5Mode ? "Show Me Why" : "Extract Live Weights"
                  }
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Global Feature Importance */}
          <div className="card-glow flex flex-col rounded-xl p-6 min-h-[400px]">
            <div className="mb-6">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-white flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary" />
                <ELI5Tooltip term="Feature Importance">
                  {eli5Mode ? "Which Inputs Matter Most?" : "Global Feature Importance"}
                </ELI5Tooltip>
                <TermBadge term="SHAP" />
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {eli5Mode
                  ? "The taller the bar, the more the AI relies on that input to make decisions. If a protected attribute (like race or gender) is tall, that's a red flag."
                  : "Overall mathematical impact of features extracted from your PKL bundle."
                }
              </p>
            </div>
            <div className="flex-1 flex items-center justify-center">
              {!analyzed && !loading && (
                <p className="text-muted-foreground text-sm italic">
                  {eli5Mode ? "Click \"Show Me Why\" above to see which factors your AI cares about most." : "Click \"Extract Live Weights\" to calculate properties."}
                </p>
              )}
              {loading && (
                <Loader2 className="h-8 w-8 text-primary animate-spin" />
              )}
              {analyzed && shapData.length > 0 && (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={shapData} layout="vertical" margin={{ top: 0, right: 30, left: 60, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="rgba(255,255,255,0.05)" />
                    <XAxis type="number" stroke="rgba(255,255,255,0.3)" tick={{fill: "rgba(255,255,255,0.5)", fontSize: 12}} />
                    <YAxis type="category" dataKey="feature" stroke="rgba(255,255,255,0.3)" tick={{fill: "rgba(255,255,255,0.8)", fontSize: 12}} />
                    <Tooltip cursor={{fill: "rgba(255,255,255,0.05)"}} contentStyle={{ backgroundColor: "#000", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px" }} />
                    <Bar dataKey="importance" fill="var(--chart-primary)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
              {analyzed && shapData.length === 0 && (
                <p className="text-muted-foreground text-sm italic">
                  {eli5Mode ? "Your AI model didn't expose readable decision factors." : "Model does not expose readable feature properties."}
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-4">
            <div className={`card-glow flex flex-col rounded-xl p-6 transition-all duration-500 ${analyzed ? 'border-primary/20' : ''}`}>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-white mb-2 flex items-center gap-2">
                <ELI5Tooltip term="Proxy Feature">
                  {eli5Mode ? "What's Really Driving Decisions?" : "Dependence Interpretation"}
                </ELI5Tooltip>
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                {eli5Mode
                  ? "We check if a protected attribute (like race or gender) is secretly influencing the AI's decisions through other variables."
                  : "Algorithm insights based on the mathematical isolation of individual variables."
                }
              </p>
              <div className="flex flex-col p-6 border border-white/5 bg-black/20 rounded-md flex-1 text-muted-foreground text-sm gap-2">
                {analyzed && shapData.length > 0 ? (
                  <>
                    <p className="text-white font-medium">
                      {eli5Mode ? "Main Decision Factor: " : "Primary Driver: "}
                      <span className="text-primary">{shapData[0]?.feature.toUpperCase()}</span>
                    </p>
                    <p>
                      {eli5Mode
                        ? <>Your AI mainly looks at <strong className="text-white">{shapData[0]?.feature}</strong> to decide outcomes — it accounts for {(shapData[0]?.importance * 100).toFixed(1)}% of its reasoning.</>
                        : <>The model heavily biases outcome predictions on the <strong className="text-white">{shapData[0]?.feature}</strong> metric with a normalized weight of {(shapData[0]?.importance * 100).toFixed(1)}%.</>
                      }
                    </p>
                    {shapData.length > 1 && (
                      <p>
                        {eli5Mode
                          ? <>Second most influential: <strong className="text-white">{shapData[1]?.feature}</strong> ({(shapData[1]?.importance * 100).toFixed(1)}%). If this input is related to a protected group, it could be acting as a hidden stand-in for discrimination.</>
                          : <>Secondary influence comes from <strong className="text-white">{shapData[1]?.feature}</strong> ({(shapData[1]?.importance * 100).toFixed(1)}%). Review these parameters closely if disparities correspond with sensitive attributes.</>
                        }
                      </p>
                    )}
                    {sensitiveFeatureInShap && (
                      <div className="mt-3 p-3 rounded-lg border border-red-500/30 bg-red-500/5">
                        <p className="text-red-300 text-xs font-semibold uppercase tracking-wider mb-1">
                          {eli5Mode ? "⚠️ Warning: Protected Attribute Detected!" : "⚠️ Proxy Alert"}
                        </p>
                        <p className="text-red-300/80 text-xs">
                          {eli5Mode
                            ? `Your AI is directly using "${selectedItem?.sensitiveCol}" to make decisions. This is likely illegal discrimination.`
                            : `The sensitive attribute "${selectedItem?.sensitiveCol}" appears in the feature importance ranking with weight ${(sensitiveFeatureInShap.importance * 100).toFixed(1)}%.`
                          }
                        </p>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-center italic mt-4">
                    {eli5Mode ? "Upload your model and click \"Show Me Why\" to see decision drivers." : "Awaiting live extraction..."}
                  </p>
                )}
              </div>
            </div>
            <div className="card-glow flex flex-col rounded-xl p-6">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-white mb-2 flex items-center gap-2">
                <Layers className="w-4 h-4 text-primary" />
                {eli5Mode ? "What's Inside the AI?" : "Architecture Mapping"}
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                {eli5Mode
                  ? "Deep details about how your AI model is structured internally."
                  : "Internal matrix routing information for deeper decision structures (like Random Forests or DNNs)."
                }
              </p>
              <Button disabled={!analyzed} variant="outline" className="w-full border-primary/30 text-primary hover:bg-primary/10 transition-colors">
                {analyzed
                  ? eli5Mode ? 'See Full Technical Details' : 'Open Weight Mapping (PDF)'
                  : eli5Mode ? 'Run Analysis First' : 'Locked'
                }
              </Button>
            </div>
          </div>
        </div>

        {/* Before/After Bias Visualization */}
        {biasSlices.length > 0 && (
          <section className="card-glow p-8 animate-in fade-in slide-in-from-bottom-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Shield className="h-5 w-5 text-primary" />
                  {eli5Mode ? "How Fair Is This Model?" : "Bias Before vs After Mitigation"}
                  <TermBadge term="Disparate Impact" />
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {eli5Mode
                    ? "See how fair the model is now, and how much fairer it became after the repair (if applied)."
                    : "Fairness scores for the selected model before and after mitigation was applied."
                  }
                </p>
              </div>
              <Link
                to="/model-mitigation"
                className="flex items-center gap-1.5 border border-primary/20 bg-primary/5 px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest text-primary hover:bg-primary/10 transition"
              >
                {eli5Mode ? "Fix This AI →" : "Run Mitigation →"}
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {eli5Mode && (
              <p className="mb-4 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-2 text-sm text-amber-300/80">
                📖 <strong>ELI5:</strong> Faded bars = how unfair the AI was before. Bright bars = how fair it became after the repair. Green bars (80%+) = fair. Red = needs more work.
              </p>
            )}
            <BiasBeforeAfter
              slices={biasSlices}
              title={eli5Mode ? "Model Fairness: Before vs After Fix" : "Fairness by Group: Before vs After Mitigation"}
              subtitle={
                selectedItem?.mitigationResult
                  ? eli5Mode
                    ? `Repair applied: ${selectedItem.mitigationResult.method || "fairness algorithm"}`
                    : `Mitigation applied: ${selectedItem.mitigationResult.method || "N/A"}`
                  : eli5Mode
                  ? "No repair applied yet. Go to Model Mitigation to fix bias."
                  : "Run mitigation from the Model Mitigation page to see corrected values."
              }
              showDI={!eli5Mode}
              showDP={false}
              compact
            />
          </section>
        )}

        {/* Cross-navigation */}
        <div className="grid gap-4 sm:grid-cols-3 animate-in fade-in slide-in-from-bottom-6">
          <Link
            to="/model-metrics"
            className="card-glow p-5 hover:border-primary/40 transition-all group cursor-pointer"
          >
            <div className="flex items-center justify-between mb-2">
              <Shield className="h-5 w-5 text-primary" />
              <ArrowRight className="h-4 w-4 text-primary opacity-0 group-hover:opacity-100 transition" />
            </div>
            <h3 className="font-bold text-white text-sm">{eli5Mode ? "See Fairness Numbers" : "Fairness Metrics"}</h3>
            <p className="text-xs text-muted-foreground mt-1">
              {eli5Mode ? "Detailed fairness scores per group" : "DPD, EOD, Disparate Impact analysis"}
            </p>
          </Link>
          <Link
            to="/model-mitigation"
            className="card-glow p-5 hover:border-primary/40 transition-all group cursor-pointer"
          >
            <div className="flex items-center justify-between mb-2">
              <Zap className="h-5 w-5 text-primary" />
              <ArrowRight className="h-4 w-4 text-primary opacity-0 group-hover:opacity-100 transition" />
            </div>
            <h3 className="font-bold text-white text-sm">{eli5Mode ? "Fix Bias Now" : "Mitigation Toolkit"}</h3>
            <p className="text-xs text-muted-foreground mt-1">
              {eli5Mode ? "Apply fairness repairs to your model" : "Apply ThresholdOptimizer / AIF360 wrappers"}
            </p>
          </Link>
          <Link
            to="/model-dashboard"
            className="card-glow p-5 hover:border-primary/40 transition-all group cursor-pointer"
          >
            <div className="flex items-center justify-between mb-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              <ArrowRight className="h-4 w-4 text-primary opacity-0 group-hover:opacity-100 transition" />
            </div>
            <h3 className="font-bold text-white text-sm">{eli5Mode ? "All My Models" : "Model Dashboard"}</h3>
            <p className="text-xs text-muted-foreground mt-1">
              {eli5Mode ? "Overview of all model audits" : "Full model audit history overview"}
            </p>
          </Link>
        </div>
      </div>
    </Layout>
  );
}
